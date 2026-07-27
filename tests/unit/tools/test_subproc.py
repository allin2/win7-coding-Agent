import subprocess
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


class _TrackingStream:
    def __init__(self):
        self.closed = False

    def read(self, size):
        return b""

    def close(self):
        self.closed = True


class _TimeoutProcess:
    def __init__(self, waits, returncode=None):
        self.stdout = _TrackingStream()
        self.stderr = _TrackingStream()
        self._waits = list(waits)
        self.returncode = returncode
        self.wait_calls = []
        self.kill = mock.Mock()

    def wait(self, timeout=None):
        self.wait_calls.append(timeout)
        outcome = self._waits.pop(0)
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome


class SubprocessHelperTests(unittest.TestCase):
    def test_drain_close_race_is_bounded_and_marked_truncated(self):
        with mock.patch("win7_agent.tools.subproc.subprocess.Popen", return_value=_FinishedProcess()):
            code, stdout, stderr, truncated, timed_out = run_git(["git", "status"], ".", 1.0, 64)
        self.assertEqual(0, code)
        self.assertEqual(b"", stdout)
        self.assertEqual(b"", stderr)
        self.assertTrue(truncated)
        self.assertFalse(timed_out)

    def test_timeout_twice_is_contained_and_closes_streams(self):
        timeout = subprocess.TimeoutExpired(["git", "status"], 1.0)
        process = _TimeoutProcess([timeout, subprocess.TimeoutExpired(["git", "status"], 2.0)])
        with mock.patch("win7_agent.tools.subproc.subprocess.Popen", return_value=process):
            code, stdout, stderr, truncated, timed_out = run_git(["git", "status"], ".", 1.0, 64)
        self.assertEqual(-1, code)
        self.assertEqual(b"", stdout)
        self.assertEqual(b"", stderr)
        self.assertFalse(truncated)
        self.assertTrue(timed_out)
        process.kill.assert_called_once_with()
        self.assertEqual([1.0, 2.0], process.wait_calls)
        self.assertTrue(process.stdout.closed)
        self.assertTrue(process.stderr.closed)

    def test_timeout_then_success_still_reports_timeout_and_reaps_once(self):
        timeout = subprocess.TimeoutExpired(["git", "status"], 1.0)
        process = _TimeoutProcess([timeout, 0], returncode=-9)
        with mock.patch("win7_agent.tools.subproc.subprocess.Popen", return_value=process):
            code, unused_stdout, unused_stderr, unused_truncated, timed_out = run_git(["git", "status"], ".", 1.0, 64)
        self.assertEqual(-9, code)
        self.assertTrue(timed_out)
        process.kill.assert_called_once_with()
        self.assertEqual([1.0, 2.0], process.wait_calls)
        self.assertTrue(process.stdout.closed)
        self.assertTrue(process.stderr.closed)
