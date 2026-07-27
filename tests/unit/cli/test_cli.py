"""F26, F37, and F38 CLI error/result boundary coverage."""

from __future__ import print_function

import io
import os
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from unittest import mock

from win7_agent.cli.__main__ import main
from win7_agent.storage import EventStoreError


class _CreateFailureStore(object):
    def __init__(self, unused_path):
        pass

    def create_run(self, unused_run_id):
        raise EventStoreError("create failed")

    def close(self):
        pass


class CliTests(unittest.TestCase):
    def _workspace(self):
        return os.path.abspath(os.path.join(
            os.path.dirname(__file__), "..", "..", "fixtures", "sample_project"))

    def test_f26_run_establishment_failure_returns_three_without_result(self):
        output = io.StringIO()
        errors = io.StringIO()
        with mock.patch("win7_agent.cli.__main__.EventStore", _CreateFailureStore):
            with redirect_stdout(output), redirect_stderr(errors):
                code = main(["analyze", "--workspace", self._workspace(), "--task", "x"])
        self.assertEqual(3, code)
        self.assertNotIn("RESULT", output.getvalue())

    def test_f37_f38_completed_result_has_every_frozen_field(self):
        with tempfile.TemporaryDirectory() as directory:
            output = io.StringIO()
            with redirect_stdout(output):
                code = main([
                    "analyze", "--workspace", self._workspace(), "--task", "Find target_function.",
                    "--events", os.path.join(directory, "events.sqlite")])
        self.assertEqual(0, code)
        line = output.getvalue().strip()
        self.assertTrue(line.startswith("RESULT status=COMPLETED trace_complete=true turns="))
        self.assertIn(" tool_calls=", line)
        self.assertTrue(line.isascii())
