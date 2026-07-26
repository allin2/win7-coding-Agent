"""Build a small request from explicit inputs without scanning project contents."""

import os
from typing import Any, Dict, Iterable, List

from win7_agent.models import Message, ModelRequest, ToolResultMessage
from win7_agent.workspace import WorkspaceContext


class ContextCompiler:
    def __init__(self, workspace: WorkspaceContext, tool_specs: Iterable[Any]) -> None:
        self._workspace = workspace
        self._tool_specs = list(tool_specs)

    def compile(self, task: str, run_snapshot: Dict[str, Any], recent_results: List[ToolResultMessage]) -> ModelRequest:
        instructions = self._read_project_instructions()
        remaining_turns = max(0, run_snapshot["max_turns"] - run_snapshot["turn_count"])
        remaining_tools = max(0, run_snapshot["max_tool_calls"] - run_snapshot["tool_call_count"])
        system = "Project instructions:\n{0}\nBudget: remaining_turns={1}; remaining_tool_calls={2}".format(instructions, remaining_turns, remaining_tools)
        messages = [Message("system", system), Message("user", task)]
        for result in recent_results[-5:]:
            content = result.content[:8192]
            messages.append(Message("tool", content, result.tool_call_id))
        tools = [spec.to_dict() for spec in self._tool_specs]
        return ModelRequest(messages, tools, run_snapshot["turn_count"] + 1, {"remaining_turns": remaining_turns, "remaining_tool_calls": remaining_tools})

    def _read_project_instructions(self) -> str:
        path = os.path.join(self._workspace.root, "AGENTS.md")
        if not os.path.isfile(path):
            return ""
        with open(path, "r", encoding="utf-8", errors="replace", newline="") as source:
            return source.read(4096)
