import os
import tempfile
import unittest

from win7_agent.models import MockProvider, ReplayProvider
from win7_agent.runtime import PrototypeRuntime, RunStatus
from win7_agent.storage import EventStore
from win7_agent.workspace import WorkspaceContext


FIXTURE = os.path.realpath(os.path.join(os.path.dirname(__file__), "..", "..", "fixtures", "sample_project"))


def snapshot(root):
    result = []
    for directory, _, files in os.walk(root):
        for name in sorted(files):
            path = os.path.join(directory, name)
            stat = os.stat(path)
            result.append((os.path.relpath(path, root), stat.st_mtime, stat.st_size))
    return result


class PrototypeRuntimeTests(unittest.TestCase):
    def run_once(self, database, provider):
        store = EventStore(database)
        try:
            runtime = PrototypeRuntime(WorkspaceContext(FIXTURE), "Find target_function.", provider, store, run_id="run-1")
            result = runtime.run()
            run, events = store.load_run("run-1")
            return result, run, events
        finally:
            store.close()

    def test_mock_provider_completes_and_preserves_workspace(self):
        before = snapshot(FIXTURE)
        with tempfile.TemporaryDirectory() as directory:
            result, run, events = self.run_once(os.path.join(directory, "events.sqlite"), MockProvider())
        self.assertEqual(RunStatus.COMPLETED, result.status)
        self.assertEqual("COMPLETED", run["final_status"])
        self.assertIn("src/target.py:1", result.final_text)
        self.assertEqual(before, snapshot(FIXTURE))
        self.assertEqual([event["seq"] for event in events], list(range(1, len(events) + 1)))

    def test_replay_provider_replays_recorded_responses(self):
        with tempfile.TemporaryDirectory() as directory:
            original = os.path.join(directory, "recorded.sqlite")
            result, _, original_events = self.run_once(original, MockProvider())
            self.assertEqual(RunStatus.COMPLETED, result.status)
            replayed = os.path.join(directory, "replayed.sqlite")
            replay_result, _, replay_events = self.run_once(replayed, ReplayProvider.from_event_db(original))
        self.assertEqual(RunStatus.COMPLETED, replay_result.status)
        self.assertEqual([event["event_type"] for event in original_events], [event["event_type"] for event in replay_events])
