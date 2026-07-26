"""Python runtime and process architecture checks."""

import platform
import struct
import sys
from typing import Any

from ..result import CheckResult, DEGRADED, PASS, ProbeError


def check_python_runtime(ctx: Any) -> CheckResult:
    """Check the required CPython 3.8.10 runtime."""
    version = ".".join(str(item) for item in sys.version_info[:3])
    implementation = platform.python_implementation()
    details = {"python_version": version, "python_implementation": implementation,
               "python_executable": sys.executable,
               "compiled_architecture": platform.architecture()[0]}
    if version == "3.8.10" and implementation == "CPython":
        return CheckResult("python.runtime", PASS, details)
    return CheckResult("python.runtime", DEGRADED, details,
                       error=ProbeError("CAPABILITY_LIMITED",
                                        "required CPython 3.8.10 not detected"))


def check_process_bitness(ctx: Any) -> CheckResult:
    """Report the bitness of this Python process."""
    return CheckResult("process.bitness", PASS,
                       {"process_bitness": struct.calcsize("P") * 8})
