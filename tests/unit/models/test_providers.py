import os
import sqlite3
import tempfile
import unittest

from win7_agent.models import FinishReason, MockProvider, ModelRequest, ModelResponse, ProviderError, ReplayMismatch, ReplayProvider, request_fingerprint


def request(turn):
    return ModelRequest([], [], turn, {"remaining_turns": 1, "remaining_tool_calls": 1})


class ProviderTests(unittest.TestCase):
    def test_mock_provider_is_deterministic_and_scripted(self):
        provider = MockProvider()
        self.assertEqual("list_directory", provider.generate(request(1)).tool_calls[0].tool_name)
        self.assertEqual("search_text", provider.generate(request(2)).tool_calls[0].tool_name)

    def test_replay_provider_replays_then_rejects_extra_turn(self):
        provider = ReplayProvider([(1, request_fingerprint(request(1)), ModelResponse(content="done", finish_reason=FinishReason.STOP))])
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
                connection.execute("CREATE TABLE meta (key TEXT, value TEXT)")
                connection.execute("INSERT INTO runs VALUES ('run-1', '2026-01-01T00:00:00+00:00')")
                fingerprint = request_fingerprint(request(1))
                connection.execute("INSERT INTO events VALUES ('run-1', 'model.request', 1, ?)", ('{"turn": 1, "request_fingerprint": "' + fingerprint + '"}',))
                connection.execute("INSERT INTO events VALUES ('run-1', 'model.response', 2, '{\"content\": \"done\", \"tool_calls\": [], \"finish_reason\": \"STOP\", \"usage\": {}}')")
                connection.commit()
            finally:
                connection.close()
            self.assertEqual("done", ReplayProvider.from_event_db(database).generate(request(1)).content)

    def test_missing_replay_database_is_load_error_without_creation(self):
        with tempfile.TemporaryDirectory() as directory:
            database = os.path.join(directory, "missing.sqlite")
            with self.assertRaises(ProviderError) as error:
                ReplayProvider.from_event_db(database)
            self.assertEqual("REPLAY_LOAD_FAILED", error.exception.code)
            self.assertFalse(os.path.exists(database))

    def test_replay_fingerprint_mismatch_is_runtime_mismatch(self):
        provider = ReplayProvider([(1, "0" * 64, ModelResponse(content="done"))])
        with self.assertRaises(ReplayMismatch):
            provider.generate(request(1))

    def test_replay_uri_escapes_path_special_characters(self):
        with tempfile.TemporaryDirectory() as directory:
            database = os.path.join(directory, "record # %.sqlite")
            connection = sqlite3.connect(database)
            try:
                connection.execute("CREATE TABLE runs (run_id TEXT, created_at TEXT)")
                connection.execute("CREATE TABLE events (run_id TEXT, event_type TEXT, seq INTEGER, payload TEXT)")
                connection.execute("CREATE TABLE meta (key TEXT, value TEXT)")
                connection.execute("INSERT INTO runs VALUES ('run-1', '2026-01-01T00:00:00+00:00')")
                fingerprint = request_fingerprint(request(1))
                connection.execute("INSERT INTO events VALUES ('run-1', 'model.request', 1, ?)", ('{"turn": 1, "request_fingerprint": "' + fingerprint + '"}',))
                connection.execute("INSERT INTO events VALUES ('run-1', 'model.response', 2, '{\"content\": \"done\", \"tool_calls\": [], \"finish_reason\": \"STOP\", \"usage\": {}}')")
                connection.commit()
            finally:
                connection.close()
            self.assertEqual("done", ReplayProvider.from_event_db(database).generate(request(1)).content)

    def test_replay_schema_and_missing_response_fail_with_defined_errors(self):
        with tempfile.TemporaryDirectory() as directory:
            empty = os.path.join(directory, "empty.sqlite")
            sqlite3.connect(empty).close()
            with self.assertRaises(ProviderError):
                ReplayProvider.from_event_db(empty)
            database = os.path.join(directory, "missing-response.sqlite")
            connection = sqlite3.connect(database)
            try:
                connection.execute("CREATE TABLE runs (run_id TEXT, created_at TEXT)")
                connection.execute("CREATE TABLE events (run_id TEXT, event_type TEXT, seq INTEGER, payload TEXT)")
                connection.execute("CREATE TABLE meta (key TEXT, value TEXT)")
                connection.execute("INSERT INTO runs VALUES ('run-1', '2026-01-01T00:00:00+00:00')")
                connection.execute("INSERT INTO events VALUES ('run-1', 'model.request', 1, ?)", ('{"turn": 1, "request_fingerprint": "' + request_fingerprint(request(1)) + '"}',))
                connection.commit()
            finally:
                connection.close()
            with self.assertRaises(ReplayMismatch):
                ReplayProvider.from_event_db(database).generate(request(1))
