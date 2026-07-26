"""Read-only Windows version capability check."""

import platform
import sys
from typing import Any, Dict, List, Optional, Tuple

from ..result import CheckResult, DEGRADED, PASS, ProbeError


def _unavailable(exc: Exception) -> Dict[str, Any]:
    return {"available": False, "reason": str(exc),
            "exception_type": type(exc).__name__}


def _getwindowsversion_source() -> Dict[str, Any]:
    """Read sys.getwindowsversion without assuming a Windows host."""
    try:
        value = sys.getwindowsversion()
        raw = {"major": value.major, "minor": value.minor, "build": value.build,
               "platform": value.platform, "service_pack": value.service_pack,
               "service_pack_major": value.service_pack_major,
               "service_pack_minor": value.service_pack_minor}
        return {"available": True, "raw": raw}
    except (AttributeError, OSError) as exc:
        return _unavailable(exc)


def _win32_ver_source() -> Dict[str, Any]:
    """Read platform.win32_ver and retain its raw fields."""
    try:
        release, version, csd, ptype = platform.win32_ver()
        return {"available": True, "raw": {"release": release, "version": version,
                                               "csd": csd, "ptype": ptype}}
    except OSError as exc:
        return _unavailable(exc)


def _registry_source() -> Dict[str, Any]:
    """Read only the approved CurrentVersion registry key and values."""
    try:
        import winreg
        key_path = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion"
        names = ("ProductName", "CurrentVersion", "CurrentBuildNumber", "CSDVersion")
        raw = {}
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path) as key:
            for name in names:
                try:
                    raw[name] = winreg.QueryValueEx(key, name)[0]
                except OSError:
                    raw[name] = None
        return {"available": True, "raw": raw}
    except (ImportError, OSError) as exc:
        return _unavailable(exc)


def _conclusions(sources: Dict[str, Dict[str, Any]]) -> List[Tuple[int, int, bool]]:
    """Extract available (major, minor, SP1-confirmed) version conclusions."""
    values = []
    first = sources["getwindowsversion"]
    if first.get("available"):
        raw = first["raw"]
        values.append((raw["major"], raw["minor"], raw["service_pack_major"] >= 1 or
                       raw["build"] >= 7601))
    second = sources["win32_ver"]
    if second.get("available"):
        raw = second["raw"]
        parts = raw["version"].split(".")
        if len(parts) >= 2 and all(item.isdigit() for item in parts[:2]):
            values.append((int(parts[0]), int(parts[1]),
                           "service pack 1" in raw["csd"].lower() or
                           (len(parts) >= 3 and parts[2].isdigit() and
                            int(parts[2]) >= 7601)))
    third = sources["registry"]
    if third.get("available"):
        raw = third["raw"]
        version = raw.get("CurrentVersion") or ""
        parts = version.split(".")
        if len(parts) >= 2 and all(item.isdigit() for item in parts[:2]):
            build = str(raw.get("CurrentBuildNumber") or "")
            values.append((int(parts[0]), int(parts[1]),
                           "service pack 1" in str(raw.get("CSDVersion") or "").lower() or
                           (build.isdigit() and int(build) >= 7601)))
    return values


def check_os_version(ctx: Any) -> CheckResult:
    """Cross-check Windows version with all three approved read-only sources."""
    sources = {"getwindowsversion": _getwindowsversion_source(),
               "win32_ver": _win32_ver_source(), "registry": _registry_source()}
    values = _conclusions(sources)
    bitness = 64 if ctx.process_bitness == 64 else None
    if bitness is None:
        machine = platform.machine().lower()
        if "64" in machine or machine in ("amd64", "x86_64"):
            bitness = 64
    details = {"sources": sources, "machine": platform.machine(),
               "os_arch": str(bitness) + "bit" if bitness is not None else "unknown"}
    if not values:
        return CheckResult("os.version", DEGRADED, details,
                           error=ProbeError("NON_TARGET_OS", "Windows version unavailable"))
    unique_versions = set((major, minor) for major, minor, confirmed in values)
    if len(unique_versions) > 1:
        return CheckResult("os.version", DEGRADED, details,
                           error=ProbeError("OS_SOURCE_CONFLICT",
                                            "Windows version sources disagree"))
    major, minor = values[0][0], values[0][1]
    if (major, minor) != (6, 1):
        return CheckResult("os.version", DEGRADED, details,
                           error=ProbeError("NON_TARGET_OS", "not Windows 7"))
    if not any(confirmed for ignored_major, ignored_minor, confirmed in values):
        return CheckResult("os.version", "fail", details,
                           error=ProbeError("SP_UNCONFIRMED", "unable to confirm Windows 7 SP1"))
    if bitness is None:
        return CheckResult("os.version", DEGRADED, details,
                           error=ProbeError("CAPABILITY_LIMITED", "OS architecture unknown"))
    return CheckResult("os.version", PASS, details)
