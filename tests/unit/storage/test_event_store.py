"""F26--F30 EventStore lifecycle and reconstruction tests."""

import os
import sqlite3
import tempfile
import unittest

from win7_agent.storage import EventStore, EventStoreError


class EventStoreTests(unittest.TestCase):
    def test_f26_failed_run_establishment_leaves_no_half_trace(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "events.sqlite")
            store = EventStore(path)
            store.create_run("same")
            with self.assertRaises(EventStoreError):
                store.create_run("same")
            self.assertEqual(1, len(store.events_for_run("same")))
            store.close()

    def test_f29_events_are_ordered_versioned_and_payloads_are_bounded(self):
        with tempfile.TemporaryDirectory() as directory:
            store = EventStore(os.path.join(directory, "events.sqlite"))
            store.create_run("run")
            store.append("run", "state.transition", {"from": "RECEIVED", "to": "DISCOVERING"})
            store.append("run", "model.request", {"request_fingerprint": "abc", "content": "x" * 70000})
            events = store.events_for_run("run")
        self.assertEqual([1, 2, 3], [event["seq"] for event in events])
        self.assertTrue(all(event["schema_version"] == 1 for event in events))
        self.assertTrue(events[-1]["payload"]["truncated"])

    def test_f30_run_trace_complete_is_authoritative_storage_state(self):
        with tempfile.TemporaryDirectory() as directory:
            store = EventStore(os.path.join(directory, "events.sqlite"))
            store.create_run("run")
            store.append("run", "run.final", {"trace_complete": True})
            store.update_run("run", "COMPLETED", False)
            record = store.run("run")
        self.assertEqual("COMPLETED", record["status"])
        self.assertFalse(record["trace_complete"])
