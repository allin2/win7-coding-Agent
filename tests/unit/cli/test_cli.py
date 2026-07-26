import os
import tempfile
import unittest
from unittest import mock

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
