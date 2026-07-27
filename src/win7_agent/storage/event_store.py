"""Versioned SQLite event store with ordered, bounded JSON payloads."""

from datetime import datetime
import json
import sqlite3
from typing import Any, Dict, List, Optional, Tuple


SCHEMA_VERSION = "1"
TEXT_LIMIT = 65536
TRUNCATION_SUFFIX = "...[TRUNCATED_FOR_STORAGE]"


class EventStoreError(Exception):
    def __init__(self, message: str) -> None:
        Exception.__init__(self, message)
        self.code = "EVENT_STORE_FAILED"


def _timestamp() -> str:
    return datetime.now().astimezone().isoformat()


def _bounded(value: Any) -> Tuple[Any, bool]:
    if isinstance(value, str):
        if len(value) > TEXT_LIMIT:
            return value[:TEXT_LIMIT - len(TRUNCATION_SUFFIX)] + TRUNCATION_SUFFIX, True
        return value, False
    if isinstance(value, list):
        items = []
        changed = False
        for item in value:
            bounded, was_changed = _bounded(item)
            items.append(bounded)
            changed = changed or was_changed
        return items, changed
    if isinstance(value, dict):
        result = {}
        changed = False
        for key, item in value.items():
            bounded, was_changed = _bounded(item)
            result[key] = bounded
            changed = changed or was_changed
        return result, changed
    return value, False


class EventStore:
    def __init__(self, path: str) -> None:
        self._connection = None
        try:
            self._connection = sqlite3.connect(path, timeout=5.0)
            self._connection.execute("PRAGMA foreign_keys = ON")
            self._initialize()
        except (sqlite3.Error, EventStoreError) as error:
            if self._connection is not None:
                self._connection.close()
                self._connection = None
            raise EventStoreError(str(error))

    def close(self) -> None:
        if self._connection is not None:
            self._connection.close()
            self._connection = None

    def _initialize(self) -> None:
        connection = self._connection
        try:
            connection.execute("BEGIN")
            connection.execute("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            existing = connection.execute("SELECT value FROM meta WHERE key = 'schema_version'").fetchone()
            if existing is not None and existing[0] != SCHEMA_VERSION:
                raise EventStoreError("unsupported event-store schema version")
            connection.execute("INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', ?)", (SCHEMA_VERSION,))
            connection.execute("INSERT OR IGNORE INTO meta (key, value) VALUES ('prototype_version', '0.1.0')")
            connection.execute("INSERT OR IGNORE INTO meta (key, value) VALUES ('created_at', ?)", (_timestamp(),))
            connection.execute("CREATE TABLE IF NOT EXISTS runs (run_id TEXT PRIMARY KEY, created_at TEXT NOT NULL, workspace_path TEXT NOT NULL, task_text TEXT NOT NULL, final_status TEXT)")
            connection.execute("CREATE TABLE IF NOT EXISTS events (run_id TEXT NOT NULL, seq INTEGER NOT NULL, ts TEXT NOT NULL, event_type TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (run_id, seq))")
            connection.commit()
        except (sqlite3.Error, EventStoreError) as error:
            connection.rollback()
            if isinstance(error, EventStoreError):
                raise error
            raise EventStoreError(str(error))

    def create_run(self, run_id: str, workspace_path: str, task_text: str, created_payload: Optional[Dict[str, Any]] = None) -> None:
        """Atomically establish the Run row and its required ``run.created`` event."""
        payload = created_payload if created_payload is not None else {"workspace": workspace_path, "task": task_text[:16384]}
        serialized = self._serialize_payload(payload)
        try:
            self._connection.execute("BEGIN")
            self._connection.execute(
                "INSERT INTO runs (run_id, created_at, workspace_path, task_text, final_status) VALUES (?, ?, ?, ?, NULL)",
                (run_id, _timestamp(), workspace_path, task_text[:16384]),
            )
            self._connection.execute(
                "INSERT INTO events (run_id, seq, ts, event_type, payload) VALUES (?, ?, ?, ?, ?)",
                (run_id, 1, _timestamp(), "run.created", serialized),
            )
            self._connection.commit()
        except sqlite3.Error as error:
            self._rollback()
            raise EventStoreError(str(error))

    def append_event(self, run_id: str, event_type: str, payload: Dict[str, Any]) -> int:
        serialized = self._serialize_payload(payload)
        try:
            self._connection.execute("BEGIN")
            row = self._connection.execute("SELECT COALESCE(MAX(seq), 0) FROM events WHERE run_id = ?", (run_id,)).fetchone()
            sequence = int(row[0]) + 1
            self._connection.execute("INSERT INTO events (run_id, seq, ts, event_type, payload) VALUES (?, ?, ?, ?, ?)", (run_id, sequence, _timestamp(), event_type, serialized))
            self._connection.commit()
            return sequence
        except sqlite3.Error as error:
            self._rollback()
            raise EventStoreError(str(error))

    def finalize_run(self, run_id: str, status: str) -> None:
        self._write("UPDATE runs SET final_status = ? WHERE run_id = ?", (status, run_id))

    def load_run(self, run_id: str):
        try:
            run = self._connection.execute("SELECT run_id, created_at, workspace_path, task_text, final_status FROM runs WHERE run_id = ?", (run_id,)).fetchone()
            if run is None:
                raise EventStoreError("run does not exist")
            rows = self._connection.execute("SELECT seq, ts, event_type, payload FROM events WHERE run_id = ? ORDER BY seq", (run_id,)).fetchall()
        except sqlite3.Error as error:
            raise EventStoreError(str(error))
        return (
            {"run_id": run[0], "created_at": run[1], "workspace_path": run[2], "task_text": run[3], "final_status": run[4]},
            [{"seq": row[0], "ts": row[1], "event_type": row[2], "payload": json.loads(row[3])} for row in rows],
        )

    @staticmethod
    def summarize_trace(events: List[Dict[str, Any]]) -> Dict[str, Any]:
        return {"event_count": len(events), "event_types": [event["event_type"] for event in events]}

    def _write(self, statement: str, values: Tuple[Any, ...]) -> None:
        try:
            self._connection.execute("BEGIN")
            self._connection.execute(statement, values)
            self._connection.commit()
        except sqlite3.Error as error:
            self._rollback()
            raise EventStoreError(str(error))

    @staticmethod
    def _serialize_payload(payload: Dict[str, Any]) -> str:
        bounded, changed = _bounded(payload)
        if changed:
            bounded["payload_truncated"] = True
        return json.dumps(bounded, ensure_ascii=False, sort_keys=True)

    def _rollback(self) -> None:
        try:
            self._connection.rollback()
        except sqlite3.Error:
            pass
