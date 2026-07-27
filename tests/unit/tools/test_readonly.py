import os
import tempfile
import unittest
from unittest import mock

from win7_agent.tools import ToolRequest, ToolRuntime, build_readonly_registry
from win7_agent.workspace import WorkspaceContext


class ReadonlyToolTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.root = self.tempdir.name
        with open(os.path.join(self.root, "sample.py"), "w", encoding="utf-8", newline="") as source:
            source.write("def target_function():\n    return 1\n")
        with open(os.path.join(self.root, "big.txt"), "w", encoding="utf-8", newline="") as source:
            source.write("x" * 270000)
        self.runtime = ToolRuntime(WorkspaceContext(self.root), build_readonly_registry(WorkspaceContext(self.root)))

    def tearDown(self):
        self.tempdir.cleanup()

    def request(self, name, arguments):
        return self.runtime.execute(ToolRequest("call", name, arguments, "run"))

    def test_read_range_and_literal_search(self):
        result = self.request("read_file_range", {"path": "sample.py", "start_line": 1, "end_line": 2})
        self.assertEqual("ok", result.status)
        self.assertIn("1: def target_function", result.content)
        found = self.request("search_text", {"pattern": "target_function"})
        self.assertIn("sample.py:1", found.content)

    def test_truncates_large_file(self):
        result = self.request("read_file", {"path": "big.txt"})
        self.assertTrue(result.truncated)
        self.assertLessEqual(len(result.content.encode("utf-8")), 262144)

    def test_path_escape_and_bad_arguments_do_not_execute(self):
        escaped = self.request("read_file", {"path": "../outside.txt"})
        self.assertEqual("PATH_TRAVERSAL_DENIED", escaped.error["code"])
        bad = self.request("read_file", {"path": 42})
        self.assertEqual("INVALID_TOOL_ARGUMENT", bad.error["code"])
        self.assertFalse(bad.executed)

    def test_bool_is_not_an_integer_tool_argument(self):
        result = self.request("read_file_range", {"path": "sample.py", "start_line": True, "end_line": 1})
        self.assertEqual("INVALID_TOOL_ARGUMENT", result.error["code"])

    def test_unregistered_tool_is_structured_error(self):
        result = self.request("run_command", {})
        self.assertEqual("TOOL_NOT_FOUND", result.error["code"])
        self.assertFalse(result.executed)

    def test_implementation_failures_are_marked_executed(self):
        result = self.request("read_file", {"path": "missing.txt"})
        self.assertEqual("FILE_NOT_FOUND", result.error["code"])
        self.assertTrue(result.executed)

    def test_git_is_explicitly_degraded_when_not_installed(self):
        with mock.patch("win7_agent.tools.readonly.shutil.which", return_value=None):
            result = self.request("git_status", {})
        self.assertEqual("GIT_UNAVAILABLE", result.error["code"])

    def test_git_timeout_is_structured(self):
        with mock.patch("win7_agent.tools.readonly.shutil.which", return_value="git"):
            with mock.patch("win7_agent.tools.readonly.run_git", return_value=(-9, b"", b"", False, True)):
                result = self.request("git_status", {})
        self.assertEqual("TOOL_TIMEOUT", result.error["code"])

    def test_search_text_stops_at_file_and_output_budgets(self):
        from win7_agent.tools import readonly

        with open(os.path.join(self.root, "large.txt"), "w", encoding="utf-8", newline="") as source:
            source.write("target_function\n" * 100000)
        result = self.request("search_text", {"pattern": "target_function", "max_matches": 500})
        self.assertTrue(result.truncated)
        self.assertLessEqual(len(result.content.encode("utf-8")), readonly.SEARCH_OUTPUT_BYTES)

    def test_search_text_scans_later_file_after_large_file_prefix(self):
        from win7_agent.tools import readonly

        with open(os.path.join(self.root, "a-large.txt"), "w", encoding="utf-8", newline="") as source:
            source.write("x" * readonly.SEARCH_FILE_BYTES)
            source.write("target_function after budget\n")
        with open(os.path.join(self.root, "z-later.txt"), "w", encoding="utf-8", newline="") as source:
            source.write("target_function later file\n")
        result = self.request("search_text", {"pattern": "target_function"})
        self.assertTrue(result.truncated)
        self.assertIn("z-later.txt:1", result.content)
