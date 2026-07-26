import os
import sqlite3
import tempfile
import unittest

from win7_agent.models import FinishReason, MockProvider, ModelRequest, ModelResponse, ReplayMismatch, ReplayProvider


def request(turn):
    return ModelRequest([], [], turn, {"remaining_turns": 1, "remaining_tool_calls": 1})


class ProviderTests(unittest.TestCase):
    def test_mock_provider_is_deterministic_and_scripted(self):
        provider = MockProvider()
        self.assertEqual("list_directory", provider.generate(request(1)).tool_calls[0].tool_name)
        self.assertEqual("search_text", provider.generate(request(2)).tool_calls[0].tool_name)

    def test_replay_provider_replays_then_rejects_extra_turn(self):
        provider = ReplayProvider([ModelResponse(content="done", finish_reason=FinishReason.STOP)])
        self.assertEqual("done", provider.generate(request(1)).content)
        with self.assertRaises(ReplayMismatch) as error:
            provider.generate(request(2))
        self.assertEqual("REPLAY_MISMATCH", error.exception.code)

    def test_replay_provider_loads_response_events(self):
        with tempfile.TemporaryDirectory() as directory:
            database = os.path.join(directory, "events.sqlite")
            connection = sqlite3.connect(database)
            try:
                connection.execute("CREATE TABLE runs (run_id TEXT, created_at TEXT)")
                connection.execute("CREATE TABLE events (run_id TEXT, event_type TEXT, seq INTEGER, payload TEXT)")
                connection.execute("INSERT INTO runs VALUES ('run-1', '2026-01-01T00:00:00+00:00')")
                connection.execute("INSERT INTO events VALUES ('run-1', 'model.response', 1, '{\"content\": \"done\", \"tool_calls\": [], \"finish_reason\": \"STOP\", \"usage\": {}}')")
                connection.commit()
            finally:
                connection.close()
            self.assertEqual("done", ReplayProvider.from_event_db(database).generate(request(1)).content)
