import unittest
from unittest import mock

from win7_agent.tools.subproc import run_git


class _BrokenStream:
    def read(self, size):
        raise OSError("pipe closed")

    def close(self):
        raise ValueError("already closed")


class _FinishedProcess:
    stdout = _BrokenStream()
    stderr = _BrokenStream()
    returncode = 0

    def wait(self, timeout=None):
        return 0

    def kill(self):
        return None


class SubprocessHelperTests(unittest.TestCase):
    def test_drain_close_race_is_bounded_and_marked_truncated(self):
        with mock.patch("win7_agent.tools.subproc.subprocess.Popen", return_value=_FinishedProcess()):
            code, stdout, stderr, truncated, timed_out = run_git(["git", "status"], ".", 1.0, 64)
        self.assertEqual(0, code)
        self.assertEqual(b"", stdout)
        self.assertEqual(b"", stderr)
        self.assertTrue(truncated)
        self.assertFalse(timed_out)
