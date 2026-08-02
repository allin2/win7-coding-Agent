"""Optional external-tool capability checks."""

import shutil
from typing import Any

from ..result import CheckResult, DEGRADED, PASS, ProbeError
from ..subproc import run_capture


def check_tool_git(ctx: Any) -> CheckResult:
    """Probe optional Git availability without depending on it."""
    executable = shutil.which("git.exe") or shutil.which("git")
    details = {"path": executable}
    if executable is None:
        return CheckResult("tool.git", DEGRADED, details,
                           error=ProbeError("TOOL_NOT_FOUND", "git executable not found"))
    result = run_capture([executable, "--version"], 10.0 * ctx.timeout_scale,
                         ctx.limits["max_stdout_bytes"], ctx.limits["max_stderr_bytes"])
    details.update({key: result[key] for key in ("bytes_read_stdout", "bytes_read_stderr",
        "bytes_saved_stdout", "bytes_saved_stderr", "truncated_stdout", "truncated_stderr",
        "exit_code", "timed_out", "kill_ok")})
    details["version"] = result["stdout"].decode("ascii", "replace").strip()
    if result["spawn_error"] is not None or result["exit_code"] != 0 or result["timed_out"]:
        return CheckResult("tool.git", DEGRADED, details,
                           error=ProbeError("CAPABILITY_LIMITED", "git --version failed"))
    return CheckResult("tool.git", PASS, details)
