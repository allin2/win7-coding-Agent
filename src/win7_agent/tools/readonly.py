"""The six frozen, bounded, read-only Phase 2 tool implementations."""

from __future__ import print_function

import os
import shutil
import time

from win7_agent.models import ToolResult
from win7_agent.policy import PermissionType
from win7_agent.workspace import WorkspaceError

from .contracts import ToolSpec
from .registry import ToolRegistry
from .subproc import run_git


READ_LIMIT = 262144
GIT_LIMIT = 1048576
SEARCH_FILE_BYTES = 1024 * 1024
SEARCH_MAX_FILES = 2000
SEARCH_TOTAL_BYTES = SEARCH_FILE_BYTES * SEARCH_MAX_FILES
SEARCH_MAX_OUTPUT_BYTES = 256 * 1024
SEARCH_MAX_MATCHES = 500


def _duration(started):
    return int((time.monotonic() - started) * 1000)


def _result(status, executed, content="", truncated=False, error=None):
    return ToolResult(status, executed, content, truncated, error)


def _error(code, message, executed=True):
    return _result("error", executed, error={"code": code, "message": message})


def _truncated_content(lines, reason):
    notice = "TRUNCATED reason={0}".format(reason)
    return "\n".join(list(lines) + [notice])


def _read_limited(path, encoding, limit):
    with open(path, "rb") as reader:
        data = reader.read(limit + 1)
    truncated = len(data) > limit
    data = data[:limit]
    if b"\x00" in data:
        raise WorkspaceError("NOT_A_TEXT_FILE", "file contains NUL byte")
    return data.decode(encoding, errors="replace"), truncated


class ToolRuntime(object):
    """Validate and invoke registered read-only tool functions exactly once."""

    def __init__(self, workspace, registry):
        self.workspace = workspace
        self.registry = registry

    def execute(self, request):
        entry = self.registry.lookup(request.name)
        if entry is None:
            return _error("TOOL_NOT_FOUND", "tool is not registered", executed=False)
        spec, implementation = entry
        problem = self._problem(spec, request.arguments)
        if problem:
            return _error("INVALID_TOOL_ARGUMENT", problem, executed=False)
        try:
            return implementation(request)
        except WorkspaceError as error:
            return _error(error.code, error.message)
        except OSError as error:
            return _error("UNEXPECTED", str(error))

    @staticmethod
    def _problem(spec, arguments):
        problem = ToolRegistry.validate(spec, arguments)
        if problem:
            return problem
        if spec.name == "read_file_range":
            start = arguments["start_line"]
            end = arguments["end_line"]
            if start < 1 or end < start:
                return "invalid line range"
        if spec.name == "search_text":
            maximum = arguments.get("max_matches", 200)
            if maximum < 1 or maximum > SEARCH_MAX_MATCHES:
                return "max_matches must be 1..500"
        return ""

    def dispatch(self, request, policy_engine, event_sink=None):
        """Apply policy before invoking an implementation, never after it."""
        entry = self.registry.lookup(request.name)
        if entry is None:
            return None, _error("TOOL_NOT_FOUND", "tool is not registered", executed=False)
        spec, unused_implementation = entry
        problem = self._problem(spec, request.arguments)
        if problem:
            return None, _error("INVALID_TOOL_ARGUMENT", problem, executed=False)
        decision = policy_engine.evaluate(spec.permission)
        if event_sink is not None:
            event_sink("policy.decision", {"tool_call_id": request.tool_call_id,
                                            "decision": decision.to_dict()})
        if decision.decision == "DENY":
            if event_sink is not None:
                event_sink("tool.denied", {"tool_call_id": request.tool_call_id,
                                            "reason": decision.reason})
            return decision, None
        return decision, self.execute(request)


def build_readonly_registry(workspace):
    """Build the complete fixed Phase 2 registry; it exposes no write tool."""
    registry = ToolRegistry()

    def list_directory(request):
        path = workspace.resolve(request.arguments.get("path", ""))
        if not os.path.isdir(path):
            return _error("UNEXPECTED", "path is not a directory")
        entries = []
        for name in sorted(os.listdir(path)):
            if workspace.is_ignored_name(name):
                continue
            item = os.path.join(path, name)
            kind = "directory" if os.path.isdir(item) else "file"
            size = os.path.getsize(item) if os.path.isfile(item) else 0
            entries.append("{0}\t{1}\t{2}".format(kind, size, name))
            if len(entries) >= SEARCH_MAX_FILES:
                return _result("ok", True, _truncated_content(entries, "file_count"), True)
        return _result("ok", True, "\n".join(entries))

    def read_file(request):
        path = workspace.resolve(request.arguments["path"])
        if not os.path.isfile(path):
            return _error("UNEXPECTED", "path is not a file")
        content, truncated = _read_limited(path, request.arguments.get("encoding", "utf-8"), READ_LIMIT)
        return _result("ok", True, content, truncated)

    def read_file_range(request):
        start = request.arguments["start_line"]
        end = request.arguments["end_line"]
        path = workspace.resolve(request.arguments["path"])
        if not os.path.isfile(path):
            return _error("UNEXPECTED", "path is not a file")
        lines = []
        with open(path, "r", encoding=request.arguments.get("encoding", "utf-8"),
                  errors="replace", newline="") as reader:
            for number, line in enumerate(reader, 1):
                if number > end:
                    break
                if number >= start:
                    lines.append("{0}: {1}".format(number, line.rstrip("\r\n")))
        return _result("ok", True, "\n".join(lines))

    def search_text(request):
        pattern = request.arguments["pattern"]
        root = workspace.resolve(request.arguments.get("path", ""))
        max_matches = request.arguments.get("max_matches", 200)
        if not os.path.isdir(root):
            return _error("UNEXPECTED", "search path is not a directory")
        matches = []
        scanned_files = 0
        scanned_bytes = 0
        output_bytes = 0
        for directory, directories, names in os.walk(root):
            directories[:] = [name for name in directories if not workspace.is_ignored_name(name)]
            directories.sort()
            for name in sorted(names):
                if scanned_files >= SEARCH_MAX_FILES:
                    return _result("ok", True, _truncated_content(matches, "file_count"), True)
                if scanned_bytes >= SEARCH_TOTAL_BYTES:
                    return _result("ok", True, _truncated_content(matches, "total_bytes"), True)
                path = os.path.join(directory, name)
                scanned_files += 1
                try:
                    remaining = SEARCH_TOTAL_BYTES - scanned_bytes
                    limit = min(SEARCH_FILE_BYTES, remaining)
                    with open(path, "rb") as reader:
                        data = reader.read(limit + 1)
                except OSError:
                    continue
                data = data[:limit]
                scanned_bytes += len(data)
                if b"\x00" in data:
                    continue
                for number, line in enumerate(data.decode("utf-8", errors="replace").splitlines(), 1):
                    if pattern not in line:
                        continue
                    rendered = "{0}:{1}: {2}".format(
                        workspace.relative_path(path), number, line[:500])
                    rendered_bytes = len((rendered + "\n").encode("utf-8"))
                    if output_bytes + rendered_bytes > SEARCH_MAX_OUTPUT_BYTES:
                        return _result("ok", True, _truncated_content(matches, "output_bytes"), True)
                    matches.append(rendered)
                    output_bytes += rendered_bytes
                    if len(matches) >= max_matches:
                        return _result("ok", True, _truncated_content(matches, "matches"), True)
                if scanned_bytes >= SEARCH_TOTAL_BYTES:
                    return _result("ok", True, _truncated_content(matches, "total_bytes"), True)
        return _result("ok", True, "\n".join(matches))

    def git_result(operation, request):
        if shutil.which("git") is None:
            return _error("GIT_UNAVAILABLE", "git executable was not found")
        relative_path = None
        if operation == "diff" and request.arguments.get("path"):
            relative_path = workspace.relative_path(workspace.resolve(request.arguments["path"]))
        try:
            captured = run_git(operation, workspace.root, max_output_bytes=GIT_LIMIT,
                               relative_path=relative_path)
        except OSError as error:
            return _error("SUBPROC_SPAWN_FAILED", str(error))
        if captured.timed_out:
            return _error("TOOL_TIMEOUT", captured.termination_note or "git timeout")
        if captured.returncode != 0:
            message = captured.stderr.decode("utf-8", errors="replace")[:4096]
            return _error("UNEXPECTED", message or "git command failed")
        return _result("ok", True, captured.stdout.decode("utf-8", errors="replace"),
                       captured.truncated)

    registry.register(ToolSpec("list_directory", "List a workspace directory.",
                               {"path": {"type": str, "required": False}},
                               PermissionType.READ_ONLY), list_directory)
    registry.register(ToolSpec("read_file", "Read a text file.", {
        "path": {"type": str, "required": True},
        "encoding": {"type": str, "required": False}}, PermissionType.READ_ONLY), read_file)
    registry.register(ToolSpec("read_file_range", "Read a numbered text range.", {
        "path": {"type": str, "required": True},
        "start_line": {"type": int, "required": True},
        "end_line": {"type": int, "required": True},
        "encoding": {"type": str, "required": False}}, PermissionType.READ_ONLY), read_file_range)
    registry.register(ToolSpec("search_text", "Search literal text.", {
        "pattern": {"type": str, "required": True},
        "path": {"type": str, "required": False},
        "max_matches": {"type": int, "required": False}}, PermissionType.READ_ONLY), search_text)
    registry.register(ToolSpec("git_status", "Show fixed read-only Git status.", {},
                               PermissionType.READ_ONLY), lambda request: git_result("status", request))
    registry.register(ToolSpec("git_diff", "Show fixed read-only Git diff.",
                               {"path": {"type": str, "required": False}},
                               PermissionType.READ_ONLY), lambda request: git_result("diff", request))
    return registry
