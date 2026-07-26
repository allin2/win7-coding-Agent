import os
import tempfile
import unittest

from win7_agent.context import ContextCompiler
from win7_agent.models import ToolResultMessage
from win7_agent.tools import build_readonly_registry
from win7_agent.workspace import WorkspaceContext


class ContextCompilerTests(unittest.TestCase):
    def test_bounds_instructions_and_recent_tool_results(self):
        with tempfile.TemporaryDirectory() as directory:
            with open(os.path.join(directory, "AGENTS.md"), "w", encoding="utf-8", newline="") as source:
                source.write("a" * 5000)
            workspace = WorkspaceContext(directory)
            compiler = ContextCompiler(workspace, build_readonly_registry(workspace).specs())
            results = [ToolResultMessage(str(index), "ok", "x" * 9000, False) for index in range(6)]
            compiled = compiler.compile("inspect", {"turn_count": 1, "tool_call_count": 2, "max_turns": 8, "max_tool_calls": 16}, results)
            self.assertEqual(7, len(compiled.messages))
            self.assertEqual(4096, len(compiled.messages[0].content.split("\n")[1]))
            self.assertEqual(8192, len(compiled.messages[-1].content))
            self.assertEqual(6, len(compiled.tools))
