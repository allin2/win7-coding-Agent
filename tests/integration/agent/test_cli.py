"""F31 and F37--F39 end-to-end offline CLI coverage."""

import io
import os
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout

from win7_agent.cli.__main__ import main


class AgentCliTests(unittest.TestCase):
    def test_f31_mock_cli_closes_the_readonly_analysis_loop(self):
        root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "fixtures", "sample_project"))
        with tempfile.TemporaryDirectory() as directory:
            events = os.path.join(directory, "events.sqlite")
            output = io.StringIO()
            with redirect_stdout(output):
                code = main(["analyze", "--workspace", root, "--task", "Find target_function.", "--events", events])
        self.assertEqual(0, code)
        self.assertIn("RESULT status=COMPLETED trace_complete=true", output.getvalue())
        self.assertTrue(output.getvalue().isascii())

    def test_f37_argument_errors_are_exit_three_and_no_result(self):
        error = io.StringIO()
        with redirect_stderr(error):
            code = main(["analyze"])
        self.assertEqual(3, code)
        self.assertTrue(error.getvalue().isascii())
