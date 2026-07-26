"""Probe-private subprocess execution with bounded capture and cleanup."""

from __future__ import annotations

import csv
import io
import shutil
import subprocess
import threading
import time
from typing import Any, Callable, Dict, List, Mapping, Optional, Tuple

_FLOOR_S = 0.5
_ACTIVE_LOCK = threading.Lock()
_ACTIVE: Dict[int, subprocess.Popen] = {}


def _remaining(deadline: float) -> float:
    """Return the shared-deadline remainder with the approved cleanup floor."""
    return max(_FLOOR_S, deadline - time.monotonic())


def _register(process: subprocess.Popen) -> None:
    """Register one Probe-owned process immediately after successful spawn."""
    with _ACTIVE_LOCK:
        _ACTIVE[process.pid] = process


def _unregister(process: subprocess.Popen) -> None:
    """Remove an already reaped Probe-owned process from the active registry."""
    with _ACTIVE_LOCK:
        _ACTIVE.pop(process.pid, None)


def active_process_count() -> int:
    """Return the number of Probe-owned child processes awaiting recovery."""
    with _ACTIVE_LOCK:
        return len(_ACTIVE)


def _reader(stream: Any, maximum: int, saved: bytearray,
            state: Dict[str, Any], key: str) -> None:
    """Drain a byte stream even after its retained portion is full."""
    try:
        while True:
            chunk = stream.read(65536)
            if not chunk:
                break
            state["bytes_read_" + key] += len(chunk)
            remaining = maximum - len(saved)
            if remaining > 0:
                saved.extend(chunk[:remaining])
            if len(chunk) > max(remaining, 0):
                state["truncated_" + key] = True
    finally:
        stream.close()


def _terminate(process: subprocess.Popen, deadline: float) -> Tuple[bool, Optional[int]]:
    """Terminate a tree with taskkill, falling back to the direct child."""
    killed = False
    taskkill_exit_code: Optional[int] = None
    taskkill = shutil.which("taskkill.exe") or shutil.which("taskkill")
    if taskkill is not None:
        try:
            completed = subprocess.run(
                [taskkill, "/PID", str(process.pid), "/T", "/F"],
                stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL, shell=False, timeout=_remaining(deadline))
            taskkill_exit_code = completed.returncode
            killed = completed.returncode == 0
        except (OSError, subprocess.TimeoutExpired):
            killed = False
    if process.poll() is None:
        try:
            process.kill()
            killed = True
        except OSError:
            pass
    return killed, taskkill_exit_code


def terminate_all_active(budget_s: float) -> None:
    """Best-effort terminate every Probe-owned active process within one budget."""
    deadline = time.monotonic() + budget_s
    with _ACTIVE_LOCK:
        processes = list(_ACTIVE.values())
    for process in processes:
        if process.poll() is None:
            _terminate(process, deadline)


def run_capture(argv: List[str], timeout_s: float, max_stdout_bytes: int,
                max_stderr_bytes: int, env: Optional[Mapping[str, str]] = None,
                terminate_event: Optional[threading.Event] = None,
                on_started: Optional[Callable[[int], None]] = None) -> Dict[str, Any]:
    """Run argv under one monotonic deadline while continuously draining pipes."""
    deadline = time.monotonic() + timeout_s
    state: Dict[str, Any] = {
        "bytes_read_stdout": 0, "bytes_read_stderr": 0,
        "bytes_saved_stdout": 0, "bytes_saved_stderr": 0,
        "truncated_stdout": False, "truncated_stderr": False,
        "exit_code": None, "timed_out": False, "kill_ok": False,
        "stdout": b"", "stderr": b"", "spawn_error": None,
        "pid": None, "terminated_by_request": False,
        "reader_threads_joined": False, "taskkill_exit_code": None,
    }
    process: Optional[subprocess.Popen] = None
    stdout_thread: Optional[threading.Thread] = None
    stderr_thread: Optional[threading.Thread] = None
    stdout_saved = bytearray()
    stderr_saved = bytearray()
    try:
        try:
            process = subprocess.Popen(
                argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                stderr=subprocess.PIPE, shell=False, env=dict(env) if env is not None else None)
        except OSError as exc:
            state["spawn_error"] = str(exc)
            return state
        state["pid"] = process.pid
        _register(process)
        if on_started is not None:
            on_started(process.pid)
        stdout_thread = threading.Thread(
            target=_reader, args=(process.stdout, max_stdout_bytes, stdout_saved,
                                  state, "stdout"))
        stderr_thread = threading.Thread(
            target=_reader, args=(process.stderr, max_stderr_bytes, stderr_saved,
                                  state, "stderr"))
        stdout_thread.daemon = True
        stderr_thread.daemon = True
        stdout_thread.start()
        stderr_thread.start()
        while process.poll() is None:
            requested = terminate_event is not None and terminate_event.is_set()
            if requested or time.monotonic() >= deadline:
                state["timed_out"] = not requested
                state["terminated_by_request"] = requested
                state["kill_ok"], state["taskkill_exit_code"] = _terminate(process, deadline)
                break
            try:
                process.wait(timeout=min(0.1, _remaining(deadline)))
            except subprocess.TimeoutExpired:
                continue
        if process.poll() is None:
            try:
                process.wait(timeout=_remaining(deadline))
            except subprocess.TimeoutExpired:
                state["kill_ok"] = False
        if stdout_thread is not None:
            stdout_thread.join(timeout=_remaining(deadline))
        if stderr_thread is not None:
            stderr_thread.join(timeout=_remaining(deadline))
        state["reader_threads_joined"] = (stdout_thread is not None and stderr_thread is not None and
                                          not stdout_thread.is_alive() and not stderr_thread.is_alive())
        state["exit_code"] = process.returncode
        state["bytes_saved_stdout"] = len(stdout_saved)
        state["bytes_saved_stderr"] = len(stderr_saved)
        state["stdout"] = bytes(stdout_saved)
        state["stderr"] = bytes(stderr_saved)
        return state
    finally:
        if process is not None and process.poll() is None:
            _terminate(process, deadline)
            try:
                process.wait(timeout=_remaining(deadline))
            except subprocess.TimeoutExpired:
                pass
        if process is not None and stdout_thread is not None and stderr_thread is not None:
            if not stdout_thread.is_alive() and not stderr_thread.is_alive() and process.poll() is not None:
                _unregister(process)


def _csv_has_pid(text: str, pid: int) -> bool:
    """Return true only for a tasklist CSV row whose PID column exactly matches."""
    for row in csv.reader(io.StringIO(text)):
        if len(row) > 1 and row[1].strip() == str(pid):
            return True
    return False


def process_exists(pid: int, timeout_s: float) -> Optional[bool]:
    """Return process existence from exact Win7 tasklist CSV parsing, or None."""
    tasklist = shutil.which("tasklist.exe") or shutil.which("tasklist")
    if tasklist is None:
        return None
    result = run_capture([tasklist, "/FI", "PID eq " + str(pid), "/FO", "CSV", "/NH"],
                         timeout_s, 65536, 65536)
    if result["spawn_error"] is not None or result["timed_out"]:
        return None
    return _csv_has_pid(result["stdout"].decode("ascii", "replace"), pid)
