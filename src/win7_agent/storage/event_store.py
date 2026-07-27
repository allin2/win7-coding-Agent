"""Versioned append-only EventStore with explicit Run establishment."""

from __future__ import print_function

import json
import os
import sqlite3
import tempfile
import time


SCHEMA_VERSION = 1
MAX_PAYLOAD_BYTES = 65536
EVENT_TYPES = set([
    "run.created", "state.transition", "state.transition_rejected",
    "model.request", "model.response", "tool.requested", "policy.decision",
    "tool.denied", "tool.result", "verification.result", "run.final"])


class EventStoreError(Exception):
    """Failure to initialize or append the authoritative audit trace."""

    pass


class EventStore(object):
    """One SQLite database; caller controls every permitted output path."""

    def __init__(self, path):
        if not path:
            raise EventStoreError("event database path is required")
        self.path = os.path.abspath(path)
        self._connection = None
        try:
            self._connection = sqlite3.connect(self.path)
            self._connection.execute("PRAGMA foreign_keys=ON")
            self._create_schema()
        except (sqlite3.Error, OSError) as error:
            self.close()
            raise EventStoreError(str(error))

    def _create_schema(self):
        self._connection.executescript(
            "CREATE TABLE IF NOT EXISTS schema_info (schema_version INTEGER NOT NULL);"
            "CREATE TABLE IF NOT EXISTS runs (run_id TEXT PRIMARY KEY, status TEXT NOT NULL, "
            "trace_complete INTEGER NOT NULL, created_at REAL NOT NULL);"
            "CREATE TABLE IF NOT EXISTS events (run_id TEXT NOT NULL, seq INTEGER NOT NULL, "
            "event_type TEXT NOT NULL, payload TEXT NOT NULL, schema_version INTEGER NOT NULL, "
            "PRIMARY KEY (run_id, seq), FOREIGN KEY(run_id) REFERENCES runs(run_id));")
        count = self._connection.execute("SELECT COUNT(*) FROM schema_info").fetchone()[0]
        if count == 0:
            self._connection.execute("INSERT INTO schema_info(schema_version) VALUES (?)", (SCHEMA_VERSION,))
        self._connection.commit()

    def close(self):
        if self._connection is not None:
            try:
                self._connection.close()
            except sqlite3.Error:
                pass
            self._connection = None

    def __enter__(self):
        return self

    def __exit__(self, unused_type, unused_value, unused_traceback):
        self.close()

    @staticmethod
    def _payload(payload):
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
        if len(encoded.encode("utf-8")) <= MAX_PAYLOAD_BYTES:
            return encoded
        return json.dumps({"truncated": True, "payload_bytes": len(encoded.encode("utf-8"))},
                          sort_keys=True, separators=(",", ":"), ensure_ascii=True)

    def create_run(self, run_id, status="RECEIVED"):
        """Atomically establish the Run row and its first run.created event."""
        try:
            with self._connection:
                self._connection.execute(
                    "INSERT INTO runs(run_id,status,trace_complete,created_at) VALUES (?,?,?,?)",
                    (run_id, status, 1, time.time()))
                self._connection.execute(
                    "INSERT INTO events(run_id,seq,event_type,payload,schema_version) VALUES (?,?,?,?,?)",
                    (run_id, 1, "run.created", self._payload({"run_id": run_id}), SCHEMA_VERSION))
        except sqlite3.Error as error:
            raise EventStoreError(str(error))

    def append(self, run_id, event_type, payload):
        if event_type not in EVENT_TYPES:
            raise EventStoreError("unsupported event type")
        try:
            with self._connection:
                row = self._connection.execute(
                    "SELECT COALESCE(MAX(seq), 0) FROM events WHERE run_id=?", (run_id,)).fetchone()
                sequence = row[0] + 1
                self._connection.execute(
                    "INSERT INTO events(run_id,seq,event_type,payload,schema_version) VALUES (?,?,?,?,?)",
                    (run_id, sequence, event_type, self._payload(payload), SCHEMA_VERSION))
        except sqlite3.Error as error:
            raise EventStoreError(str(error))

    def update_run(self, run_id, status, trace_complete):
        try:
            with self._connection:
                cursor = self._connection.execute(
                    "UPDATE runs SET status=?,trace_complete=? WHERE run_id=?",
                    (status, 1 if trace_complete else 0, run_id))
                if cursor.rowcount != 1:
                    raise EventStoreError("run does not exist")
        except sqlite3.Error as error:
            raise EventStoreError(str(error))

    def events_for_run(self, run_id):
        try:
            rows = self._connection.execute(
                "SELECT seq,event_type,payload,schema_version FROM events WHERE run_id=? ORDER BY seq",
                (run_id,)).fetchall()
        except sqlite3.Error as error:
            raise EventStoreError(str(error))
        return [{"seq": row[0], "type": row[1], "payload": json.loads(row[2]),
                 "schema_version": row[3]} for row in rows]

    def run(self, run_id):
        row = self._connection.execute(
            "SELECT status,trace_complete FROM runs WHERE run_id=?", (run_id,)).fetchone()
        if row is None:
            return None
        return {"status": row[0], "trace_complete": bool(row[1])}
