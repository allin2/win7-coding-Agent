"""F27 runtime boundary tests for persistent EventStore append failures."""

from __future__ import print_function

import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from unittest import mock

from win7_agent.cli.__main__ import main
from win7_agent.models import FinishReason, MockProvider, ModelResponse, ToolCall, Usage
from win7_agent.policy import PermissionType
from win7_agent.runtime.runner import AgentRunner
from win7_agent.runtime.state import RunFailure
from win7_agent.storage import EventStoreError
from win7_agent.tools import build_readonly_registry
from win7_agent.tools.contracts import ToolSpec


class PersistentAppendFailureStore(object):
    """A Run can establish, but every necessary event append then fails."""

    def __init__(self, unused_path=None):
        self.run_id = None
        self.append_calls = []
        self.update_calls = []

    def create_run(self, run_id):
        self.run_id = run_id

    def append(self, run_id, event_type, payload):
        self.append_calls.append((run_id, event_type, payload))
        raise EventStoreError("append unavailable")

    def update_run(self, run_id, status, trace_complete):
        self.update_calls.append((run_id, status, trace_complete))

    def events_for_run(self, unused_run_id):
        return []

    def close(self):
        pass


class AgentRunnerEventStoreTests(unittest.TestCase):
    """Exercise the Stage 2 EventStore failure contract without storage changes."""

    def _workspace(self):
        return os.path.abspath(os.path.join(
            os.path.dirname(__file__), "..", "..", "fixtures", "sample_project"))

    def test_f27_persistent_append_failure_stays_structured_in_memory(self):
        store = PersistentAppendFailureStore()
        result = AgentRunner(self._workspace(), MockProvider(), store).run(
            "Find target_function.")
        self.assertEqual("FAILED", result.status)
        self.assertFalse(result.trace_complete)
        self.assertEqual("EVENT_STORE_FAILED", result.error["code"])
        self.assertTrue(all(
            item["code"] == "EVENT_STORE_FAILED" for item in result.errors))
        self.assertGreaterEqual(len(result.errors), 2)
        self.assertEqual(
            ["state.transition", "state.transition", "run.final"],
            [item[1] for item in store.append_calls])
        self.assertEqual("FAILED", store.update_calls[-1][1])
        self.assertFalse(store.update_calls[-1][2])

    def test_f27_cli_returns_one_and_keeps_result_without_traceback(self):
        created = []

        def make_store(path):
            store = PersistentAppendFailureStore(path)
            created.append(store)
            return store

        with tempfile.TemporaryDirectory() as directory:
            output = io.StringIO()
            errors = io.StringIO()
            with mock.patch("win7_agent.cli.__main__.EventStore", side_effect=make_store):
                with redirect_stdout(output), redirect_stderr(errors):
                    code = main([
                        "analyze", "--workspace", self._workspace(),
                        "--task", "Find target_function.",
                        "--events", os.path.join(directory, "events.sqlite")])
        self.assertEqual(1, code)
        self.assertIn("RESULT status=FAILED trace_complete=false", output.getvalue())
        self.assertNotIn("Traceback", output.getvalue() + errors.getvalue())
        self.assertEqual(1, len(created))

    def test_f28_finalization_failure_preserves_completed_business_result(self):
        from win7_agent.storage import EventStore

        class FinalizationFailureStore(EventStore):
            def append(self, run_id, event_type, payload):
                if event_type == "run.final":
                    raise EventStoreError("finalization unavailable")
                return EventStore.append(self, run_id, event_type, payload)

        with tempfile.TemporaryDirectory() as directory:
            store = FinalizationFailureStore(os.path.join(directory, "events.sqlite"))
            result = AgentRunner(self._workspace(), MockProvider(), store).run("Find target_function.")
            store.close()
        self.assertEqual("COMPLETED", result.status)
        self.assertFalse(result.trace_complete)

    def test_r12_non_replay_run_failure_keeps_its_real_error_code(self):
        class FailingProvider(object):
            def respond(self, unused_request):
                raise RunFailure("UNEXPECTED", "local runtime failure")

        from win7_agent.storage import EventStore
        with tempfile.TemporaryDirectory() as directory:
            store = EventStore(os.path.join(directory, "events.sqlite"))
            result = AgentRunner(self._workspace(), FailingProvider(), store).run("inspect")
            store.close()
        self.assertEqual("FAILED", result.status)
        self.assertTrue(any(item["code"] == "UNEXPECTED" for item in result.errors))
        self.assertFalse(any(item["code"] == "REPLAY_MISMATCH" for item in result.errors))

    def test_f01_verification_rejection_retries_then_completes(self):
        class RetryProvider(object):
            def __init__(self):
                self.index = 0

            def respond(self, unused_request):
                responses = [
                    ModelResponse("no usable evidence", [], FinishReason.STOP, Usage()),
                    ModelResponse("", [ToolCall(
                        "read", "search_text", {"pattern": "target_function"})],
                        FinishReason.TOOL_CALLS, Usage()),
                    ModelResponse(
                        "Found target_function in code.py:1", [],
                        FinishReason.STOP, Usage())]
                response = responses[self.index]
                self.index += 1
                return response

        from win7_agent.storage import EventStore
        with tempfile.TemporaryDirectory() as directory:
            store = EventStore(os.path.join(directory, "events.sqlite"))
            result = AgentRunner(self._workspace(), RetryProvider(), store, max_turns=3).run("inspect")
            transitions = [event["payload"] for event in store.events_for_run(result.run_id)
                           if event["type"] == "state.transition"]
            store.close()
        self.assertEqual("COMPLETED", result.status)
        self.assertTrue(any(item["from"] == "VERIFYING" and item["to"] == "EXECUTING"
                            for item in transitions))

    def test_f01_verification_rejection_fails_when_turn_budget_is_exhausted(self):
        class RejectingProvider(object):
            def respond(self, unused_request):
                return ModelResponse("no usable evidence", [], FinishReason.STOP, Usage())

        from win7_agent.storage import EventStore
        with tempfile.TemporaryDirectory() as directory:
            store = EventStore(os.path.join(directory, "events.sqlite"))
            result = AgentRunner(self._workspace(), RejectingProvider(), store, max_turns=2).run("inspect")
            store.close()
        self.assertEqual("FAILED", result.status)
        self.assertEqual(2, result.turns)
        self.assertTrue(any(item["code"] == "VERIFICATION_REJECTED" for item in result.errors))

    def test_f21_denied_observation_reaches_next_request_and_readonly_path_completes(self):
        class DenyThenReadProvider(object):
            def __init__(self):
                self.requests = []
                self.index = 0

            def respond(self, request):
                self.requests.append(request)
                responses = [
                    ModelResponse("", [ToolCall("deny", "blocked", {})],
                                  FinishReason.TOOL_CALLS, Usage()),
                    ModelResponse("", [ToolCall(
                        "read", "search_text", {"pattern": "target_function"})],
                        FinishReason.TOOL_CALLS, Usage()),
                    ModelResponse("Found target_function in code.py:1", [],
                                  FinishReason.STOP, Usage())]
                response = responses[self.index]
                self.index += 1
                return response

        calls = []

        def registry_with_denied_tool(workspace):
            registry = build_readonly_registry(workspace)
            registry.register(ToolSpec(
                "blocked", "denied test tool", {}, PermissionType.WORKSPACE_WRITE),
                lambda request: calls.append(request))
            return registry

        from win7_agent.storage import EventStore
        provider = DenyThenReadProvider()
        with tempfile.TemporaryDirectory() as directory:
            store = EventStore(os.path.join(directory, "events.sqlite"))
            with mock.patch("win7_agent.runtime.runner.build_readonly_registry",
                            side_effect=registry_with_denied_tool):
                result = AgentRunner(self._workspace(), provider, store, max_turns=3).run("inspect")
            events = store.events_for_run(result.run_id)
            store.close()
        observations = [message.content for message in provider.requests[1].messages
                        if message.role == "tool"]
        self.assertEqual("COMPLETED", result.status)
        self.assertEqual([], calls)
        self.assertEqual(2, result.tool_calls)
        self.assertEqual("DENIED", json.loads(observations[-1])["status"])
        self.assertTrue(any(event["type"] == "tool.denied" for event in events))
