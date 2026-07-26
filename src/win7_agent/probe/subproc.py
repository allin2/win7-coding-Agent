"""Probe-private subprocess execution with bounded capture."""

from __future__ import annotations

import os
import shutil
import subprocess
import threading
import time
from typing import Any, Dict, List, Optional


def _reader(stream: Any, maximum: int, saved: bytearray,
            state: Dict[str, Any], key: str) -> None:
    """Drain a byte stream even after its retained portion is full."""
    while True:
        chunk = stream.read(65536)
        if not chunk:
            break
        state["bytes_read_" + key] += len(chunk)
        remaining = maximum - len(saved)
        if remaining > 0:
            saved.extend(chunk[:remaining])
        if len(chunk) > remaining:
            state["truncated_" + key] = True
    stream.close()


def _terminate(process: subprocess.Popen, timeout: float) -> bool:
    """Terminate a process tree when taskkill is available, else the child."""
    killed = False
    taskkill = shutil.which("taskkill.exe") or shutil.which("taskkill")
    if taskkill is not None:
        try:
            completed = subprocess.run(
                [taskkill, "/PID", str(process.pid), "/T", "/F"],
                stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL, shell=False, timeout=max(1.0, timeout))
            killed = completed.returncode == 0
        except (OSError, subprocess.TimeoutExpired):
            killed = False
    if process.poll() is None:
        try:
            process.kill()
            killed = True
        except OSError:
            pass
    return killed


def run_capture(argv: List[str], timeout_s: float, max_stdout_bytes: int,
                max_stderr_bytes: int,
                terminate_after_s: Optional[float] = None) -> Dict[str, Any]:
    """Run argv with an enforced timeout and continuously drained pipes."""
    state = {
        "bytes_read_stdout": 0, "bytes_read_stderr": 0,
        "bytes_saved_stdout": 0, "bytes_saved_stderr": 0,
        "truncated_stdout": False, "truncated_stderr": False,
        "exit_code": None, "timed_out": False, "kill_ok": False,
        "stdout": b"", "stderr": b"", "spawn_error": None,
        "pid": None, "terminated_by_request": False,
    }
    try:
        process = subprocess.Popen(
            argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, shell=False)
    except OSError as exc:
        state["spawn_error"] = str(exc)
        return state
    state["pid"] = process.pid
    stdout_saved = bytearray()
    stderr_saved = bytearray()
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
    try:
        wait_timeout = terminate_after_s if terminate_after_s is not None else timeout_s
        process.wait(timeout=wait_timeout)
    except subprocess.TimeoutExpired:
        state["timed_out"] = terminate_after_s is None
        state["terminated_by_request"] = terminate_after_s is not None
        state["kill_ok"] = _terminate(process, timeout_s)
        try:
            process.wait(timeout=max(1.0, timeout_s))
        except subprocess.TimeoutExpired:
            state["kill_ok"] = False
    stdout_thread.join(timeout=max(1.0, timeout_s))
    stderr_thread.join(timeout=max(1.0, timeout_s))
    state["exit_code"] = process.returncode
    state["bytes_saved_stdout"] = len(stdout_saved)
    state["bytes_saved_stderr"] = len(stderr_saved)
    state["stdout"] = bytes(stdout_saved)
    state["stderr"] = bytes(stderr_saved)
    return state


def process_exists(pid: int, timeout_s: float) -> Optional[bool]:
    """Return process existence from Win7 tasklist, or None if unavailable."""
    tasklist = shutil.which("tasklist.exe") or shutil.which("tasklist")
    if tasklist is None:
        return None
    result = run_capture([tasklist, "/FI", "PID eq " + str(pid), "/FO", "CSV",
                          "/NH"], timeout_s, 65536, 65536)
    if result["spawn_error"] is not None or result["timed_out"]:
        return None
    text = result["stdout"].decode("ascii", "replace")
    return str(pid) in text
