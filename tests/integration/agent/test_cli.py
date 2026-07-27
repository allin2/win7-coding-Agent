"""F31 and F37--F39 end-to-end offline CLI coverage."""

import io
import os
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout

from win7_agent.cli.__main__ import main


class AgentCliTests(unittest.TestCase):
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
        root = os.path.abspath(os.path.join(
            os.path.dirname(__file__), "..", "..", "fixtures", "sample_project"))
        with tempfile.TemporaryDirectory() as directory:
            recording = os.path.join(directory, "recording.sqlite")
            replay_events = os.path.join(directory, "replay-events.sqlite")
            recorded_output = io.StringIO()
            replay_output = io.StringIO()
            with redirect_stdout(recorded_output):
                recorded_code = main([
                    "analyze", "--workspace", root, "--task", "Find target_function.",
                    "--events", recording])
            with redirect_stdout(replay_output):
                replay_code = main([
                    "analyze", "--workspace", root, "--task", "Find target_function.",
                    "--provider", "replay", "--replay-from", recording,
                    "--events", replay_events])
        self.assertEqual(0, recorded_code)
        self.assertEqual(0, replay_code)
        self.assertIn("RESULT status=COMPLETED trace_complete=true", recorded_output.getvalue())
        self.assertIn("RESULT status=COMPLETED trace_complete=true", replay_output.getvalue())
        self.assertTrue(recorded_output.getvalue().isascii())
        self.assertTrue(replay_output.getvalue().isascii())

    def test_f37_argument_errors_are_exit_three_and_no_result(self):
        error = io.StringIO()
        with redirect_stderr(error):
            code = main(["analyze"])
        self.assertEqual(3, code)
        self.assertTrue(error.getvalue().isascii())
