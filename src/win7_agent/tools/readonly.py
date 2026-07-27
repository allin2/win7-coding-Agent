"""Implementations of the prototype's fixed six-tool read-only allowlist."""

import os
import shutil
import time
from typing import Any, Dict, List, Optional, Tuple

from win7_agent.workspace import WorkspaceContext, WorkspaceError

from .contracts import ToolRequest, ToolResult, ToolSpec
from .registry import ToolRegistry
from .subproc import run_git

READ_LIMIT = 262144
GIT_LIMIT = 1048576
SEARCH_MAX_FILES = 2000
SEARCH_FILE_BYTES = 1048576
# The total budget follows from the frozen per-file and file-count budgets.
# Keeping it explicit lets the loop account for all scanned bytes and makes
# the global stopping condition testable without making a single large file
# abort the whole search.
SEARCH_TOTAL_BYTES = SEARCH_MAX_FILES * SEARCH_FILE_BYTES
SEARCH_OUTPUT_BYTES = 262144


def _error(tool_call_id: str, code: str, message: str, duration_ms: int = 0, executed: bool = True) -> ToolResult:
    return ToolResult(tool_call_id, "error", "", False, {"code": code, "message": message}, duration_ms, executed)


def _ok(tool_call_id: str, content: str, truncated: bool, duration_ms: int) -> ToolResult:
    return ToolResult(tool_call_id, "ok", content, truncated, None, duration_ms, True)


def _read_text(path: str, encoding: str, byte_limit: int) -> Tuple[str, bool]:
    with open(path, "rb") as source:
        data = source.read(byte_limit + 1)
    truncated = len(data) > byte_limit
    return data[:byte_limit].decode(encoding, errors="replace"), truncated


class ToolRuntime:
    def __init__(self, workspace: WorkspaceContext, registry: ToolRegistry) -> None:
        self.workspace = workspace
        self.registry = registry

    def execute(self, request: ToolRequest) -> ToolResult:
        started = time.monotonic()
        entry = self.registry.lookup(request.tool_name)
        if entry is None:
            return _error(request.tool_call_id, "TOOL_NOT_FOUND", "tool is not registered", executed=False)
        spec, implementation = entry
        problem = self.registry.validate(spec, request.arguments)
        if problem:
            return _error(request.tool_call_id, "INVALID_TOOL_ARGUMENT", problem, executed=False)
        try:
            result = implementation(request)
            return result
        except WorkspaceError as error:
            return _error(request.tool_call_id, error.code, error.message, _duration(started))
        except FileNotFoundError:
            return _error(request.tool_call_id, "FILE_NOT_FOUND", "requested path does not exist", _duration(started))
        except Exception as error:
            return _error(request.tool_call_id, "UNEXPECTED", str(error), _duration(started))


def _duration(started: float) -> int:
    return int((time.monotonic() - started) * 1000)


def build_readonly_registry(workspace: WorkspaceContext) -> ToolRegistry:
    registry = ToolRegistry()

    def list_directory(request: ToolRequest) -> ToolResult:
        started = time.monotonic()
        path = workspace.resolve(request.arguments.get("path", ""))
        if not os.path.isdir(path):
            return _error(request.tool_call_id, "FILE_NOT_FOUND", "path is not a directory", _duration(started))
        entries = []
        for name in sorted(os.listdir(path)):
            if workspace.is_ignored_name(name):
                continue
            item = os.path.join(path, name)
            entries.append({"name": name, "type": "directory" if os.path.isdir(item) else "file", "size": os.path.getsize(item) if os.path.isfile(item) else 0})
            if len(entries) >= 2000:
                break
        content = "\n".join("{0}\t{1}\t{2}".format(item["type"], item["size"], item["name"]) for item in entries)
        return _ok(request.tool_call_id, content, len(entries) >= 2000, _duration(started))

    def read_file(request: ToolRequest) -> ToolResult:
        started = time.monotonic()
        path = workspace.resolve(request.arguments["path"])
        if not os.path.isfile(path):
            return _error(request.tool_call_id, "FILE_NOT_FOUND", "path is not a file", _duration(started))
        content, truncated = _read_text(path, request.arguments.get("encoding", "utf-8"), READ_LIMIT)
        return _ok(request.tool_call_id, content, truncated, _duration(started))

    def read_file_range(request: ToolRequest) -> ToolResult:
        started = time.monotonic()
        start_line = request.arguments["start_line"]
        end_line = request.arguments["end_line"]
        if start_line < 1 or end_line < start_line or end_line - start_line + 1 > 500:
            return _error(request.tool_call_id, "INVALID_TOOL_ARGUMENT", "line range must be 1..500 ordered lines", _duration(started))
        path = workspace.resolve(request.arguments["path"])
        if not os.path.isfile(path):
            return _error(request.tool_call_id, "FILE_NOT_FOUND", "path is not a file", _duration(started))
        lines = []
        with open(path, "r", encoding=request.arguments.get("encoding", "utf-8"), errors="replace", newline="") as source:
            for number, line in enumerate(source, 1):
                if number > end_line:
                    break
                if number >= start_line:
                    lines.append("{0}: {1}".format(number, line.rstrip("\r\n")))
        return _ok(request.tool_call_id, "\n".join(lines), False, _duration(started))

    def search_text(request: ToolRequest) -> ToolResult:
        started = time.monotonic()
        pattern = request.arguments["pattern"]
        root = workspace.resolve(request.arguments.get("path", ""))
        max_matches = request.arguments.get("max_matches", 200)
        if max_matches < 1 or max_matches > 500:
            return _error(request.tool_call_id, "INVALID_TOOL_ARGUMENT", "max_matches must be from 1 to 500", _duration(started))
        if not os.path.isdir(root):
            return _error(request.tool_call_id, "FILE_NOT_FOUND", "search path is not a directory", _duration(started))
        matches = []
        output_bytes = 0
        scanned_files = 0
        scanned_bytes = 0
        any_file_truncated = False
        for directory, subdirs, files in os.walk(root):
            subdirs[:] = [item for item in subdirs if not workspace.is_ignored_name(item)]
            for name in sorted(files):
                if scanned_files >= SEARCH_MAX_FILES or scanned_bytes >= SEARCH_TOTAL_BYTES:
                    return _ok(request.tool_call_id, "\n".join(matches), True, _duration(started))
                file_path = os.path.join(directory, name)
                scanned_files += 1
                if scanned_files > SEARCH_MAX_FILES:
                    return _ok(request.tool_call_id, "\n".join(matches), True, _duration(started))
                try:
                    remaining_bytes = SEARCH_TOTAL_BYTES - scanned_bytes
                    file_budget = min(SEARCH_FILE_BYTES, remaining_bytes)
                    with open(file_path, "rb") as source:
                        data = source.read(file_budget + 1)
                    file_truncated = len(data) > file_budget
                    data = data[:file_budget]
                    scanned_bytes += len(data)
                    any_file_truncated = any_file_truncated or file_truncated
                    if b"\x00" in data:
                        continue
                    for number, line in enumerate(data.decode("utf-8", errors="replace").splitlines(), 1):
                        if pattern in line:
                            text = line[:500]
                            match = "{0}:{1}: {2}".format(workspace.relative_path(file_path), number, text)
                            match_bytes = len((match + "\n").encode("utf-8"))
                            if output_bytes + match_bytes > SEARCH_OUTPUT_BYTES:
                                return _ok(request.tool_call_id, "\n".join(matches), True, _duration(started))
                            matches.append(match)
                            output_bytes += match_bytes
                            if len(matches) >= max_matches:
                                return _ok(request.tool_call_id, "\n".join(matches), True, _duration(started))
                    if file_truncated:
                        # This file reached only its own budget.  Continue
                        # with later files unless a global budget is now gone.
                        continue
                except (OSError, UnicodeError):
                    continue
        return _ok(request.tool_call_id, "\n".join(matches), any_file_truncated, _duration(started))

    def git_result(request: ToolRequest, argv: List[str]) -> ToolResult:
        started = time.monotonic()
        if shutil.which("git") is None:
            return _error(request.tool_call_id, "GIT_UNAVAILABLE", "git executable was not found", _duration(started))
        try:
            code, stdout, stderr, truncated, timed_out = run_git(argv, workspace.root, 10.0, GIT_LIMIT)
        except OSError as error:
            return _error(request.tool_call_id, "SUBPROC_SPAWN_FAILED", str(error), _duration(started))
        if timed_out:
            return _error(request.tool_call_id, "TOOL_TIMEOUT", "git command exceeded 10 seconds", _duration(started))
        content = stdout.decode("utf-8", errors="replace")
        if code != 0:
            message = stderr.decode("utf-8", errors="replace")[:4096]
            return _error(request.tool_call_id, "UNEXPECTED", message or "git command failed", _duration(started))
        return _ok(request.tool_call_id, content, truncated, _duration(started))

    def git_status(request: ToolRequest) -> ToolResult:
        return git_result(request, ["git", "status", "--porcelain"])

    def git_diff(request: ToolRequest) -> ToolResult:
        argv = ["git", "diff", "--"]
        if "path" in request.arguments and request.arguments["path"]:
            resolved = workspace.resolve(request.arguments["path"])
            argv.append(workspace.relative_path(resolved))
        return git_result(request, argv)

    registry.register(ToolSpec("list_directory", "List a workspace directory.", {"path": {"type": str, "required": False}}, "READ_ONLY"), list_directory)
    registry.register(ToolSpec("read_file", "Read a text file.", {"path": {"type": str, "required": True}, "encoding": {"type": str, "required": False}}, "READ_ONLY"), read_file)
    registry.register(ToolSpec("read_file_range", "Read a numbered text range.", {"path": {"type": str, "required": True}, "start_line": {"type": int, "required": True}, "end_line": {"type": int, "required": True}, "encoding": {"type": str, "required": False}}, "READ_ONLY"), read_file_range)
    registry.register(ToolSpec("search_text", "Search literal text under a workspace directory.", {"pattern": {"type": str, "required": True}, "path": {"type": str, "required": False}, "max_matches": {"type": int, "required": False}}, "READ_ONLY"), search_text)
    registry.register(ToolSpec("git_status", "Show fixed read-only Git status.", {}, "READ_ONLY"), git_status)
    registry.register(ToolSpec("git_diff", "Show fixed read-only Git diff.", {"path": {"type": str, "required": False}}, "READ_ONLY"), git_diff)
    return registry
