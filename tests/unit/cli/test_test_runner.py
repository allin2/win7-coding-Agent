import importlib.util
import os
import tempfile
import unittest
from unittest import mock


def _runner_module():
    root = os.path.realpath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    path = os.path.join(root, "scripts", "run_prototype_tests.py")
    spec = importlib.util.spec_from_file_location("prototype_test_runner", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PrototypeTestRunnerTests(unittest.TestCase):
    def _write_test(self, root, relative, content):
        path = os.path.join(root, relative)
        os.makedirs(os.path.dirname(path))
        with open(path, "w", encoding="utf-8", newline="") as source:
            source.write(content)

    def test_zero_and_below_minimum_counts_fail(self):
        runner = _runner_module()
        with tempfile.TemporaryDirectory() as directory:
            os.makedirs(os.path.join(directory, "tests", "unit"))
            os.makedirs(os.path.join(directory, "tests", "integration"))
            self.assertEqual(1, runner.main(root=directory, minimum_test_count=1))
            self._write_test(directory, "tests/unit/nested/test_discovered.py", "import unittest\nclass T(unittest.TestCase):\n    def test_ok(self):\n        pass\n")
            self.assertEqual(1, runner.main(root=directory, minimum_test_count=2))
            self.assertEqual(0, runner.main(root=directory, minimum_test_count=1))

    def test_import_and_directory_read_failures_are_nonzero(self):
        runner = _runner_module()
        with tempfile.TemporaryDirectory() as directory:
            self._write_test(directory, "tests/unit/bad/test_bad.py", "import definitely_missing_module\n")
            os.makedirs(os.path.join(directory, "tests", "integration"))
            self.assertEqual(1, runner.main(root=directory, minimum_test_count=1))
        with mock.patch.object(runner, "_find_test_directories", return_value=([], ["cannot read test directory"])):
            self.assertEqual(1, runner.main(root=os.getcwd(), minimum_test_count=1))
