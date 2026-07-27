"""F31 and F37--F39 end-to-end offline CLI coverage."""

import io
import json
import os
import sqlite3
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout

from win7_agent.cli.__main__ import main


class AgentCliTests(unittest.TestCase):
    def _workspace(self):
        return os.path.abspath(os.path.join(
            os.path.dirname(__file__), "..", "..", "fixtures", "sample_project"))

    def _recording(self, directory):
        path = os.path.join(directory, "recording.sqlite")
        with redirect_stdout(io.StringIO()):
            code = main([
                "analyze", "--workspace", self._workspace(),
                "--task", "Find target_function.", "--events", path])
        self.assertEqual(0, code)
        return path

    def _replay(self, recording, directory):
        events = os.path.join(directory, "replay-events.sqlite")
        output = io.StringIO()
        errors = io.StringIO()
        with redirect_stdout(output), redirect_stderr(errors):
            code = main([
                "analyze", "--workspace", self._workspace(),
                "--task", "Find target_function.", "--provider", "replay",
                "--replay-from", recording, "--events", events])
        return code, output.getvalue(), errors.getvalue(), events

    def _run_status(self, path):
        connection = sqlite3.connect(path)
        try:
            row = connection.execute(
                "SELECT status FROM runs ORDER BY created_at DESC LIMIT 1").fetchone()
            return row[0] if row else None
        finally:
            connection.close()

    def test_mock_cli_closes_the_readonly_analysis_loop(self):
        root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "fixtures", "sample_project"))
        with tempfile.TemporaryDirectory() as directory:
            events = os.path.join(directory, "events.sqlite")
            output = io.StringIO()
            with redirect_stdout(output):
                code = main(["analyze", "--workspace", root, "--task", "Find target_function.", "--events", events])
        self.assertEqual(0, code)
        self.assertIn("RESULT status=COMPLETED trace_complete=true", output.getvalue())
        self.assertTrue(output.getvalue().isascii())

    def test_f31_recorded_cli_run_replays_to_the_same_completed_result(self):
        with tempfile.TemporaryDirectory() as directory:
            recording = os.path.join(directory, "recording.sqlite")
            replay_events = os.path.join(directory, "replay-events.sqlite")
            recorded_output = io.StringIO()
            replay_output = io.StringIO()
            with redirect_stdout(recorded_output):
                recorded_code = main([
                    "analyze", "--workspace", self._workspace(), "--task", "Find target_function.",
                    "--events", recording])
            with redirect_stdout(replay_output):
                replay_code = main([
                    "analyze", "--workspace", self._workspace(), "--task", "Find target_function.",
                    "--provider", "replay", "--replay-from", recording,
                    "--events", replay_events])
        self.assertEqual(0, recorded_code)
        self.assertEqual(0, replay_code)
        self.assertIn("RESULT status=COMPLETED trace_complete=true", recorded_output.getvalue())
        self.assertIn("RESULT status=COMPLETED trace_complete=true", replay_output.getvalue())
        self.assertTrue(recorded_output.getvalue().isascii())
        self.assertTrue(replay_output.getvalue().isascii())

    def test_f35_replay_setup_errors_have_exit_three_and_no_result(self):
        with tempfile.TemporaryDirectory() as directory:
            missing = os.path.join(directory, "missing.sqlite")
            bad_schema = os.path.join(directory, "bad.sqlite")
            no_runs = os.path.join(directory, "no-runs.sqlite")
            sqlite3.connect(bad_schema).close()
            connection = sqlite3.connect(no_runs)
            connection.executescript(
                "CREATE TABLE schema_info (schema_version INTEGER NOT NULL);"
                "CREATE TABLE runs (run_id TEXT PRIMARY KEY, status TEXT NOT NULL, "
                "trace_complete INTEGER NOT NULL, created_at REAL NOT NULL);"
                "INSERT INTO schema_info(schema_version) VALUES (1);")
            connection.commit()
            connection.close()
            cases = [
                ["analyze", "--workspace", self._workspace(), "--task", "x", "--provider", "replay"],
                ["analyze", "--workspace", self._workspace(), "--task", "x", "--provider", "replay", "--replay-from", missing],
                ["analyze", "--workspace", self._workspace(), "--task", "x", "--provider", "replay", "--replay-from", bad_schema],
                ["analyze", "--workspace", self._workspace(), "--task", "x", "--provider", "replay", "--replay-from", no_runs]]
            for arguments in cases:
                output = io.StringIO()
                errors = io.StringIO()
                with redirect_stdout(output), redirect_stderr(errors):
                    code = main(arguments)
                self.assertEqual(3, code)
                self.assertNotIn("RESULT", output.getvalue())
                self.assertTrue(errors.getvalue().isascii())
                self.assertNotIn("Traceback", errors.getvalue())
            self.assertFalse(os.path.exists(missing))

    def test_f32_missing_response_and_provider_exhaustion_are_runtime_mismatches(self):
        with tempfile.TemporaryDirectory() as directory:
            missing = self._recording(directory)
            exhausted = os.path.join(directory, "exhausted.sqlite")
            with open(missing, "rb") as reader:
                source = reader.read()
            with open(exhausted, "wb") as writer:
                writer.write(source)
            for path, delete_request in ((missing, False), (exhausted, True)):
                connection = sqlite3.connect(path)
                try:
                    if delete_request:
                        connection.execute(
                            "DELETE FROM events WHERE seq IN (SELECT seq FROM events "
                            "WHERE event_type IN ('model.request','model.response') ORDER BY seq DESC LIMIT 2)")
                    else:
                        connection.execute(
                            "DELETE FROM events WHERE seq=(SELECT MAX(seq) FROM events WHERE event_type='model.response')")
                    connection.commit()
                finally:
                    connection.close()
                code, output, errors, replay_events = self._replay(path, directory)
                self.assertEqual(1, code)
                self.assertIn("RESULT status=FAILED", output)
                self.assertNotIn("Traceback", output + errors)
                self.assertEqual("FAILED", self._run_status(replay_events))

    def test_f33_surplus_response_is_detected_before_completion(self):
        with tempfile.TemporaryDirectory() as directory:
            recording = self._recording(directory)
            connection = sqlite3.connect(recording)
            try:
                row = connection.execute(
                    "SELECT payload FROM events WHERE event_type='model.response' ORDER BY seq DESC LIMIT 1").fetchone()
                sequence = connection.execute("SELECT MAX(seq) FROM events").fetchone()[0] + 1
                run_id = connection.execute("SELECT run_id FROM runs LIMIT 1").fetchone()[0]
                connection.execute(
                    "INSERT INTO events(run_id,seq,event_type,payload,schema_version) VALUES (?,?,?,?,1)",
                    (run_id, sequence, "model.response", row[0]))
                connection.commit()
            finally:
                connection.close()
            code, output, errors, replay_events = self._replay(recording, directory)
            self.assertEqual(1, code)
            self.assertIn("RESULT status=FAILED", output)
            self.assertNotIn("Traceback", output + errors)
            self.assertEqual("FAILED", self._run_status(replay_events))

    def test_f34_request_fingerprint_mismatch_is_runtime_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            recording = self._recording(directory)
            connection = sqlite3.connect(recording)
            try:
                row = connection.execute(
                    "SELECT seq,payload FROM events WHERE event_type='model.request' ORDER BY seq LIMIT 1").fetchone()
                payload = json.loads(row[1])
                payload["request_fingerprint"] = "0" * 64
                connection.execute(
                    "UPDATE events SET payload=? WHERE seq=?",
                    (json.dumps(payload, sort_keys=True, separators=(",", ":")), row[0]))
                connection.commit()
            finally:
                connection.close()
            code, output, errors, replay_events = self._replay(recording, directory)
            self.assertEqual(1, code)
            self.assertIn("RESULT status=FAILED", output)
            self.assertNotIn("Traceback", output + errors)
            self.assertEqual("FAILED", self._run_status(replay_events))

    def test_f37_argument_errors_are_exit_three_and_no_result(self):
        error = io.StringIO()
        with redirect_stderr(error):
            code = main(["analyze"])
        self.assertEqual(3, code)
        self.assertTrue(error.getvalue().isascii())
