import os
import tempfile
import unittest
from unittest import mock

from win7_agent.storage import EventStore


class EventStoreTests(unittest.TestCase):
    def test_events_are_ordered_and_run_is_reconstructed(self):
        with tempfile.TemporaryDirectory() as directory:
            store = EventStore(os.path.join(directory, "events.sqlite"))
            try:
                store.create_run("run-1", "/workspace", "inspect")
                self.assertEqual(2, store.append_event("run-1", "state.transition", {"to": "DISCOVERING"}))
                store.finalize_run("run-1", "COMPLETED")
                run, events = store.load_run("run-1")
            finally:
                store.close()
            self.assertEqual("COMPLETED", run["final_status"])
            self.assertEqual([1, 2], [event["seq"] for event in events])
            self.assertEqual(["run.created", "state.transition"], EventStore.summarize_trace(events)["event_types"])

    def test_payload_is_bounded_and_marked(self):
        with tempfile.TemporaryDirectory() as directory:
            store = EventStore(os.path.join(directory, "events.sqlite"))
            try:
                store.create_run("run-2", "/workspace", "inspect")
                store.append_event("run-2", "tool.result", {"content": "x" * 70000})
                _, events = store.load_run("run-2")
            finally:
                store.close()
            self.assertTrue(events[1]["payload"]["payload_truncated"])
            self.assertTrue(events[1]["payload"]["content"].endswith("[TRUNCATED_FOR_STORAGE]"))

    def test_duplicate_run_creation_does_not_leave_a_partial_second_trace(self):
        with tempfile.TemporaryDirectory() as directory:
            store = EventStore(os.path.join(directory, "events.sqlite"))
            try:
                store.create_run("run-atomic", "/workspace", "inspect")
                with self.assertRaises(Exception):
                    store.create_run("run-atomic", "/workspace", "inspect again")
                run, events = store.load_run("run-atomic")
            finally:
                store.close()
        self.assertEqual("inspect", run["task_text"])
        self.assertEqual(["run.created"], [event["event_type"] for event in events])

    def test_initialization_failure_closes_created_connection(self):
        connection = mock.Mock()
        connection.execute.side_effect = __import__("sqlite3").Error("broken")
        with mock.patch("win7_agent.storage.event_store.sqlite3.connect", return_value=connection):
            with self.assertRaises(Exception):
                EventStore("unused.sqlite")
        connection.close.assert_called_once()
