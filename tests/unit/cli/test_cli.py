import os
import tempfile
import unittest

from win7_agent.cli.__main__ import main


FIXTURE = os.path.realpath(os.path.join(os.path.dirname(__file__), "..", "..", "fixtures", "sample_project"))


class CliTests(unittest.TestCase):
    def test_analyze_mock_demo_returns_zero(self):
        with tempfile.TemporaryDirectory() as directory:
            database = os.path.join(directory, "events.sqlite")
            self.assertEqual(0, main(["analyze", "--workspace", FIXTURE, "--task", "Find target_function.", "--event-db", database]))
            self.assertTrue(os.path.isfile(database))
