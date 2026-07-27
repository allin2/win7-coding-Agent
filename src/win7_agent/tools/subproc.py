"""Private bounded subprocess support for only the two frozen Git observations."""

from __future__ import print_function

import os
import shutil
import subprocess
import threading


class GitCapture(object):
    def __init__(self, returncode, stdout, stderr, truncated, timed_out, termination_note):
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr
        self.truncated = truncated
        self.timed_out = timed_out
        self.termination_note = termination_note


def _fixed_argv(operation, relative_path=None):
    if operation == "status":
        return ["git", "status", "--porcelain"]
    if operation == "diff":
        argv = ["git", "diff", "--no-color"]
        if relative_path:
            argv.extend(["--", relative_path])
        return argv
    raise ValueError("unsupported fixed git operation")


def run_git(operation, cwd, timeout_s=10.0, max_output_bytes=1048576,
            relative_path=None):
    """Run one fixed Git observation with bounded drain and tree-kill fallback."""
    argv = _fixed_argv(operation, relative_path)
    process = subprocess.Popen(
        argv, cwd=cwd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, shell=False)
    output = [bytearray(), bytearray()]
    truncated = [False, False]

    def drain(stream, index):
        try:
            while True:
                chunk = stream.read(8192)
                if not chunk:
                    break
                remaining = max_output_bytes - len(output[index])
                if remaining > 0:
                    output[index].extend(chunk[:remaining])
                if len(chunk) > max(remaining, 0):
                    truncated[index] = True
        except (OSError, ValueError):
            truncated[index] = True

    threads = []
    for index, stream in enumerate((process.stdout, process.stderr)):
        thread = threading.Thread(target=drain, args=(stream, index))
        thread.daemon = True
        thread.start()
        threads.append(thread)
    timed_out = False
    termination_note = ""
    try:
        process.wait(timeout=timeout_s)
    except subprocess.TimeoutExpired:
        timed_out = True
        taskkill = shutil.which("taskkill")
        if taskkill:
            try:
                killer = subprocess.Popen(
                    [taskkill, "/PID", str(process.pid), "/T", "/F"],
                    stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE, shell=False)
                killer.wait(timeout=2.0)
                termination_note = "taskkill tree termination requested"
            except (OSError, subprocess.TimeoutExpired):
                termination_note = "taskkill failed; direct kill fallback used"
        else:
            termination_note = "taskkill unavailable; direct kill fallback used"
        if process.poll() is None:
            try:
                process.kill()
            except OSError:
                pass
        try:
            process.wait(timeout=2.0)
        except subprocess.TimeoutExpired:
            termination_note = (termination_note or "direct kill attempted") + "; process wait timed out"
    finally:
        for thread in threads:
            thread.join(timeout=2.0)
        for stream in (process.stdout, process.stderr):
            if stream is not None:
                try:
                    stream.close()
                except (OSError, ValueError):
                    pass
    code = process.returncode if process.returncode is not None else -1
    return GitCapture(code, bytes(output[0]), bytes(output[1]),
                      any(truncated), timed_out, termination_note)
