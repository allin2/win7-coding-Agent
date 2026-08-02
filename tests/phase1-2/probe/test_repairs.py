"""Regression coverage for the R1--R8 architecture repair round."""

import errno
import json
import os
import sqlite3
import sys
import tempfile
import unittest
from unittest import mock

from win7_agent.probe import __main__ as probe_main
from win7_agent.probe.checks import c_fs, c_os, c_sys
from win7_agent.probe.reportio import write_sqlite_evidence
from win7_agent.probe.result import CheckResult
from win7_agent.probe.subproc import _csv_has_pid, active_process_count, run_capture
from win7_agent.probe.checks.c_proc import _failed


class Context(object):
    """Small test context covering filesystem and OS checks."""

    def __init__(self, workdir):
        self.workdir = workdir
        self.process_bitness = 64


class RepairTests(unittest.TestCase):
    """Exercise each architected repair without requiring Windows tools."""

    def test_r1_root_version_and_batch_attributes(self):
        root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
        with open(os.path.join(root, "src", "phase1-2", "win7_agent", "__init__.py"), "r", encoding="utf-8", newline="") as reader:
            self.assertEqual('__version__ = "0.1.0"\n', reader.read())
        for name in ("run_probe.bat", "run_tests.bat"):
            with open(os.path.join(root, "scripts", name), "rb") as reader:
                data = reader.read()
            self.assertIn(b"\r\n", data)
            self.assertNotIn(b"\n", data.replace(b"\r\n", b""))

    def test_r2_capture_timeout_reaps_registry(self):
        result = run_capture([sys.executable, "-c", "import time; time.sleep(5)"],
                             0.1, 4096, 4096)
        self.assertTrue(result["timed_out"])
        self.assertTrue(result["reader_threads_joined"])
        self.assertEqual(0, active_process_count())

    def test_r3_leaked_check_thread_is_recorded(self):
        context = probe_main.ProbeContext(0.5, tempfile.gettempdir(), sys.executable,
                                          {"max_stdout_bytes": 4096, "max_stderr_bytes": 4096},
                                          "report.json", 64)
        notes = []

        def never_returns(ignored_context):
            while True:
                __import__("time").sleep(0.1)

        result = probe_main._run_check("test.stuck", never_returns, context, 0.01, notes)
        self.assertEqual("CHECK_TIMEOUT", result.error.code)
        self.assertIn("CHECK_THREAD_LEAKED: test.stuck", notes)

    def test_r4_subprocess_behavior_does_not_use_filesystem_code(self):
        result = _failed("proc.exec", {"bytes_read_stdout": 0, "bytes_read_stderr": 0,
            "bytes_saved_stdout": 0, "bytes_saved_stderr": 0, "truncated_stdout": False,
            "truncated_stderr": False, "exit_code": 1, "timed_out": False,
            "kill_ok": False, "taskkill_exit_code": None, "spawn_error": None}, "unexpected output")
        self.assertEqual("SUBPROC_BEHAVIOR_MISMATCH", result.error.code)

    def test_r5_csv_pid_matching_is_exact(self):
        text = '"python.exe","12345","Console","1","10 K"\r\n'
        self.assertFalse(_csv_has_pid(text, 1234))
        self.assertTrue(_csv_has_pid(text, 12345))

    def test_r6_existing_evidence_is_replaced(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "evidence.sqlite3")
            with open(path, "w", encoding="utf-8", newline="") as writer:
                writer.write("not a database")
            result = write_sqlite_evidence(path, [CheckResult("one", "pass", {})],
                                            "2026-07-27T00:00:00+00:00", "0.1.0")
            self.assertEqual("pass", result.status)
            self.assertTrue(result.details["preexisting_db_replaced"])
            connection = sqlite3.connect(path)
            self.assertEqual(1, connection.execute("SELECT COUNT(*) FROM checks").fetchone()[0])
            connection.close()

    def test_r6_serialization_failure_removes_half_database(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "evidence.sqlite3")
            with self.assertRaises(TypeError):
                write_sqlite_evidence(path, [CheckResult("one", "pass", {"bad": set([1])})],
                                      "2026-07-27T00:00:00+00:00", "0.1.0")
            self.assertFalse(os.path.exists(path))

    def test_r7_safe_getuser_and_help_exit_zero(self):
        with mock.patch.object(c_sys.getpass, "getuser", side_effect=OSError("unavailable")):
            self.assertEqual("unknown", c_sys.safe_getuser())
        self.assertEqual(0, probe_main.main(["--help"]))
        self.assertEqual(3, probe_main.main(["--timeout-scale", "invalid"]))

    def test_r7_host_consumes_verdict(self):
        results = [CheckResult("os.version", "pass", {"verdict": {
            "os_caption": "Windows-6.1-7601-SP1", "os_build": "7601",
            "os_service_pack": "SP1", "os_arch": "64bit"}}),
            CheckResult("python.runtime", "pass", {"python_version": "3.8.10",
            "python_implementation": "CPython"}),
            CheckResult("env.user_temp", "pass", {"username": "user", "temp_dir": "temp"})]
        host = probe_main._host(results)
        self.assertEqual("Windows-6.1-7601-SP1", host["os_caption"])
        self.assertEqual("SP1", host["os_service_pack"])

    def test_r8_non_target_precedes_source_conflict(self):
        first = {"available": True, "raw": {"major": 10, "minor": 0, "build": 1,
                 "service_pack": "", "service_pack_major": 0, "service_pack_minor": 0, "platform": 2}}
        second = {"available": True, "raw": {"release": "10", "version": "10.0.2", "csd": "", "ptype": ""}}
        third = {"available": True, "raw": {"ProductName": "Windows", "CurrentVersion": "6.3",
                 "CurrentBuildNumber": "3", "CSDVersion": ""}}
        with mock.patch.object(c_os, "_getwindowsversion_source", return_value=first), \
             mock.patch.object(c_os, "_win32_ver_source", return_value=second), \
             mock.patch.object(c_os, "_registry_source", return_value=third):
            result = c_os.check_os_version(Context(tempfile.gettempdir()))
        self.assertEqual("NON_TARGET_OS", result.error.code)
        self.assertFalse(result.details["verdict"]["is_windows7"])

    def test_r8_path_too_long_both_forms(self):
        details = {}
        posix = c_fs._failure("fs.unicode_paths", details, OSError(errno.ENAMETOOLONG, "long"))
        self.assertEqual("PATH_TOO_LONG", posix.error.code)
        win = c_fs._failure("fs.unicode_paths", {}, type("WinError", (Exception,), {"winerror": 206})())
        self.assertEqual("PATH_TOO_LONG", win.error.code)

    def test_r8_encoding_byte_details(self):
        with tempfile.TemporaryDirectory() as directory:
            result = c_fs.check_encodings(Context(directory))
        self.assertEqual("pass", result.status)
        for encoding in ("utf-8", "utf-8-sig", "gbk", "utf-16", "utf-16-le"):
            self.assertTrue(result.details["encodings"][encoding]["bytes_ok"])
            self.assertTrue(result.details["encodings"][encoding]["bom_ok"])

    def test_r7_report_build_failure_returns_three(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "result.json")
            with mock.patch.object(probe_main, "build_report", side_effect=TypeError("bad report")):
                self.assertEqual(3, probe_main.main(["--out", path, "--db", "-", "--only", "sqlite.basic"]))
            self.assertFalse(os.path.exists(path))
