"""SQLite capability check."""

import os
import sqlite3
from typing import Any

from ..result import CheckResult, FAIL, PASS, ProbeError


def check_sqlite_basic(ctx: Any) -> CheckResult:
    """Verify SQLite creation, rollback, commit, readback, and cleanup."""
    path = os.path.join(ctx.workdir, "sqlite_basic.sqlite3")
    details = {"rollback_verified": False, "commit_verified": False,
               "removed": False}
    connection = None
    try:
        connection = sqlite3.connect(path)
        connection.execute("CREATE TABLE probe_value (value TEXT NOT NULL)")
        connection.execute("INSERT INTO probe_value VALUES (?)", ("rolled-back",))
        connection.rollback()
        details["rollback_verified"] = connection.execute(
            "SELECT COUNT(*) FROM probe_value").fetchone()[0] == 0
        connection.execute("INSERT INTO probe_value VALUES (?)", ("committed",))
        connection.commit()
        details["commit_verified"] = connection.execute(
            "SELECT COUNT(*) FROM probe_value").fetchone()[0] == 1
        if not details["rollback_verified"] or not details["commit_verified"]:
            raise sqlite3.DatabaseError("transaction assertions failed")
    except (sqlite3.Error, OSError) as exc:
        return CheckResult("sqlite.basic", FAIL, details,
                           error=ProbeError("SQLITE_OP_FAILED", str(exc), type(exc).__name__))
    finally:
        if connection is not None:
            connection.close()
        try:
            if os.path.exists(path):
                os.remove(path)
            details["removed"] = not os.path.exists(path)
        except OSError as exc:
            details["cleanup_error"] = str(exc)
    if not details["removed"]:
        return CheckResult("sqlite.basic", FAIL, details,
                           error=ProbeError("FS_OP_FAILED", "SQLite test file was not removed"))
    return CheckResult("sqlite.basic", PASS, details)
