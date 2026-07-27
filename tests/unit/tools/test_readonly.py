"""F10--F25 read-only tool, registry, policy, and bounded Git tests."""

import io
import os
import subprocess
import tempfile
import unittest
from unittest import mock

from win7_agent.models import ToolRequest
from win7_agent.policy import PermissionType, PolicyEngine
from win7_agent.tools import ToolRuntime, build_readonly_registry
from win7_agent.tools.contracts import ToolSpec
from win7_agent.tools.registry import ToolRegistry
from win7_agent.workspace import WorkspaceContext


class ReadonlyToolsTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = self.directory.name
        with open(os.path.join(self.root, "code.py"), "w", encoding="utf-8", newline="") as writer:
            writer.write("one\ntarget_function()\nthree\n")
        with open(os.path.join(self.root, "binary.bin"), "wb") as writer:
            writer.write(b"x\x00y")
        self.workspace = WorkspaceContext(self.root)
        self.runtime = ToolRuntime(self.workspace, build_readonly_registry(self.workspace))

    def tearDown(self):
        self.directory.cleanup()

    def call(self, name, arguments):
        return self.runtime.execute(ToolRequest("call", name, arguments))

    def test_f10_list_read_and_range_return_expected_content(self):
        self.assertIn("code.py", self.call("list_directory", {}).content)
        self.assertIn("target_function", self.call("read_file", {"path": "code.py"}).content)
        self.assertEqual("2: target_function()", self.call("read_file_range", {
            "path": "code.py", "start_line": 2, "end_line": 2}).content)

    def test_f11_to_f14_binary_encoding_range_and_type_errors(self):
        self.assertEqual("NOT_A_TEXT_FILE", self.call("read_file", {"path": "binary.bin"}).error["code"])
        invalid = self.call("read_file_range", {"path": "code.py", "start_line": True, "end_line": 2})
        self.assertEqual("INVALID_TOOL_ARGUMENT", invalid.error["code"])
        self.assertFalse(invalid.executed)
        inverted = self.call("read_file_range", {"path": "code.py", "start_line": 3, "end_line": 2})
        self.assertFalse(inverted.executed)

    def test_f15_search_limits_report_the_actual_budget_reason(self):
        from win7_agent.tools import readonly
        with mock.patch.object(readonly, "SEARCH_MAX_FILES", 1):
            files = self.call("search_text", {"pattern": "target"})
        self.assertTrue(files.truncated)
        self.assertIn("reason=file_count", files.content)
        with mock.patch.object(readonly, "SEARCH_MAX_MATCHES", 1):
            matches = self.call("search_text", {"pattern": "target", "max_matches": 1})
        self.assertTrue(matches.truncated)
        self.assertIn("reason=matches", matches.content)
        with mock.patch.object(readonly, "SEARCH_TOTAL_BYTES", 4):
            total = self.call("search_text", {"pattern": "target"})
        self.assertTrue(total.truncated)
        self.assertIn("reason=total_bytes", total.content)
        with mock.patch.object(readonly, "SEARCH_MAX_OUTPUT_BYTES", 1):
            output = self.call("search_text", {"pattern": "target"})
        self.assertTrue(output.truncated)
        self.assertIn("reason=output_bytes", output.content)

    def test_f15_large_file_prefix_does_not_stop_later_files(self):
        from win7_agent.tools import readonly
        with open(os.path.join(self.root, "large.txt"), "w", encoding="utf-8", newline="") as writer:
            writer.write("x" * 32)
        with open(os.path.join(self.root, "later.txt"), "w", encoding="utf-8", newline="") as writer:
            writer.write("target later")
        with mock.patch.object(readonly, "SEARCH_FILE_BYTES", 6), \
                mock.patch.object(readonly, "SEARCH_TOTAL_BYTES", 100):
            result = self.call("search_text", {"pattern": "target"})
        self.assertIn("later.txt", result.content)

    def test_f16_search_skips_binary_and_ignored_directory(self):
        os.mkdir(os.path.join(self.root, ".git"))
        with open(os.path.join(self.root, ".git", "secret.py"), "w", encoding="utf-8", newline="") as writer:
            writer.write("target_function")
        found = self.call("search_text", {"pattern": "target_function"})
        self.assertIn("code.py", found.content)
        self.assertNotIn("secret.py", found.content)

    def test_f20_to_f25_policy_precedes_execution_and_preflight_needs_no_allow(self):
        registry = ToolRegistry()
        calls = []
        registry.register(ToolSpec("write", "blocked", {}, PermissionType.WORKSPACE_WRITE),
                          lambda request: calls.append(request))
        runtime = ToolRuntime(self.workspace, registry)
        events = []
        decision, result = runtime.dispatch(ToolRequest("deny", "write", {}), PolicyEngine(),
                                            lambda kind, payload: events.append(kind))
        self.assertEqual("DENY", decision.decision)
        self.assertIsNone(result)
        self.assertEqual([], calls)
        self.assertEqual(["policy.decision", "tool.denied"], events)
        unknown_decision, unknown = runtime.dispatch(ToolRequest("missing", "none", {}), PolicyEngine())
        self.assertIsNone(unknown_decision)
        self.assertEqual("TOOL_NOT_FOUND", unknown.error["code"])
        self.assertFalse(unknown.executed)

    def test_f17_git_missing_is_structured(self):
        with mock.patch("win7_agent.tools.readonly.shutil.which", return_value=None):
            result = self.call("git_status", {})
        self.assertEqual("GIT_UNAVAILABLE", result.error["code"])

    def test_f18_git_nonzero_is_structured(self):
        from win7_agent.tools.subproc import GitCapture
        capture = GitCapture(1, b"", b"bad git", False, False, "")
        with mock.patch("win7_agent.tools.readonly.shutil.which", return_value="git"), \
                mock.patch("win7_agent.tools.readonly.run_git", return_value=capture):
            result = self.call("git_diff", {})
        self.assertEqual("UNEXPECTED", result.error["code"])
        self.assertIn("bad git", result.error["message"])

    def test_f19_git_timeout_uses_bounded_double_wait_and_closes_pipes(self):
        from win7_agent.tools import subproc

        class Process(object):
            def __init__(self):
                self.stdout = io.BytesIO(b"out")
                self.stderr = io.BytesIO(b"err")
                self.pid = 10
                self.returncode = None
                self.waits = 0
                self.kills = 0
            def wait(self, timeout=None):
                self.waits += 1
                if self.waits <= 2:
                    raise subprocess.TimeoutExpired("git", timeout)
                return -9
            def poll(self):
                return None
            def kill(self):
                self.kills += 1
                self.returncode = -9

        process = Process()
        with mock.patch("win7_agent.tools.subproc.subprocess.Popen", return_value=process), \
                mock.patch("win7_agent.tools.subproc.shutil.which", return_value=None):
            captured = subproc.run_git("status", self.root, timeout_s=0.01, max_output_bytes=8)
        self.assertTrue(captured.timed_out)
        self.assertEqual(1, process.kills)
        self.assertEqual(-9, captured.returncode)
        self.assertTrue(process.stdout.closed)
        self.assertTrue(process.stderr.closed)
