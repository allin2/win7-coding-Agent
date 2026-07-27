import os
import tempfile
import unittest
from unittest import mock
from io import StringIO
from contextlib import redirect_stderr, redirect_stdout

from win7_agent.cli.__main__ import main
from win7_agent.runtime import RunResult, RunStatus


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
