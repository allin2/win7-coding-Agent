"""Read-only Windows version capability check."""

import platform
import sys
from typing import Any, Dict, List, Optional, Tuple

from ..result import CheckResult, DEGRADED, PASS, ProbeError


def _unavailable(exc: Exception) -> Dict[str, Any]:
    """Represent one unavailable source without terminating the Probe."""
    return {"available": False, "reason": str(exc), "exception_type": type(exc).__name__}


def _getwindowsversion_source() -> Dict[str, Any]:
    """Read sys.getwindowsversion without assuming a Windows host."""
    try:
        value = sys.getwindowsversion()
        return {"available": True, "raw": {"major": value.major, "minor": value.minor,
            "build": value.build, "platform": value.platform, "service_pack": value.service_pack,
            "service_pack_major": value.service_pack_major,
            "service_pack_minor": value.service_pack_minor}}
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
        raw: Dict[str, Any] = {}
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path) as key:
            for name in names:
                try:
                    raw[name] = winreg.QueryValueEx(key, name)[0]
                except OSError:
                    raw[name] = None
        return {"available": True, "raw": raw}
    except (ImportError, OSError) as exc:
        return _unavailable(exc)


def _parse_version(value: str) -> Optional[Tuple[int, int, Optional[int]]]:
    """Parse a dotted version conservatively."""
    parts = value.split(".")
    if len(parts) < 2 or not all(item.isdigit() for item in parts[:2]):
        return None
    build = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else None
    return int(parts[0]), int(parts[1]), build


def _conclusions(sources: Dict[str, Dict[str, Any]]) -> List[Tuple[str, int, int, bool]]:
    """Extract source-name, version, and SP1 confirmation conclusions."""
    values: List[Tuple[str, int, int, bool]] = []
    first = sources["getwindowsversion"]
    if first.get("available"):
        raw = first["raw"]
        values.append(("getwindowsversion", raw["major"], raw["minor"],
                       raw["service_pack_major"] >= 1 or raw["build"] >= 7601))
    second = sources["win32_ver"]
    if second.get("available"):
        raw = second["raw"]
        parsed = _parse_version(raw["version"])
        if parsed is not None:
            major, minor, build = parsed
            values.append(("win32_ver", major, minor,
                           "service pack 1" in raw["csd"].lower() or
                           raw["csd"].strip().lower() == "sp1" or
                           (build is not None and build >= 7601)))
    third = sources["registry"]
    if third.get("available"):
        raw = third["raw"]
        parsed = _parse_version(str(raw.get("CurrentVersion") or ""))
        if parsed is not None:
            major, minor, ignored_build = parsed
            build = str(raw.get("CurrentBuildNumber") or "")
            values.append(("registry", major, minor,
                           "service pack 1" in str(raw.get("CSDVersion") or "").lower() or
                           (build.isdigit() and int(build) >= 7601)))
    return values


def _verdict(sources: Dict[str, Dict[str, Any]], process_bitness: int) -> Dict[str, Any]:
    """Build the one authoritative OS verdict consumed by the report host fields."""
    arch = "64bit" if process_bitness == 64 else "unknown"
    if process_bitness != 64:
        machine = platform.machine().lower()
        if "64" in machine or machine in ("amd64", "x86_64"):
            arch = "64bit"
    selected: Optional[Dict[str, Any]] = None
    source_name = "unknown"
    for name in ("getwindowsversion", "registry", "win32_ver"):
        source = sources[name]
        if source.get("available"):
            selected = source["raw"]
            source_name = name
            break
    build = "unknown"
    caption = "unknown"
    if selected is not None:
        if source_name == "getwindowsversion":
            build = str(selected.get("build", "unknown"))
            caption = "Windows-" + str(selected.get("major", "unknown")) + "." + str(selected.get("minor", "unknown")) + "-" + build
        elif source_name == "registry":
            build = str(selected.get("CurrentBuildNumber") or "unknown")
            caption = str(selected.get("ProductName") or "Windows") + "-" + str(selected.get("CurrentVersion") or "unknown") + "-" + build
        else:
            parsed = _parse_version(selected.get("version", ""))
            build = str(parsed[2]) if parsed is not None and parsed[2] is not None else "unknown"
            caption = "Windows-" + str(selected.get("release") or "unknown") + "-" + str(selected.get("version") or "unknown")
    return {"is_windows7": False, "sp1_confirmed": False, "os_build": build,
            "os_service_pack": "unconfirmed", "os_caption": caption, "os_arch": arch}


def check_os_version(ctx: Any) -> CheckResult:
    """Cross-check Windows version under ADR-0022's fixed decision order."""
    sources = {"getwindowsversion": _getwindowsversion_source(),
               "win32_ver": _win32_ver_source(), "registry": _registry_source()}
    values = _conclusions(sources)
    verdict = _verdict(sources, ctx.process_bitness)
    details = {"sources": sources, "machine": platform.machine(), "verdict": verdict}
    has_windows7 = any((major, minor) == (6, 1) for ignored_name, major, minor, ignored_sp1 in values)
    if not has_windows7:
        return CheckResult("os.version", DEGRADED, details,
                           error=ProbeError("NON_TARGET_OS", "no source reported Windows 7"))
    differing = any((major, minor) != (6, 1) for ignored_name, major, minor, ignored_sp1 in values)
    if differing:
        return CheckResult("os.version", DEGRADED, details,
                           error=ProbeError("OS_SOURCE_CONFLICT", "Windows version sources disagree"))
    verdict["is_windows7"] = True
    verdict["sp1_confirmed"] = any(confirmed for ignored_name, ignored_major,
                                    ignored_minor, confirmed in values)
    verdict["os_service_pack"] = "SP1" if verdict["sp1_confirmed"] else "unconfirmed"
    if verdict["sp1_confirmed"]:
        verdict["os_caption"] = verdict["os_caption"] + "-SP1"
    if not verdict["sp1_confirmed"]:
        return CheckResult("os.version", "fail", details,
                           error=ProbeError("SP_UNCONFIRMED", "unable to confirm Windows 7 SP1"))
    if verdict["os_arch"] == "unknown":
        return CheckResult("os.version", DEGRADED, details,
                           error=ProbeError("CAPABILITY_LIMITED", "OS architecture unknown"))
    return CheckResult("os.version", PASS, details)
