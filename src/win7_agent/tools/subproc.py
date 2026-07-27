"""Private bounded subprocess helper for fixed read-only Git invocations only."""

import subprocess
import threading
import time
from typing import List, Tuple


def run_git(argv: List[str], cwd: str, timeout_s: float, max_output_bytes: int) -> Tuple[int, bytes, bytes, bool, bool]:
    """Return exit code, bounded stdout/stderr, truncation and timeout flags.

    Reader threads continue draining after their saved buffer reaches the cap,
    preventing a Git process from blocking on a full pipe.
    """
    process = subprocess.Popen(
        argv,
        cwd=cwd,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        shell=False,
    )
    outputs = [bytearray(), bytearray()]
    truncated = [False, False]

    def drain(stream, index):
        while True:
            chunk = stream.read(8192)
            if not chunk:
                break
            remaining = max_output_bytes - len(outputs[index])
            if remaining > 0:
                outputs[index].extend(chunk[:remaining])
            if len(chunk) > max(remaining, 0):
                truncated[index] = True

    threads = [
        threading.Thread(target=drain, args=(process.stdout, 0)),
        threading.Thread(target=drain, args=(process.stderr, 1)),
    ]
    for thread in threads:
        thread.daemon = True
        thread.start()
    timed_out = False
    try:
        process.wait(timeout=timeout_s)
    except subprocess.TimeoutExpired:
        timed_out = True
        process.kill()
        try:
            process.wait(timeout=2.0)
        except subprocess.TimeoutExpired:
            pass
    finally:
        for thread in threads:
            thread.join(timeout=2.0)
        for stream in (process.stdout, process.stderr):
            if stream is not None:
                try:
                    stream.close()
                except OSError:
                    pass
    return process.returncode if process.returncode is not None else -1, bytes(outputs[0]), bytes(outputs[1]), any(truncated), timed_out
