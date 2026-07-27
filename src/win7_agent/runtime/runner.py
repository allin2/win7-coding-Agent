"""The formal single-run read-only agent orchestration loop."""

import uuid

from win7_agent.context import compile_request
from win7_agent.models import ProviderError, ToolRequest, request_fingerprint
from win7_agent.policy import PolicyEngine
from win7_agent.storage import EventStoreError
from win7_agent.tools import ToolRuntime, build_readonly_registry
from win7_agent.verification import VerificationEngine
from win7_agent.workspace import WorkspaceContext

from .state import RunCancelled, RunController, RunFailure, RunStatus


class RunResult(object):
    def __init__(self, status, trace_complete, turns, tool_calls, error=None, run_id=None):
        self.status = status
        self.trace_complete = trace_complete
        self.turns = turns
        self.tool_calls = tool_calls
        self.error = error
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
                record("model.response", {"finish_reason": response.finish_reason.value,
                                          "tool_calls": [item.to_dict() for item in response.tool_calls]})
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
                    continue
                final_content = response.content
                controller.transition(RunStatus.VERIFYING, "provider stop")
                decision = VerificationEngine().verify(final_content, self.store.events_for_run(run_id))
                record("verification.result", {"accepted": decision.completed})
                if decision.completed:
                    controller.complete_after_verification("verification passed")
                else:
                    controller.fail("VERIFICATION_REJECTED", "verification rejected")
                break
        except RunCancelled:
            pass
        except EventStoreError:
            trace_complete = False
            if controller.state.status not in (RunStatus.FAILED, RunStatus.CANCELLED):
                controller.fail("EVENT_STORE_FAILED", "event store failure")
        except (RunFailure, ProviderError):
            if controller.state.status not in (RunStatus.FAILED, RunStatus.CANCELLED):
                controller.fail("REPLAY_MISMATCH", "provider or event failure")
        status = controller.state.status.value
        try:
            self.store.update_run(run_id, status, trace_complete)
            self.store.append(run_id, "run.final", {"status": status, "trace_complete": trace_complete})
        except EventStoreError:
            trace_complete = False
        return RunResult(status, trace_complete, controller.state.turn_count,
                         controller.state.tool_call_count, run_id=run_id)
