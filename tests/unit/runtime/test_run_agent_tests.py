"""Tests for the Phase 2 dynamic unittest entry point (F40--F43)."""

from __future__ import print_function

import importlib.util
import io
import os
import tempfile
import unittest
from unittest import mock


def _load_runner():
    path = os.path.abspath(os.path.join(
        os.path.dirname(__file__), "..", "..", "..", "scripts",
        "run_agent_tests.py"))
    specification = importlib.util.spec_from_file_location("agent_test_runner", path)
    module = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(module)
    return module


RUNNER = _load_runner()


class RunAgentTestsTests(unittest.TestCase):
    """Exercise discovery failures and deterministic loading without pytest."""

    def _write_test(self, directory, name, content):
        path = os.path.join(directory, name)
        with open(path, "w", encoding="utf-8", newline="") as writer:
            writer.write(content)
        return path

    def test_nested_test_files_are_discovered_in_normalized_order(self):
        with tempfile.TemporaryDirectory() as directory:
            nested = os.path.join(directory, "nested")
            os.mkdir(nested)
            later = self._write_test(nested, "test_z.py", "")
            earlier = self._write_test(directory, "test_a.py", "")
            paths = RUNNER.discover_test_files([directory])
        self.assertEqual(sorted([earlier, later], key=os.path.normcase), paths)

    def test_zero_tests_and_below_minimum_are_failures(self):
        with tempfile.TemporaryDirectory() as directory:
            empty = RUNNER.run_test_suite([directory], minimum_test_count=1,
                                          stream=io.StringIO())
            self.assertEqual(1, empty.exit_code)
            self._write_test(directory, "test_one.py", (
                "import unittest\n"
                "class One(unittest.TestCase):\n"
                "    def test_one(self):\n"
                "        self.assertTrue(True)\n"))
            below = RUNNER.run_test_suite([directory], minimum_test_count=2,
                                          stream=io.StringIO())
        self.assertEqual(1, below.exit_code)
        self.assertEqual(1, below.tests_run)

    def test_import_error_is_a_nonzero_discovery_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            self._write_test(directory, "test_broken.py", "raise ImportError('broken')\n")
            result = RUNNER.run_test_suite([directory], stream=io.StringIO())
        self.assertEqual(1, result.exit_code)
        self.assertIn("cannot import", result.errors[0])

    def test_unreadable_directory_is_a_nonzero_discovery_failure(self):
        with mock.patch.object(RUNNER.os, "walk", side_effect=OSError("denied")):
            result = RUNNER.run_test_suite([os.getcwd()], stream=io.StringIO())
        self.assertEqual(1, result.exit_code)
        self.assertIn("not readable", result.errors[0])

    def test_test_failure_propagates_as_nonzero_exit(self):
        with tempfile.TemporaryDirectory() as directory:
            self._write_test(directory, "test_failure.py", (
                "import unittest\n"
                "class Failure(unittest.TestCase):\n"
                "    def test_failure(self):\n"
                "        self.assertEqual(1, 2)\n"))
            result = RUNNER.run_test_suite([directory], minimum_test_count=1,
                                           stream=io.StringIO())
        self.assertEqual(1, result.exit_code)
        self.assertEqual(1, result.tests_run)

    def test_compileall_and_static_scan_have_clean_baselines(self):
        root = RUNNER.repository_root()
        self.assertEqual(0, RUNNER.run_compileall(root))
        self.assertEqual([], RUNNER.static_safety_scan(root))

    def test_static_scan_rejects_forbidden_production_operations(self):
        with tempfile.TemporaryDirectory() as directory:
            source_directory = os.path.join(directory, "src", "win7_agent")
            os.makedirs(source_directory)
            path = os.path.join(source_directory, "bad.py")
            with open(path, "w", encoding="utf-8", newline="") as writer:
                writer.write("import socket\nopen('bad.txt')\nvalue: list[str]\n")
            findings = RUNNER.static_safety_scan(directory)
        joined = "\n".join(findings)
        self.assertIn("forbidden import socket", joined)
        self.assertIn("text open without encoding", joined)
        self.assertIn("forbidden Python 3.9 generic annotation", joined)
