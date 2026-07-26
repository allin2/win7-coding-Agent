import os
import tempfile
import unittest

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

    def test_unregistered_tool_is_structured_error(self):
        result = self.request("run_command", {})
        self.assertEqual("TOOL_NOT_FOUND", result.error["code"])
