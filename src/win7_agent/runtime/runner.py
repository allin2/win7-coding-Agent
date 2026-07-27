"""The sole orchestration path for the constrained prototype agent loop."""

import uuid
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from win7_agent.context import ContextCompiler
from win7_agent.models import ModelProvider, ReplayMismatch, ToolResultMessage, request_fingerprint
from win7_agent.policy import PermissionType, PolicyEngine
from win7_agent.storage import EventStore, EventStoreError
from win7_agent.tools import ToolRequest, ToolRuntime, build_readonly_registry
from win7_agent.verification import VerificationEngine
from win7_agent.workspace import WorkspaceContext

from .state import RunController, RunStatus, RuntimeErrorInfo


@dataclass(frozen=True)
class RunResult:
    run_id: str
    status: RunStatus
    final_text: str
    turns: int
    tool_calls: int
    errors: List[Dict[str, str]]

    def to_dict(self) -> Dict[str, Any]:
        return {"run_id": self.run_id, "status": self.status.value, "final_text": self.final_text, "turns": self.turns, "tool_calls": self.tool_calls, "errors": list(self.errors)}


class PrototypeRuntime:
    """Runtime-owned state, policy, auditing and verification for one Run."""

    def __init__(self, workspace: WorkspaceContext, task: str, provider: ModelProvider, store: EventStore, max_turns: int = 8, max_tool_calls: int = 16, run_id: Optional[str] = None) -> None:
        self._workspace = workspace
        self._task = task
        self._provider = provider
        self._store = store
        self._run_id = run_id or uuid.uuid4().hex
        self._controller = RunController(self._run_id, max_turns, max_tool_calls, self._record)
        self._registry = build_readonly_registry(workspace)
        self._tools = ToolRuntime(workspace, self._registry)
        self._policy = PolicyEngine()
        self._compiler = ContextCompiler(workspace, self._registry.specs())
        self._verification = VerificationEngine()

    @property
    def controller(self) -> RunController:
        return self._controller

    def run(self) -> RunResult:
        final_text = ""
        self._store.create_run(self._run_id, self._workspace.root, self._task)
        state = self._controller.state.snapshot()
        self._record("run.created", {"workspace": self._workspace.root, "task": self._task[:16384], "max_turns": state["max_turns"], "max_tool_calls": state["max_tool_calls"], "provider_type": self._provider.__class__.__name__})
        recent_results = []  # type: List[ToolResultMessage]
        try:
            self._controller.transition(RunStatus.DISCOVERING, "workspace context constructed")
            self._controller.transition(RunStatus.PLANNING, "workspace discovery complete")
            while True:
                self._controller.start_turn()
                request = self._compiler.compile(self._task, self._controller.state.snapshot(), recent_results)
                self._record("model.request", {"turn": request.turn, "message_count": len(request.messages), "role_char_counts": {message.role: len(message.content) for message in request.messages}, "tool_count": len(request.tools), "request_fingerprint": request_fingerprint(request)})
                response = self._provider.generate(request)
                self._record("model.response", response.to_dict())
                if response.tool_calls:
                    self._controller.transition(RunStatus.EXECUTING, "model requested tools")
                    for call in response.tool_calls:
                        self._controller.reserve_tool_call()
                        tool_request = ToolRequest(call.tool_call_id, call.tool_name, call.arguments, self._run_id)
                        self._record("tool.requested", tool_request.to_dict())
                        entry = self._registry.lookup(call.tool_name)
                        if entry is None:
                            result_message = ToolResultMessage(call.tool_call_id, "error", "", False, {"code": "TOOL_NOT_FOUND", "message": "tool is not registered"})
                            self._record("tool.result", {"tool_call_id": call.tool_call_id, "tool_name": call.tool_name, "status": "error", "executed": False, "content": "", "truncated": False, "error": result_message.error, "duration_ms": 0})
                            recent_results.append(result_message)
                            continue
                        permission = PermissionType(entry[0].permission)
                        decision = self._policy.evaluate(permission)
                        decision_payload = decision.to_dict()
                        decision_payload["tool_call_id"] = call.tool_call_id
                        self._record("policy.decision", decision_payload)
                        if decision.decision == "DENY":
                            result_message = ToolResultMessage(call.tool_call_id, "error", "", False, {"code": "PERMISSION_DENIED", "message": decision.reason})
                            self._record("tool.denied", {"tool_call_id": call.tool_call_id, "tool_name": call.tool_name, "permission": decision.permission.value, "reason": decision.reason})
                        else:
                            result = self._tools.execute(tool_request)
                            result_message = ToolResultMessage(result.tool_call_id, result.status, result.content, result.truncated, result.error)
                            result_payload = result.to_dict()
                            result_payload["tool_name"] = call.tool_name
                            self._record("tool.result", result_payload)
                        recent_results.append(result_message)
                    self._controller.transition(RunStatus.PLANNING, "tool results returned")
                    continue
                final_text = response.content
                self._controller.transition(RunStatus.VERIFYING, "model returned final text")
                _, trace = self._store.load_run(self._run_id)
                verification_results, completion = self._verification.verify(self._controller.state.snapshot(), trace, final_text)
                self._record("verification.result", {"results": [result.to_dict() for result in verification_results], "completion": completion.to_dict()})
                if completion.decision == "COMPLETE":
                    self._controller.complete("verification complete")
                else:
                    self._controller.fail("VERIFICATION_REJECTED", "; ".join(completion.reasons))
                break
        except EventStoreError as error:
            self._force_store_failure(error)
        except (RuntimeErrorInfo, ReplayMismatch) as error:
            if self._controller.state.status not in (RunStatus.FAILED, RunStatus.CANCELLED):
                self._controller.fail(error.code, error.message)
        except Exception as error:
            self._controller.fail("UNEXPECTED", str(error))
        state = self._controller.state.snapshot()
        self._best_effort_finalize(final_text)
        state = self._controller.state.snapshot()
        return RunResult(self._run_id, RunStatus(state["status"]), final_text, state["turn_count"], state["tool_call_count"], state["errors"])

    def _record(self, event_type: str, payload: Dict[str, Any]) -> None:
        self._store.append_event(self._run_id, event_type, payload)

    def _force_store_failure(self, error: EventStoreError) -> None:
        state = self._controller._state
        if state._status not in (RunStatus.FAILED, RunStatus.CANCELLED, RunStatus.COMPLETED):
            state._errors.append({"code": "EVENT_STORE_FAILED", "message": str(error)})
            state._status = RunStatus.FAILED

    def _best_effort_finalize(self, final_text: str) -> None:
        state = self._controller.state.snapshot()
        try:
            self._record("run.final", {"status": state["status"], "final_text": final_text, "turns": state["turn_count"], "tool_calls": state["tool_call_count"], "errors": state["errors"]})
        except EventStoreError:
            pass
        try:
            self._store.finalize_run(self._run_id, state["status"])
        except EventStoreError:
            pass
