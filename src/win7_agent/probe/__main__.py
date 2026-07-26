"""CLI entry point for the offline capability probe."""

from __future__ import annotations

import argparse
import getpass
import os
import platform
import shutil
import struct
import sys
import tempfile
import threading
import time
import traceback
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Set, Tuple

from . import PROBE_VERSION
from .registry import CHECKS, check_ids
from .reportio import atomic_write_json, build_report, iso_now, skipped_sqlite, write_sqlite_evidence
from .result import CheckResult, ERROR, SKIPPED, ProbeError
from .textutil import ascii_safe, console_line


@dataclass(frozen=True)
class ProbeContext:
    """Read-only execution context supplied to every check."""

    timeout_scale: float
    workdir: str
    python_exe: str
    limits: Dict[str, int]
    report_path: str
    process_bitness: int


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m win7_agent.probe")
    parser.add_argument("--out", default="./probe_report.json")
    parser.add_argument("--db", default="./probe_report.sqlite3")
    parser.add_argument("--timeout-scale", type=float, default=1.0)
    parser.add_argument("--max-stdout-bytes", type=int, default=1048576)
    parser.add_argument("--max-stderr-bytes", type=int, default=1048576)
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--only", default=None)
    return parser


def _parse_args(argv: Optional[List[str]]) -> Tuple[Optional[argparse.Namespace], int]:
    parser = _parser()
    try:
        args = parser.parse_args(argv)
    except SystemExit:
        return None, 3
    if not 0.5 <= args.timeout_scale <= 10.0:
        parser.print_usage(sys.stderr)
        return None, 3
    if not 4096 <= args.max_stdout_bytes <= 67108864:
        parser.print_usage(sys.stderr)
        return None, 3
    if not 4096 <= args.max_stderr_bytes <= 67108864:
        parser.print_usage(sys.stderr)
        return None, 3
    return args, 0


def _selected(only: Optional[str]) -> Set[str]:
    if only is None:
        return set(check_ids())
    return set(item.strip() for item in only.split(",") if item.strip())


def _unexpected(check_id: str, exc: Exception) -> CheckResult:
    tail = "\n".join(traceback.format_exc().splitlines()[-5:])
    return CheckResult(check_id, ERROR, {}, error=ProbeError("UNEXPECTED", str(exc),
                       type(exc).__name__, tail))


def _run_check(check_id: str, function: Any, ctx: ProbeContext,
               timeout_s: float) -> CheckResult:
    """Execute one check in a containment thread with its declared timeout."""
    outcome: Dict[str, Any] = {}

    def invoke() -> None:
        try:
            outcome["result"] = function(ctx)
        except Exception as exc:
            outcome["exception"] = exc

    started = time.monotonic()
    thread = threading.Thread(target=invoke, name="cap-probe-" + check_id)
    thread.daemon = True
    thread.start()
    thread.join(timeout_s * ctx.timeout_scale)
    duration_ms = int((time.monotonic() - started) * 1000)
    if thread.is_alive():
        return CheckResult(check_id, ERROR, {}, duration_ms,
                           ProbeError("CHECK_TIMEOUT", "check exceeded " + str(timeout_s * ctx.timeout_scale) + "s",
                                      "TimeoutError"))
    if "exception" in outcome:
        return _unexpected(check_id, outcome["exception"]).with_duration(duration_ms)
    result = outcome.get("result")
    if not isinstance(result, CheckResult):
        return CheckResult(check_id, ERROR, {}, duration_ms,
                           ProbeError("UNEXPECTED", "check returned no CheckResult", "TypeError"))
    return result.with_duration(duration_ms)


def _host(results: List[CheckResult]) -> Dict[str, Any]:
    by_id = {result.check_id: result for result in results}
    os_details = by_id.get("os.version", CheckResult("", "", {})).details
    python_details = by_id.get("python.runtime", CheckResult("", "", {})).details
    temp_details = by_id.get("env.user_temp", CheckResult("", "", {})).details
    return {"os_caption": platform.platform(), "os_build": _os_build(os_details),
            "os_service_pack": _os_service_pack(os_details),
            "os_arch": os_details.get("os_arch", "unknown"),
            "python_version": python_details.get("python_version", "unknown"),
            "python_implementation": python_details.get("python_implementation", "unknown"),
            "python_executable": sys.executable,
            "process_bitness": struct.calcsize("P") * 8,
            "username": temp_details.get("username", getpass.getuser()),
            "temp_dir": temp_details.get("temp_dir", tempfile.gettempdir()), "cwd": os.getcwd()}


def _os_build(details: Dict[str, Any]) -> str:
    source = details.get("sources", {}).get("getwindowsversion", {})
    return str(source.get("raw", {}).get("build", "unknown"))


def _os_service_pack(details: Dict[str, Any]) -> str:
    source = details.get("sources", {}).get("getwindowsversion", {})
    return str(source.get("raw", {}).get("service_pack", "unconfirmed")) or "unconfirmed"


def _print_summary(results: List[CheckResult], exit_code: int, report_path: str) -> None:
    labels = {"pass": "PASS", "degraded": "WARN", "fail": "FAIL", "error": "ERR ", "skipped": "SKIP"}
    for result in results:
        error_code = result.error.code if result.error is not None else ""
        console_line("[" + labels[result.status] + "] " + result.check_id +
                     (" error=" + error_code if error_code else ""))
    console_line("RESULT exit_code=" + str(exit_code) + " report=" + ascii_safe(report_path))


def main(argv: Optional[List[str]] = None) -> int:
    """Run the requested checks, write one JSON report, and return its exit code."""
    args, parse_code = _parse_args(argv)
    if args is None:
        return parse_code
    if args.list:
        for check_id, description, ignored_function, ignored_timeout in CHECKS:
            console_line(check_id + " " + description)
        console_line("report.sqlite SQLite evidence file")
        return 0
    if not os.path.isdir(os.path.dirname(os.path.abspath(args.out)) or os.curdir):
        sys.stderr.write("ERROR report_write_failed: report parent directory does not exist\n")
        return 3
    selected = _selected(args.only)
    invalid = selected.difference(check_ids())
    if invalid:
        _parser().print_usage(sys.stderr)
        return 3
    report_path = os.path.abspath(args.out)
    db_path = None if args.db == "-" else os.path.abspath(args.db)
    started = time.monotonic()
    generated_at = iso_now()
    notes: List[str] = []
    cleanup_ok = True
    workdir = tempfile.mkdtemp(prefix="cap_probe_")
    ctx = ProbeContext(args.timeout_scale, workdir, sys.executable,
                       {"max_stdout_bytes": args.max_stdout_bytes,
                        "max_stderr_bytes": args.max_stderr_bytes}, report_path,
                       struct.calcsize("P") * 8)
    results: List[CheckResult] = []
    try:
        for check_id, ignored_description, function, timeout_s in CHECKS:
            if check_id not in selected:
                results.append(CheckResult(check_id, SKIPPED, {"reason": "excluded by --only"}))
            else:
                results.append(_run_check(check_id, function, ctx, timeout_s))
        if "report.sqlite" not in selected:
            results.append(CheckResult("report.sqlite", SKIPPED, {"reason": "excluded by --only"}))
        elif db_path is None:
            results.append(skipped_sqlite())
        else:
            results.append(write_sqlite_evidence(db_path, results, generated_at, PROBE_VERSION))
    finally:
        try:
            shutil.rmtree(workdir)
        except OSError as exc:
            cleanup_ok = False
            notes.append("CLEANUP_FAILED: " + str(exc))
    report = build_report(generated_at, int((time.monotonic() - started) * 1000),
                          _host(results), {"argv": list(argv) if argv is not None else sys.argv[1:],
                          "timeout_scale": args.timeout_scale,
                          "max_stdout_bytes": args.max_stdout_bytes,
                          "max_stderr_bytes": args.max_stderr_bytes,
                          "report_path": report_path, "db_path": db_path}, results,
                          cleanup_ok, notes, PROBE_VERSION)
    try:
        atomic_write_json(report_path, report)
    except OSError as exc:
        sys.stderr.write("ERROR report_write_failed: " + ascii_safe(exc) + "\n")
        return 3
    _print_summary(results, report["summary"]["exit_code"], report_path)
    return int(report["summary"]["exit_code"])


if __name__ == "__main__":
    sys.exit(main())
