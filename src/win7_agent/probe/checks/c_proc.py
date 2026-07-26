"""Probe subprocess capability checks."""

import shutil
import subprocess
import time
from typing import Any, Dict

from ..result import CheckResult, DEGRADED, FAIL, PASS, ProbeError
from ..subproc import process_exists, run_capture


def _details(result: Dict[str, Any]) -> Dict[str, Any]:
    return {key: result[key] for key in (
        "bytes_read_stdout", "bytes_read_stderr", "bytes_saved_stdout",
        "bytes_saved_stderr", "truncated_stdout", "truncated_stderr",
        "exit_code", "timed_out", "kill_ok")}


def _failed(check_id: str, result: Dict[str, Any], message: str) -> CheckResult:
    details = _details(result)
    if result["spawn_error"] is not None:
        return CheckResult(check_id, FAIL, details,
                           error=ProbeError("SUBPROC_SPAWN_FAILED", result["spawn_error"]))
    return CheckResult(check_id, FAIL, details,
                       error=ProbeError("SUBPROC_TIMEOUT" if result["timed_out"] else "FS_OP_FAILED",
                                        message))


def check_proc_exec(ctx: Any) -> CheckResult:
    """Verify a non-interactive Python child process can run."""
    result = run_capture([ctx.python_exe, "-c", "print('ok')"],
                         10.0 * ctx.timeout_scale, ctx.limits["max_stdout_bytes"],
                         ctx.limits["max_stderr_bytes"])
    details = _details(result)
    details["stdout_contains_ok"] = b"ok" in result["stdout"]
    if result["exit_code"] != 0 or not details["stdout_contains_ok"]:
        return _failed("proc.exec", result, "child did not print ok")
    return CheckResult("proc.exec", PASS, details)


def check_proc_timeout(ctx: Any) -> CheckResult:
    """Verify the hard timeout terminates a sleeping child."""
    result = run_capture([ctx.python_exe, "-c", "import time; time.sleep(30)"],
                         2.0 * ctx.timeout_scale, ctx.limits["max_stdout_bytes"],
                         ctx.limits["max_stderr_bytes"])
    details = _details(result)
    details["process_exists_after"] = process_exists(result["pid"], 5.0 * ctx.timeout_scale)
    if details["process_exists_after"] is None:
        return CheckResult("proc.timeout", DEGRADED, details,
                           error=ProbeError("CAPABILITY_LIMITED", "tasklist verification unavailable"))
    if not result["timed_out"] or not result["kill_ok"] or details["process_exists_after"] is True:
        return _failed("proc.timeout", result, "hard timeout did not terminate child")
    return CheckResult("proc.timeout", PASS, details)


def check_proc_capture(ctx: Any) -> CheckResult:
    """Verify stdout and stderr are captured independently."""
    code = "import sys; sys.stdout.write('stdout-marker'); sys.stderr.write('stderr-marker')"
    result = run_capture([ctx.python_exe, "-c", code], 10.0 * ctx.timeout_scale,
                         ctx.limits["max_stdout_bytes"], ctx.limits["max_stderr_bytes"])
    details = _details(result)
    details["streams_separate"] = (b"stdout-marker" in result["stdout"] and
                                   b"stderr-marker" not in result["stdout"] and
                                   b"stderr-marker" in result["stderr"] and
                                   b"stdout-marker" not in result["stderr"])
    if result["exit_code"] != 0 or not details["streams_separate"]:
        return _failed("proc.capture", result, "stdout/stderr capture mismatch")
    return CheckResult("proc.capture", PASS, details)


def check_proc_truncate(ctx: Any) -> CheckResult:
    """Verify bounded retention while continuously draining large output."""
    quantity = ctx.limits["max_stdout_bytes"] + 65536
    code = "import sys; sys.stdout.write('x' * " + str(quantity) + "); sys.stdout.flush()"
    result = run_capture([ctx.python_exe, "-c", code], 20.0 * ctx.timeout_scale,
                         ctx.limits["max_stdout_bytes"], ctx.limits["max_stderr_bytes"])
    details = _details(result)
    details["generated_stdout_bytes"] = quantity
    valid = (result["exit_code"] == 0 and result["bytes_saved_stdout"] <=
             ctx.limits["max_stdout_bytes"] and result["truncated_stdout"] and
             result["bytes_read_stdout"] >= quantity)
    if not valid:
        return _failed("proc.truncate", result, "large output capture contract failed")
    return CheckResult("proc.truncate", PASS, details)


def check_proc_kill(ctx: Any) -> CheckResult:
    """Verify taskkill can terminate cmd.exe and its Python child tree."""
    details = {"bytes_read_stdout": 0, "bytes_read_stderr": 0,
               "bytes_saved_stdout": 0, "bytes_saved_stderr": 0,
               "truncated_stdout": False, "truncated_stderr": False,
               "exit_code": None, "timed_out": False, "kill_ok": False,
               "tree_kill": False, "parent_gone": None, "child_gone": None}
    taskkill = shutil.which("taskkill.exe") or shutil.which("taskkill")
    command = shutil.which("cmd.exe") or shutil.which("cmd")
    if taskkill is None or command is None:
        return CheckResult("proc.kill", DEGRADED, details,
                           error=ProbeError("CAPABILITY_LIMITED", "taskkill or cmd unavailable"))
    child_code = "import time; time.sleep(30)"
    parent_code = ("import subprocess,sys,time; p=subprocess.Popen([sys.executable,'-c'," +
                   repr(child_code) + "]); print(p.pid); sys.stdout.flush(); time.sleep(30)")
    command_line = subprocess.list2cmdline([ctx.python_exe, "-c", parent_code])
    result = run_capture([command, "/d", "/s", "/c", command_line],
                         10.0 * ctx.timeout_scale, ctx.limits["max_stdout_bytes"],
                         ctx.limits["max_stderr_bytes"], 0.5 * ctx.timeout_scale)
    details.update(_details(result))
    details["parent_pid"] = result["pid"]
    child_line = result["stdout"].decode("ascii", "replace").strip().splitlines()
    details["child_pid"] = int(child_line[0]) if child_line and child_line[0].isdigit() else None
    time.sleep(0.2)
    details["parent_gone"] = process_exists(result["pid"], 5.0 * ctx.timeout_scale) is False
    if details["child_pid"] is not None:
        details["child_gone"] = process_exists(details["child_pid"], 5.0 * ctx.timeout_scale) is False
    details["tree_kill"] = details["parent_gone"] and details["child_gone"]
    if not result["kill_ok"] or not details["tree_kill"]:
        return CheckResult("proc.kill", DEGRADED, details,
                           error=ProbeError("CAPABILITY_LIMITED", "tree termination unverified"))
    return CheckResult("proc.kill", PASS, details)
