"""Report assembly, JSON atomic output, and SQLite evidence writing."""

from __future__ import annotations

import json
import os
import sqlite3
import stat
import tempfile
from datetime import datetime
from typing import Any, Dict, List, Optional

from .result import CheckResult, DEGRADED, ProbeError


def iso_now() -> str:
    """Return local ISO-8601 time with an explicit offset."""
    return datetime.now().astimezone().isoformat()


def _remove_evidence_files(path: str, details: Dict[str, Any]) -> None:
    """Remove one evidence database and its SQLite sidecars best-effort."""
    failures = []
    for candidate in (path, path + "-journal", path + "-wal"):
        if os.path.exists(candidate):
            try:
                os.chmod(candidate, stat.S_IWRITE)
                os.remove(candidate)
            except OSError as exc:
                failures.append(str(exc))
    if failures:
        details["cleanup_errors"] = failures


def write_sqlite_evidence(path: str, results: List[CheckResult], generated_at: str,
                          probe_version: str, timeout_scale: float = 1.0) -> CheckResult:
    """Write the first 17 result snapshots to a SQLite evidence database."""
    details: Dict[str, Any] = {"db_path": path, "snapshot_count": len(results),
                               "preexisting_db_replaced": False}
    connection = None
    success = False
    created = False
    try:
        if os.path.exists(path):
            details["preexisting_db_replaced"] = True
            _remove_evidence_files(path, details)
            if os.path.exists(path):
                raise OSError("unable to replace existing evidence database")
        connection = sqlite3.connect(path, timeout=5.0 * timeout_scale)
        created = True
        connection.execute("BEGIN")
        connection.execute("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        connection.execute("CREATE TABLE checks (id TEXT PRIMARY KEY, status TEXT NOT NULL, "
                           "duration_ms INTEGER NOT NULL, details TEXT NOT NULL, error TEXT)")
        meta = (("schema_version", "1"), ("report_version", "1"),
                ("probe_version", probe_version), ("generated_at", generated_at))
        connection.executemany("INSERT INTO meta VALUES (?, ?)", meta)
        for result in results:
            connection.execute("INSERT INTO checks VALUES (?, ?, ?, ?, ?)",
                               (result.check_id, result.status, result.duration_ms,
                                json.dumps(result.details, ensure_ascii=False, sort_keys=True),
                                json.dumps(result.error.as_dict(), ensure_ascii=False, sort_keys=True)
                                if result.error is not None else None))
        connection.commit()
        count = connection.execute("SELECT COUNT(*) FROM checks").fetchone()[0]
        details["rows_written"] = count
        if count != len(results):
            raise sqlite3.DatabaseError("evidence row count mismatch")
        success = True
    except (sqlite3.Error, OSError) as exc:
        if connection is not None:
            connection.close()
            connection = None
        if created:
            _remove_evidence_files(path, details)
        return CheckResult("report.sqlite", DEGRADED, details,
                           error=ProbeError("SQLITE_OP_FAILED", str(exc), type(exc).__name__))
    except Exception:
        if connection is not None:
            connection.close()
            connection = None
        if created:
            _remove_evidence_files(path, details)
        raise
    finally:
        if connection is not None:
            connection.close()
    return CheckResult("report.sqlite", "pass", details)


def skipped_sqlite() -> CheckResult:
    """Return the defined result when --db - opts out of evidence output."""
    return CheckResult("report.sqlite", "skipped", {"reason": "--db -"})


def summarize(results: List[CheckResult]) -> Dict[str, Any]:
    """Summarize result states and calculate the frozen process exit code."""
    counts = {"pass": 0, "degraded": 0, "fail": 0, "error": 0, "skipped": 0}
    for result in results:
        counts[result.status] += 1
    if counts["fail"] or counts["error"]:
        exit_code = 2
    elif counts["degraded"]:
        exit_code = 1
    else:
        exit_code = 0
    return {"total": len(results), "pass": counts["pass"], "degraded": counts["degraded"],
            "fail": counts["fail"], "error": counts["error"], "skipped": counts["skipped"],
            "exit_code": exit_code, "agent_runnable": not (counts["fail"] or counts["error"]),
            "blocking_check_ids": [result.check_id for result in results
                                   if result.status in ("fail", "error")]}


def build_report(generated_at: str, duration_ms: int, host: Dict[str, Any],
                 invocation: Dict[str, Any], results: List[CheckResult],
                 cleanup_ok: bool, notes: List[str], probe_version: str) -> Dict[str, Any]:
    """Build the stable v1 JSON report object."""
    return {"report_version": 1, "probe_version": probe_version,
            "generated_at": generated_at, "duration_ms": duration_ms, "host": host,
            "invocation": invocation, "checks": [result.as_dict() for result in results],
            "summary": summarize(results), "probe": {"cleanup_ok": cleanup_ok, "notes": notes}}


def atomic_write_json(path: str, report: Dict[str, Any]) -> None:
    """Write one UTF-8 JSON report by temporary file followed by os.replace."""
    parent = os.path.dirname(path) or os.curdir
    if not os.path.isdir(parent):
        raise OSError("report parent directory does not exist")
    temporary_path: Optional[str] = None
    handle = None
    try:
        handle = tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="\n",
                                             delete=False, dir=parent, prefix=".cap_probe_")
        temporary_path = handle.name
        json.dump(report, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
        handle.close()
        os.replace(temporary_path, path)
        temporary_path = None
    finally:
        if handle is not None and not handle.closed:
            handle.close()
        if temporary_path is not None and os.path.exists(temporary_path):
            os.remove(temporary_path)
