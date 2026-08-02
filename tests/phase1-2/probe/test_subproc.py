"""Unit/integration-sized test for bounded subprocess capture."""

import sys
import unittest

from win7_agent.probe.subproc import run_capture


class SubprocessTests(unittest.TestCase):
    """Verify capture does not stop reading after the saved limit."""

    def test_truncates_and_drains(self):
        result = run_capture([sys.executable, "-c", "import sys; sys.stdout.write('x' * 8192)"],
                             10.0, 4096, 4096)
        self.assertEqual(0, result["exit_code"])
        self.assertEqual(8192, result["bytes_read_stdout"])
        self.assertEqual(4096, result["bytes_saved_stdout"])
        self.assertTrue(result["truncated_stdout"])
