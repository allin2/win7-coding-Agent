import os
import tempfile
import unittest

from win7_agent.storage import EventStore


class EventStoreTests(unittest.TestCase):
    def test_events_are_ordered_and_run_is_reconstructed(self):
        with tempfile.TemporaryDirectory() as directory:
            store = EventStore(os.path.join(directory, "events.sqlite"))
            try:
                store.create_run("run-1", "/workspace", "inspect")
                self.assertEqual(1, store.append_event("run-1", "run.created", {"task": "inspect"}))
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
            self.assertTrue(events[0]["payload"]["payload_truncated"])
            self.assertTrue(events[0]["payload"]["content"].endswith("[TRUNCATED_FOR_STORAGE]"))
