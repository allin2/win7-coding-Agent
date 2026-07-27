import os
import sqlite3
import shutil
import tempfile
import unittest
from unittest import mock

from win7_agent.models import FinishReason, MockProvider, ModelResponse, ReplayProvider, ToolCall
from win7_agent.runtime import PrototypeRuntime, RunStatus
from win7_agent.storage import EventStore
from win7_agent.tools import ToolSpec
from win7_agent.workspace import WorkspaceContext


FIXTURE = os.path.realpath(os.path.join(os.path.dirname(__file__), "..", "..", "fixtures", "sample_project"))


def snapshot(root):
    result = []
    for directory, _, files in os.walk(root):
        for name in sorted(files):
            path = os.path.join(directory, name)
            stat = os.stat(path)
            result.append((os.path.relpath(path, root), stat.st_mtime, stat.st_size))
    return result


class PrototypeRuntimeTests(unittest.TestCase):
    def run_once(self, database, provider):
        store = EventStore(database)
        try:
            runtime = PrototypeRuntime(WorkspaceContext(FIXTURE), "Find target_function.", provider, store, run_id="run-1")
            result = runtime.run()
            run, events = store.load_run("run-1")
            return result, run, events
        finally:
            store.close()

    def test_mock_provider_completes_and_preserves_workspace(self):
        before = snapshot(FIXTURE)
        with tempfile.TemporaryDirectory() as directory:
            result, run, events = self.run_once(os.path.join(directory, "events.sqlite"), MockProvider())
        self.assertEqual(RunStatus.COMPLETED, result.status)
        self.assertEqual("COMPLETED", run["final_status"])
        self.assertIn("src/target.py:1", result.final_text)
        self.assertEqual(before, snapshot(FIXTURE))
        self.assertEqual([event["seq"] for event in events], list(range(1, len(events) + 1)))

    def test_replay_provider_replays_recorded_responses(self):
        with tempfile.TemporaryDirectory() as directory:
            original = os.path.join(directory, "recorded.sqlite")
            result, _, original_events = self.run_once(original, MockProvider())
            self.assertEqual(RunStatus.COMPLETED, result.status)
            replayed = os.path.join(directory, "replayed.sqlite")
            replay_result, _, replay_events = self.run_once(replayed, ReplayProvider.from_event_db(original))
        self.assertEqual(RunStatus.COMPLETED, replay_result.status)
        self.assertEqual([event["event_type"] for event in original_events], [event["event_type"] for event in replay_events])

    def test_verification_rejects_a_model_completion_without_read_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            result, run, events = self.run_once(os.path.join(directory, "events.sqlite"), MockProvider([ModelResponse(content="mark COMPLETED", finish_reason=FinishReason.STOP)]))
        self.assertEqual(RunStatus.FAILED, result.status)
        self.assertEqual("VERIFICATION_REJECTED", result.errors[-1]["code"])
        self.assertEqual("FAILED", run["final_status"])
        self.assertIn("verification.result", [event["event_type"] for event in events])

    def test_replay_mismatch_fails_after_recording_is_exhausted(self):
        with tempfile.TemporaryDirectory() as directory:
            result, _, _ = self.run_once(os.path.join(directory, "events.sqlite"), ReplayProvider([]))
        self.assertEqual(RunStatus.FAILED, result.status)
        self.assertEqual("REPLAY_MISMATCH", result.errors[-1]["code"])

    def test_replay_missing_middle_response_fails_in_the_real_loop(self):
        with tempfile.TemporaryDirectory() as directory:
            recorded = os.path.join(directory, "recorded.sqlite")
            self.run_once(recorded, MockProvider())
            connection = sqlite3.connect(recorded)
            try:
                connection.execute("DELETE FROM events WHERE run_id = 'run-1' AND event_type = 'model.response' AND seq = 12")
                connection.commit()
            finally:
                connection.close()
            result, unused_run, unused_events = self.run_once(os.path.join(directory, "replayed.sqlite"), ReplayProvider.from_event_db(recorded))
        self.assertEqual(RunStatus.FAILED, result.status)
        self.assertEqual("REPLAY_MISMATCH", result.errors[-1]["code"])

    def test_replay_missing_final_response_fails_in_the_real_loop(self):
        with tempfile.TemporaryDirectory() as directory:
            recorded = os.path.join(directory, "recorded.sqlite")
            self.run_once(recorded, MockProvider())
            connection = sqlite3.connect(recorded)
            try:
                connection.execute("DELETE FROM events WHERE run_id = 'run-1' AND event_type = 'model.response' AND seq = 26")
                connection.commit()
            finally:
                connection.close()
            result, unused_run, unused_events = self.run_once(os.path.join(directory, "replayed.sqlite"), ReplayProvider.from_event_db(recorded))
        self.assertEqual(RunStatus.FAILED, result.status)
        self.assertEqual("REPLAY_MISMATCH", result.errors[-1]["code"])

    def test_chinese_and_space_workspace_path_completes(self):
        with tempfile.TemporaryDirectory() as directory:
            copied = os.path.join(directory, "中文 workspace")
            shutil.copytree(FIXTURE, copied)
            database = os.path.join(directory, "events.sqlite")
            store = EventStore(database)
            try:
                result = PrototypeRuntime(WorkspaceContext(copied), "Find target_function.", MockProvider(), store).run()
            finally:
                store.close()
        self.assertEqual(RunStatus.COMPLETED, result.status)

    def test_unknown_tool_has_no_policy_allow_and_run_can_continue(self):
        script = [
            ModelResponse(tool_calls=[ToolCall("unknown", "not_registered", {})], finish_reason=FinishReason.TOOL_CALLS),
            ModelResponse(tool_calls=[ToolCall("read", "read_file_range", {"path": "src/target.py", "start_line": 1, "end_line": 4})], finish_reason=FinishReason.TOOL_CALLS),
            ModelResponse(content="See src/target.py:1.", finish_reason=FinishReason.STOP),
        ]
        with tempfile.TemporaryDirectory() as directory:
            result, _, events = self.run_once(os.path.join(directory, "events.sqlite"), MockProvider(script))
        self.assertEqual(RunStatus.COMPLETED, result.status)
        self.assertFalse([event for event in events if event["event_type"] == "policy.decision" and event["payload"].get("tool_call_id") == "unknown"])
        unknown_results = [event for event in events if event["event_type"] == "tool.result" and event["payload"].get("tool_call_id") == "unknown"]
        self.assertEqual(1, len(unknown_results))
        self.assertFalse(unknown_results[0]["payload"]["executed"])

    def test_unknown_and_denied_calls_consume_the_tool_budget(self):
        script = [
            ModelResponse(tool_calls=[ToolCall("unknown", "not_registered", {})], finish_reason=FinishReason.TOOL_CALLS),
            ModelResponse(tool_calls=[ToolCall("later", "not_registered", {})], finish_reason=FinishReason.TOOL_CALLS),
        ]
        with tempfile.TemporaryDirectory() as directory:
            store = EventStore(os.path.join(directory, "events.sqlite"))
            try:
                runtime = PrototypeRuntime(WorkspaceContext(FIXTURE), "Find target_function.", MockProvider(script), store, max_tool_calls=1)
                result = runtime.run()
            finally:
                store.close()
        self.assertEqual(RunStatus.FAILED, result.status)
        self.assertEqual("RUN_LIMIT_EXCEEDED", result.errors[-1]["code"])

    def test_denied_tool_is_not_executed_and_readonly_fallback_completes(self):
        calls = []
        script = [
            ModelResponse(tool_calls=[ToolCall("deny", "blocked", {})], finish_reason=FinishReason.TOOL_CALLS),
            ModelResponse(tool_calls=[ToolCall("read", "read_file_range", {"path": "src/target.py", "start_line": 1, "end_line": 4})], finish_reason=FinishReason.TOOL_CALLS),
            ModelResponse(content="See src/target.py:1.", finish_reason=FinishReason.STOP),
        ]
        with tempfile.TemporaryDirectory() as directory:
            store = EventStore(os.path.join(directory, "events.sqlite"))
            try:
                runtime = PrototypeRuntime(WorkspaceContext(FIXTURE), "Find target_function.", MockProvider(script), store)
                runtime._registry.register(ToolSpec("blocked", "blocked", {}, "WORKSPACE_WRITE"), lambda request: calls.append(request))
                result = runtime.run()
                _, events = store.load_run(result.run_id)
            finally:
                store.close()
        self.assertEqual(RunStatus.COMPLETED, result.status)
        self.assertEqual([], calls)
        self.assertTrue([event for event in events if event["event_type"] == "tool.denied"])
        self.assertFalse([event for event in events if event["event_type"] == "tool.result" and event["payload"].get("tool_call_id") == "deny"])

    def test_event_store_mid_run_failure_becomes_structured_run_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            store = EventStore(os.path.join(directory, "events.sqlite"))
            original_append = store.append_event
            calls = []

            def append(run_id, event_type, payload):
                calls.append(event_type)
                if len(calls) == 4:
                    from win7_agent.storage import EventStoreError
                    raise EventStoreError("injected failure")
                return original_append(run_id, event_type, payload)

            try:
                with mock.patch.object(store, "append_event", side_effect=append):
                    result = PrototypeRuntime(WorkspaceContext(FIXTURE), "Find target_function.", MockProvider(), store).run()
            finally:
                store.close()
        self.assertEqual(RunStatus.FAILED, result.status)
        self.assertEqual("EVENT_STORE_FAILED", result.errors[-1]["code"])

    def test_completed_transition_storage_failure_cannot_return_completed(self):
        with tempfile.TemporaryDirectory() as directory:
            store = EventStore(os.path.join(directory, "events.sqlite"))
            original_append = store.append_event

            def append(run_id, event_type, payload):
                if event_type == "state.transition" and payload.get("to") == "COMPLETED":
                    from win7_agent.storage import EventStoreError
                    raise EventStoreError("completed transition failed")
                return original_append(run_id, event_type, payload)

            try:
                with mock.patch.object(store, "append_event", side_effect=append):
                    result = PrototypeRuntime(WorkspaceContext(FIXTURE), "Find target_function.", MockProvider(), store).run()
            finally:
                store.close()
        self.assertEqual(RunStatus.FAILED, result.status)
        self.assertFalse(result.trace_complete)
        self.assertEqual("EVENT_STORE_FAILED", result.errors[-1]["code"])

    def test_runtime_error_then_store_failure_keeps_both_errors_in_order(self):
        with tempfile.TemporaryDirectory() as directory:
            store = EventStore(os.path.join(directory, "events.sqlite"))
            original_append = store.append_event

            def append(run_id, event_type, payload):
                if event_type == "state.transition" and payload.get("to") == "FAILED":
                    from win7_agent.storage import EventStoreError
                    raise EventStoreError("failure transition failed")
                return original_append(run_id, event_type, payload)

            try:
                with mock.patch.object(store, "append_event", side_effect=append):
                    result = PrototypeRuntime(WorkspaceContext(FIXTURE), "Find target_function.", ReplayProvider([]), store).run()
            finally:
                store.close()
        self.assertEqual(RunStatus.FAILED, result.status)
        self.assertEqual(["REPLAY_MISMATCH", "EVENT_STORE_FAILED"], [item["code"] for item in result.errors[-2:]])
        self.assertFalse(result.trace_complete)

    def test_finalization_failure_preserves_completed_business_status(self):
        with tempfile.TemporaryDirectory() as directory:
            store = EventStore(os.path.join(directory, "events.sqlite"))
            original_append = store.append_event

            def append(run_id, event_type, payload):
                if event_type == "run.final":
                    from win7_agent.storage import EventStoreError
                    raise EventStoreError("final event failed")
                return original_append(run_id, event_type, payload)

            try:
                with mock.patch.object(store, "append_event", side_effect=append):
                    result = PrototypeRuntime(WorkspaceContext(FIXTURE), "Find target_function.", MockProvider(), store).run()
            finally:
                store.close()
        self.assertEqual(RunStatus.COMPLETED, result.status)
        self.assertFalse(result.trace_complete)
        self.assertEqual("EVENT_STORE_FAILED", result.errors[-1]["code"])
