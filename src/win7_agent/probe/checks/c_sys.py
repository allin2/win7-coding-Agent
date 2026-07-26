"""Local disk and temporary-directory checks."""

import getpass
import os
import shutil
import tempfile
from typing import Any

from ..result import CheckResult, DEGRADED, FAIL, PASS, ProbeError


def check_disk_space(ctx: Any) -> CheckResult:
    """Report remaining space for the report and temporary directories."""
    details = {}
    try:
        report_usage = shutil.disk_usage(os.path.dirname(ctx.report_path) or os.curdir)
        temp_usage = shutil.disk_usage(tempfile.gettempdir())
        details = {"report_free_bytes": report_usage.free, "temp_free_bytes": temp_usage.free,
                   "free_bytes": min(report_usage.free, temp_usage.free)}
    except OSError as exc:
        return CheckResult("disk.space", FAIL, details,
                           error=ProbeError("FS_OP_FAILED", str(exc), type(exc).__name__))
    if details["free_bytes"] < 500 * 1024 * 1024:
        return CheckResult("disk.space", DEGRADED, details,
                           error=ProbeError("LOW_DISK_SPACE", "less than 500MB free"))
    return CheckResult("disk.space", PASS, details)


def check_env_user_temp(ctx: Any) -> CheckResult:
    """Verify the current temporary directory is writable and cleaned."""
    path = None
    details = {"username": getpass.getuser(), "temp_dir": tempfile.gettempdir(),
               "writable": False, "removed": False}
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", delete=False,
                                         dir=details["temp_dir"], prefix="cap_probe_") as handle:
            path = handle.name
            handle.write("probe")
        details["writable"] = True
        os.remove(path)
        path = None
        details["removed"] = True
    except (OSError, UnicodeError) as exc:
        return CheckResult("env.user_temp", FAIL, details,
                           error=ProbeError("FS_OP_FAILED", str(exc), type(exc).__name__))
    finally:
        if path is not None and os.path.exists(path):
            try:
                os.remove(path)
            except OSError as exc:
                details["cleanup_error"] = str(exc)
    return CheckResult("env.user_temp", PASS, details)
