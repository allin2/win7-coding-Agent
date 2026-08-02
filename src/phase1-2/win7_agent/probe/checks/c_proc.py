"""Probe subprocess capability checks."""

import os
import shutil
import threading
import time
from typing import Any, Dict, List

from ..result import CheckResult, DEGRADED, FAIL, PASS, ProbeError
from ..subproc import process_exists, run_capture, terminate_all_active


def _details(result: Dict[str, Any]) -> Dict[str, Any]:
    """Copy the required common subprocess result fields."""
    return {key: result.get(key) for key in (
        "bytes_read_stdout", "bytes_read_stderr", "bytes_saved_stdout",
        "bytes_saved_stderr", "truncated_stdout", "truncated_stderr",
        "exit_code", "timed_out", "kill_ok", "taskkill_exit_code")}


def _failed(check_id: str, result: Dict[str, Any], message: str) -> CheckResult:
    """Map a subprocess assertion failure to its approved structured code."""
    details = _details(result)
    if result["spawn_error"] is not None:
        return CheckResult(check_id, FAIL, details,
                           error=ProbeError("SUBPROC_SPAWN_FAILED", result["spawn_error"]))
    code = "SUBPROC_TIMEOUT" if result["timed_out"] else "SUBPROC_BEHAVIOR_MISMATCH"
    return CheckResult(check_id, FAIL, details, error=ProbeError(code, message))


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
    if not result["timed_out"] or not result["kill_ok"] or details["process_exists_after"]:
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


def _write_tree_helpers(workdir: str) -> str:
    """Create the approved ASCII workdir helper files and return the cmd path."""
    child_path = os.path.join(workdir, "child.py")
    parent_path = os.path.join(workdir, "parent.py")
    cmd_path = os.path.join(workdir, "run_tree.cmd")
    child = "import time\ntime.sleep(300)\n"
    parent = (
        "import os\nimport subprocess\nimport sys\nimport time\n"
        "base = os.path.dirname(os.path.abspath(__file__))\n"
        "child = subprocess.Popen([sys.executable, os.path.join(base, 'child.py')])\n"
        "pid_temp = os.path.join(base, 'pids.tmp')\n"
        "pid_path = os.path.join(base, 'pids.txt')\n"
        "with open(pid_temp, 'w', encoding='ascii', newline='\\n') as writer:\n"
        "    writer.write(str(os.getpid()) + '\\n' + str(child.pid) + '\\n')\n"
        "os.replace(pid_temp, pid_path)\n"
        "ready = os.path.join(base, 'ready.flag')\n"
        "descriptor = os.open(ready, os.O_WRONLY | os.O_CREAT | os.O_EXCL)\n"
        "os.close(descriptor)\n"
        "time.sleep(300)\n")
    with open(child_path, "w", encoding="utf-8", newline="\n") as writer:
        writer.write(child)
    with open(parent_path, "w", encoding="utf-8", newline="\n") as writer:
        writer.write(parent)
    with open(cmd_path, "w", encoding="ascii", newline="") as writer:
        writer.write('@"%CAP_PROBE_PYTHON%" "%~dp0parent.py"\r\n')
    return cmd_path


def _read_pids(path: str) -> List[int]:
    """Read exactly two decimal PID lines from an atomically published file."""
    with open(path, "r", encoding="ascii", newline="") as reader:
        lines = [line.strip() for line in reader.readlines()]
    if len(lines) != 2 or not all(item.isdigit() for item in lines):
        raise ValueError("PID file did not contain two decimal PIDs")
    return [int(lines[0]), int(lines[1])]


def check_proc_kill(ctx: Any) -> CheckResult:
    """Verify readiness-driven taskkill tree termination via workdir helpers."""
    details: Dict[str, Any] = {"bytes_read_stdout": 0, "bytes_read_stderr": 0,
        "bytes_saved_stdout": 0, "bytes_saved_stderr": 0, "truncated_stdout": False,
        "truncated_stderr": False, "exit_code": None, "timed_out": False,
        "kill_ok": False, "taskkill_exit_code": None, "tree_kill": False, "parent_gone": False,
        "child_gone": False, "parent_pid": None, "child_pid": None, "cmd_pid": None,
        "ready_within_s": None, "missing_tools": []}
    tools = {"taskkill": shutil.which("taskkill.exe") or shutil.which("taskkill"),
             "cmd.exe": shutil.which("cmd.exe") or shutil.which("cmd"),
             "tasklist": shutil.which("tasklist.exe") or shutil.which("tasklist")}
    details["missing_tools"] = [name for name, value in tools.items() if value is None]
    if details["missing_tools"]:
        return CheckResult("proc.kill", DEGRADED, details,
                           error=ProbeError("CAPABILITY_LIMITED", "required Win7 tools unavailable"))
    result_holder: Dict[str, Any] = {}
    started = threading.Event()
    terminate = threading.Event()
    started_at = time.monotonic()
    try:
        cmd_path = _write_tree_helpers(ctx.workdir)
        child_env = os.environ.copy()
        child_env["CAP_PROBE_PYTHON"] = ctx.python_exe

        def on_started(pid: int) -> None:
            result_holder["cmd_pid"] = pid
            started.set()

        def run_tree() -> None:
            result_holder["result"] = run_capture(
                [tools["cmd.exe"], "/d", "/c", cmd_path], 30.0 * ctx.timeout_scale,
                ctx.limits["max_stdout_bytes"], ctx.limits["max_stderr_bytes"], child_env,
                terminate, on_started)

        worker = threading.Thread(target=run_tree, name="cap-probe-tree")
        worker.daemon = True
        worker.start()
        ready_path = os.path.join(ctx.workdir, "ready.flag")
        pid_path = os.path.join(ctx.workdir, "pids.txt")
        readiness_deadline = time.monotonic() + 10.0 * ctx.timeout_scale
        while time.monotonic() < readiness_deadline:
            if os.path.exists(ready_path):
                try:
                    parent_pid, child_pid = _read_pids(pid_path)
                    details["parent_pid"] = parent_pid
                    details["child_pid"] = child_pid
                    details["ready_within_s"] = round(time.monotonic() - started_at, 3)
                    break
                except (OSError, ValueError):
                    pass
            if not worker.is_alive() and "result" in result_holder:
                break
            time.sleep(0.1)
        details["cmd_pid"] = result_holder.get("cmd_pid")
        terminate.set()
        worker.join(10.0 * ctx.timeout_scale)
        if worker.is_alive():
            terminate_all_active(5.0 * ctx.timeout_scale)
            worker.join(5.0 * ctx.timeout_scale)
        result = result_holder.get("result")
        if isinstance(result, dict):
            details.update(_details(result))
        if details["parent_pid"] is None or details["child_pid"] is None:
            if isinstance(result, dict) and result["spawn_error"] is not None:
                return CheckResult("proc.kill", FAIL, details,
                    error=ProbeError("SUBPROC_SPAWN_FAILED", result["spawn_error"]))
            return CheckResult("proc.kill", FAIL, details,
                error=ProbeError("SUBPROC_BEHAVIOR_MISMATCH", "readiness or PID protocol failed"))
        verification_deadline = time.monotonic() + 10.0 * ctx.timeout_scale
        while time.monotonic() < verification_deadline:
            parent_exists = process_exists(details["parent_pid"], min(5.0 * ctx.timeout_scale,
                                                                        max(0.5, verification_deadline - time.monotonic())))
            child_exists = process_exists(details["child_pid"], min(5.0 * ctx.timeout_scale,
                                                                      max(0.5, verification_deadline - time.monotonic())))
            details["parent_gone"] = parent_exists is False
            details["child_gone"] = child_exists is False
            if details["parent_gone"] and details["child_gone"]:
                break
            time.sleep(0.5)
        details["tree_kill"] = (details["parent_gone"] and details["child_gone"] and
                                details["taskkill_exit_code"] == 0)
        if not details["tree_kill"]:
            return CheckResult("proc.kill", FAIL, details,
                error=ProbeError("PROCESS_TREE_TERMINATION_FAILED", "process tree was not fully terminated"))
    except (OSError, UnicodeError) as exc:
        return CheckResult("proc.kill", FAIL, details,
                           error=ProbeError("SUBPROC_BEHAVIOR_MISMATCH", str(exc), type(exc).__name__))
    return CheckResult("proc.kill", PASS, details)
