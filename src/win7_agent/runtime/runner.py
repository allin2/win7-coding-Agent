"""The formal single-run read-only agent orchestration loop."""

import json
import uuid

from win7_agent.context import compile_request
from win7_agent.models import ProviderError, ToolRequest, request_fingerprint
from win7_agent.policy import PolicyEngine
from win7_agent.storage import EventStoreError
from win7_agent.storage.event_store import MAX_PAYLOAD_BYTES
from win7_agent.tools import ToolRuntime, build_readonly_registry
from win7_agent.verification import VerificationEngine
from win7_agent.workspace import WorkspaceContext

from .state import RunCancelled, RunController, RunFailure, RunStatus


class RunResult(object):
    def __init__(self, status, trace_complete, turns, tool_calls, error=None,
                 errors=None, run_id=None):
        self.status = status
        self.trace_complete = trace_complete
        self.turns = turns
        self.tool_calls = tool_calls
        self.error = error
        self.errors = list(errors or [])
        self.run_id = run_id


class AgentRunner(object):
    def __init__(self, workspace_path, provider, store, max_turns=8, max_tool_calls=32):
        self.workspace = WorkspaceContext(workspace_path)
        self.provider = provider
        self.store = store
        self.max_turns = max_turns
        self.max_tool_calls = max_tool_calls

    def run(self, task):
        run_id = uuid.uuid4().hex
        try:
            self.store.create_run(run_id)
        except EventStoreError:
            return None
        trace_complete = True
        primary_error = None

        def record(kind, payload):
            nonlocal trace_complete
            try:
                self.store.append(run_id, kind, payload)
            except EventStoreError:
                trace_complete = False
                raise

        controller = RunController(run_id, self.max_turns, self.max_tool_calls, record)
        tools = build_readonly_registry(self.workspace)
        runtime = ToolRuntime(self.workspace, tools)
        policy = PolicyEngine()
        recent = []
        final_content = ""
        try:
            controller.transition(RunStatus.DISCOVERING, "workspace ready")
            controller.transition(RunStatus.PLANNING, "context compiled")
            while True:
                controller.start_turn()
                request = compile_request(task, [item.to_dict() for item in tools.specs()],
                                          controller.state.turn_count, recent_results=recent)
                record("model.request", {"turn": request.turn,
                                         "request_fingerprint": request_fingerprint(request)})
                response = self.provider.respond(request)
                response_payload = self._replay_response_payload(response)
                if response_payload is None:
                    controller.fail(
                        "UNEXPECTED",
                        "model response exceeds the replay event payload budget")
                    break
                record("model.response", response_payload)
                if controller.state.status == RunStatus.PLANNING:
                    controller.transition(RunStatus.EXECUTING, "first model response")
                if response.tool_calls:
                    for call in response.tool_calls:
                        controller.record_tool_attempt()
                        record("tool.requested", {"tool_call_id": call.tool_call_id, "name": call.name})
                        decision, result = runtime.dispatch(ToolRequest.from_call(call), policy, record)
                        if result is not None:
                            payload = result.to_dict()
                            payload["tool_call_id"] = call.tool_call_id
                            record("tool.result", payload)
                            recent.append(result.content)
                        elif decision is not None and decision.decision == "DENY":
                            recent.append(json.dumps({
                                "tool_call_id": call.tool_call_id,
                                "status": "DENIED",
                                "reason": decision.reason}, sort_keys=True,
                                separators=(",", ":"), ensure_ascii=True))
                    continue
                final_content = response.content
                controller.transition(RunStatus.VERIFYING, "provider stop")
                decision = VerificationEngine().verify(final_content, self.store.events_for_run(run_id))
                record("verification.result", {"accepted": decision.completed})
                if decision.completed:
                    controller.complete_after_verification("verification passed")
                    break
                if controller.state.turn_count < self.max_turns:
                    controller.transition(
                        RunStatus.EXECUTING,
                        "verification rejected; retry within turn budget")
                else:
                    controller.fail("VERIFICATION_REJECTED", "verification rejected")
                    break
        except RunCancelled:
            pass
        except EventStoreError:
            trace_complete = False
            primary_error = {
                "code": "EVENT_STORE_FAILED", "message": "event store failure"}
            audit_payload = controller.fail_after_event_store_error(
                primary_error["message"])
            if audit_payload is not None:
                try:
                    self.store.append(run_id, "state.transition", audit_payload)
                except EventStoreError:
                    controller.record_event_store_audit_failure(
                        "event store failure audit could not be persisted")
        except RunFailure as error:
            if controller.state.status not in (RunStatus.FAILED, RunStatus.CANCELLED):
                controller.fail(error.code, error.message)
        except ProviderError:
            if controller.state.status not in (RunStatus.FAILED, RunStatus.CANCELLED):
                controller.fail("REPLAY_MISMATCH", "provider or event failure")
        status = controller.state.status.value
        try:
            self.store.update_run(run_id, status, trace_complete)
            self.store.append(run_id, "run.final", {"status": status, "trace_complete": trace_complete})
        except EventStoreError:
            trace_complete = False
        return RunResult(status, trace_complete, controller.state.turn_count,
                         controller.state.tool_call_count, error=primary_error,
                         errors=controller.state.errors, run_id=run_id)

    @staticmethod
    def _replay_response_payload(response):
        """Return a complete replayable response, or reject an oversized one."""
        try:
            payload = response.to_dict()
            encoded = json.dumps(
                payload, sort_keys=True, separators=(",", ":"),
                ensure_ascii=True).encode("utf-8")
        except (TypeError, ValueError, UnicodeError):
            return None
        if len(encoded) > MAX_PAYLOAD_BYTES:
            return None
        return payload
