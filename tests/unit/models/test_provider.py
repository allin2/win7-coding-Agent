"""F31 unit coverage for complete vendor-neutral Replay response loading."""

from __future__ import print_function

import os
import tempfile
import unittest

from win7_agent.models import FinishReason, Message, ModelRequest, ModelResponse
from win7_agent.models import ReplayProvider, ToolCall, Usage, request_fingerprint
from win7_agent.runtime.runner import AgentRunner
from win7_agent.storage import EventStore
from win7_agent.storage.event_store import MAX_PAYLOAD_BYTES


class ReplayProviderTests(unittest.TestCase):
    """Ensure Replay reconstructs every persisted formal response field."""

    def test_f31_replay_rebuilds_complete_vendor_neutral_response(self):
        request = ModelRequest([Message("user", "inspect")], [{"name": "read_file"}], 1)
        response = ModelResponse(
            "Found target_function in code.py:1",
            [ToolCall("call-1", "read_file", {"path": "code.py"})],
            FinishReason.TOOL_CALLS, Usage(prompt_chars=11, completion_chars=22))
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "recording.sqlite")
            store = EventStore(path)
            store.create_run("recording")
            store.append("recording", "model.request", {
                "turn": request.turn,
                "request_fingerprint": request_fingerprint(request)})
            store.append("recording", "model.response", response.to_dict())
            store.close()
            replay = ReplayProvider(path)
            rebuilt = replay.respond(request)
        self.assertEqual(response.to_dict(), rebuilt.to_dict())

    def test_f31_oversized_response_is_not_recorded_as_replayable(self):
        class OversizedProvider(object):
            def respond(self, unused_request):
                return ModelResponse(
                    "x" * (MAX_PAYLOAD_BYTES + 1), [], FinishReason.STOP, Usage())

        workspace = os.path.abspath(os.path.join(
            os.path.dirname(__file__), "..", "..", "fixtures", "sample_project"))
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "events.sqlite")
            store = EventStore(path)
            result = AgentRunner(workspace, OversizedProvider(), store).run("inspect")
            events = store.events_for_run(result.run_id)
            store.close()
        self.assertEqual("FAILED", result.status)
        self.assertTrue(any(item["code"] == "UNEXPECTED" for item in result.errors))
        self.assertNotIn("model.response", [item["type"] for item in events])
