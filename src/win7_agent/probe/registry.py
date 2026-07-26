"""Frozen ordered registry for all Phase 1 checks."""

from __future__ import annotations

from typing import Any, Callable, List, Tuple

from .checks.c_fs import check_crlf_preserve, check_encodings, check_tempfile_basic, check_unicode_paths
from .checks.c_os import check_os_version
from .checks.c_proc import check_proc_capture, check_proc_exec, check_proc_kill, check_proc_timeout, check_proc_truncate
from .checks.c_python import check_process_bitness, check_python_runtime
from .checks.c_sqlite import check_sqlite_basic
from .checks.c_sys import check_disk_space, check_env_user_temp
from .checks.c_tls import check_tls_python_runtime
from .checks.c_tools import check_tool_git
from .result import CheckResult

CheckFunction = Callable[[Any], CheckResult]
CheckDefinition = Tuple[str, str, CheckFunction, float]

CHECKS: List[CheckDefinition] = [
    ("os.version", "Windows version and Service Pack", check_os_version, 5.0),
    ("python.runtime", "CPython runtime", check_python_runtime, 5.0),
    ("process.bitness", "Python process bitness", check_process_bitness, 5.0),
    ("sqlite.basic", "SQLite transaction capability", check_sqlite_basic, 10.0),
    ("tempfile.basic", "Temporary file and directory capability", check_tempfile_basic, 10.0),
    ("fs.unicode_paths", "Unicode and space path capability", check_unicode_paths, 10.0),
    ("fs.encodings", "Explicit encoding roundtrips", check_encodings, 10.0),
    ("fs.crlf_preserve", "CRLF preservation", check_crlf_preserve, 10.0),
    ("proc.exec", "Non-interactive subprocess execution", check_proc_exec, 15.0),
    ("proc.timeout", "Subprocess hard timeout", check_proc_timeout, 20.0),
    ("proc.capture", "Separated stdout/stderr capture", check_proc_capture, 15.0),
    ("proc.truncate", "Bounded subprocess capture", check_proc_truncate, 30.0),
    ("proc.kill", "Process tree termination", check_proc_kill, 30.0),
    ("tool.git", "Optional Git capability", check_tool_git, 15.0),
    ("tls.python_runtime", "Offline Python TLS runtime", check_tls_python_runtime, 10.0),
    ("disk.space", "Disk free space", check_disk_space, 5.0),
    ("env.user_temp", "User and writable temporary directory", check_env_user_temp, 10.0),
]


def check_ids() -> List[str]:
    """Return registered check IDs in report order, including report.sqlite."""
    return [item[0] for item in CHECKS] + ["report.sqlite"]
