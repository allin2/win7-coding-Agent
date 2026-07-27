import os
import json
import shutil
import sqlite3
import tempfile
import unittest
from unittest import mock
from io import StringIO
from contextlib import redirect_stderr, redirect_stdout

from win7_agent.cli.__main__ import main
from win7_agent.runtime import RunResult, RunStatus
from win7_agent.storage import EventStore


FIXTURE = os.path.realpath(os.path.join(os.path.dirname(__file__), "..", "..", "fixtures", "sample_project"))


class CliTests(unittest.TestCase):
    def test_analyze_mock_demo_returns_zero(self):
        with tempfile.TemporaryDirectory() as directory:
            database = os.path.join(directory, "events.sqlite")
            self.assertEqual(0, main(["analyze", "--workspace", FIXTURE, "--task", "Find target_function.", "--event-db", database]))
            self.assertTrue(os.path.isfile(database))

    def test_cancelled_result_maps_to_exit_code_two(self):
        result = RunResult("run", RunStatus.CANCELLED, "", 0, 0, [])
        with tempfile.TemporaryDirectory() as directory:
            database = os.path.join(directory, "events.sqlite")
            with mock.patch("win7_agent.cli.__main__.PrototypeRuntime") as runtime:
                runtime.return_value.run.return_value = result
                self.assertEqual(2, main(["analyze", "--workspace", FIXTURE, "--task", "Find target_function.", "--event-db", database]))

    def test_argument_errors_return_three_and_help_returns_zero(self):
        self.assertEqual(3, main(["analyze", "--workspace", FIXTURE]))
        self.assertEqual(3, main(["analyze", "--workspace", FIXTURE, "--task", "x", "--max-turns", "0"]))
        self.assertEqual(0, main(["--help"]))

    def test_replay_load_error_returns_three_without_creating_file(self):
        with tempfile.TemporaryDirectory() as directory:
            replay = os.path.join(directory, "missing.sqlite")
            self.assertEqual(3, main(["analyze", "--workspace", FIXTURE, "--task", "x", "--replay", replay]))
            self.assertFalse(os.path.exists(replay))

    def test_replay_database_with_schema_but_no_runs_is_cli_load_error(self):
        with tempfile.TemporaryDirectory() as directory:
            replay = os.path.join(directory, "empty-runs.sqlite")
            store = EventStore(replay)
            store.close()
            with open(replay, "rb") as source:
                before = source.read()
            stdout = StringIO()
            stderr = StringIO()
            with redirect_stdout(stdout), redirect_stderr(stderr):
                code = main(["analyze", "--workspace", FIXTURE, "--task", "x", "--replay", replay])
            with open(replay, "rb") as source:
                after = source.read()
        self.assertEqual(3, code)
        stderr.getvalue().encode("ascii")
        self.assertIn("replay database has no runs", stderr.getvalue())
        self.assertNotIn("RESULT", stdout.getvalue())
        self.assertNotIn("Traceback", stderr.getvalue())
        self.assertEqual(before, after)

    def test_event_lines_are_ascii_and_do_not_contain_file_contents(self):
        with tempfile.TemporaryDirectory() as directory:
            output = StringIO()
            with redirect_stdout(output):
                self.assertEqual(0, main(["analyze", "--workspace", FIXTURE, "--task", "Find target_function.", "--event-db", os.path.join(directory, "events.sqlite")]))
        text = output.getvalue()
        text.encode("ascii")
        self.assertIn("EVENT seq=1 type=run.created", text)
        self.assertNotIn("sample result", text)

    def test_runtime_store_failure_reports_result_and_exit_one(self):
        result = RunResult("missing", RunStatus.FAILED, "", 1, 0, [{"code": "EVENT_STORE_FAILED", "message": "broken"}], False, "runtime")
        with tempfile.TemporaryDirectory() as directory:
            stdout = StringIO()
            stderr = StringIO()
            with mock.patch("win7_agent.cli.__main__.PrototypeRuntime") as runtime:
                runtime.return_value.run.return_value = result
                with redirect_stdout(stdout), redirect_stderr(stderr):
                    code = main(["analyze", "--workspace", FIXTURE, "--task", "x", "--event-db", os.path.join(directory, "events.sqlite")])
        self.assertEqual(1, code)
        self.assertIn("ERROR EVENT_STORE_FAILED", stderr.getvalue())
        self.assertIn("RESULT status=FAILED", stdout.getvalue())
        self.assertIn("trace_complete=false", stdout.getvalue())

    def test_pre_run_store_failure_returns_three_without_result(self):
        with tempfile.TemporaryDirectory() as directory:
            stdout = StringIO()
            stderr = StringIO()
            from win7_agent.storage import EventStoreError
            with mock.patch("win7_agent.cli.__main__.EventStore", side_effect=EventStoreError("cannot open database")):
                with redirect_stdout(stdout), redirect_stderr(stderr):
                    code = main(["analyze", "--workspace", FIXTURE, "--task", "x", "--event-db", os.path.join(directory, "events.sqlite")])
        self.assertEqual(3, code)
        self.assertIn("ERROR", stderr.getvalue())
        self.assertNotIn("RESULT", stdout.getvalue())

    def test_finalization_store_failure_is_a_warning_and_keeps_success_exit(self):
        result = RunResult("missing", RunStatus.COMPLETED, "", 1, 0, [{"code": "EVENT_STORE_FAILED", "message": "broken"}], False, "finalize")
        with tempfile.TemporaryDirectory() as directory:
            stdout = StringIO()
            stderr = StringIO()
            with mock.patch("win7_agent.cli.__main__.PrototypeRuntime") as runtime:
                runtime.return_value.run.return_value = result
                with redirect_stdout(stdout), redirect_stderr(stderr):
                    code = main(["analyze", "--workspace", FIXTURE, "--task", "x", "--event-db", os.path.join(directory, "events.sqlite")])
        self.assertEqual(0, code)
        self.assertIn("WARNING EVENT_STORE_FAILED", stderr.getvalue())
        self.assertIn("RESULT status=COMPLETED", stdout.getvalue())

    def test_replay_and_event_db_same_path_prints_note(self):
        with tempfile.TemporaryDirectory() as directory:
            database = os.path.join(directory, "record # %.sqlite")
            self.assertEqual(0, main(["analyze", "--workspace", FIXTURE, "--task", "Find target_function.", "--event-db", database]))
            output = StringIO()
            with redirect_stdout(output):
                self.assertEqual(0, main(["analyze", "--workspace", FIXTURE, "--task", "Find target_function.", "--replay", database, "--event-db", database]))
        self.assertIn("NOTE replay-db and event-db are the same path", output.getvalue())

    def test_surplus_replay_response_fails_the_real_cli_loop(self):
        with tempfile.TemporaryDirectory() as directory:
            recorded = os.path.join(directory, "recorded.sqlite")
            replayed = os.path.join(directory, "replayed.sqlite")
            with redirect_stdout(StringIO()):
                self.assertEqual(0, main(["analyze", "--workspace", FIXTURE, "--task", "Find target_function.", "--event-db", recorded]))
            connection = sqlite3.connect(recorded)
            try:
                run_id = connection.execute("SELECT run_id FROM runs ORDER BY created_at LIMIT 1").fetchone()[0]
                sequence = connection.execute("SELECT MAX(seq) FROM events WHERE run_id = ?", (run_id,)).fetchone()[0] + 1
                payload = json.dumps({"content": "surplus", "tool_calls": [], "finish_reason": "STOP", "usage": {"prompt_chars": 0, "completion_chars": 0}})
                connection.execute("INSERT INTO events (run_id, seq, ts, event_type, payload) VALUES (?, ?, ?, ?, ?)", (run_id, sequence, "2026-07-27T00:00:00+00:00", "model.response", payload))
                connection.commit()
            finally:
                connection.close()
            stdout = StringIO()
            stderr = StringIO()
            with redirect_stdout(stdout), redirect_stderr(stderr):
                code = main(["analyze", "--workspace", FIXTURE, "--task", "Find target_function.", "--replay", recorded, "--event-db", replayed])
            connection = sqlite3.connect(replayed)
            try:
                final_payload = json.loads(connection.execute("SELECT payload FROM events WHERE event_type = 'run.final'").fetchone()[0])
            finally:
                connection.close()
        self.assertEqual(1, code)
        self.assertIn("RESULT status=FAILED", stdout.getvalue())
        self.assertIn("REPLAY_MISMATCH", [item["code"] for item in final_payload["errors"]])
        self.assertNotIn("Traceback", stderr.getvalue())

    def test_replay_with_chinese_space_percent_and_hash_paths_completes(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = os.path.join(directory, "中文 workspace % #")
            shutil.copytree(FIXTURE, workspace)
            recorded = os.path.join(directory, "录制 database % #.sqlite")
            replayed = os.path.join(directory, "重放 database % #.sqlite")
            stdout = StringIO()
            stderr = StringIO()
            with redirect_stdout(stdout), redirect_stderr(stderr):
                record_code = main(["analyze", "--workspace", workspace, "--task", "Find target_function.", "--event-db", recorded])
                replay_code = main(["analyze", "--workspace", workspace, "--task", "Find target_function.", "--replay", recorded, "--event-db", replayed])
            names = sorted(os.listdir(directory))
        self.assertEqual(0, record_code)
        self.assertEqual(0, replay_code)
        self.assertIn("RESULT status=COMPLETED", stdout.getvalue())
        self.assertIn("trace_complete=true", stdout.getvalue())
        self.assertNotIn("Traceback", stderr.getvalue())
        self.assertEqual(["中文 workspace % #", "录制 database % #.sqlite", "重放 database % #.sqlite"], names)
