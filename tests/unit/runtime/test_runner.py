"""F27 runtime boundary tests for persistent EventStore append failures."""

from __future__ import print_function

import io
import os
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from unittest import mock

from win7_agent.cli.__main__ import main
from win7_agent.models import MockProvider
from win7_agent.runtime.runner import AgentRunner
from win7_agent.storage import EventStoreError


class PersistentAppendFailureStore(object):
    """A Run can establish, but every necessary event append then fails."""

    def __init__(self, unused_path=None):
        self.run_id = None
        self.append_calls = []
        self.update_calls = []

    def create_run(self, run_id):
        self.run_id = run_id

    def append(self, run_id, event_type, payload):
        self.append_calls.append((run_id, event_type, payload))
        raise EventStoreError("append unavailable")

    def update_run(self, run_id, status, trace_complete):
        self.update_calls.append((run_id, status, trace_complete))

    def events_for_run(self, unused_run_id):
        return []

    def close(self):
        pass


class AgentRunnerEventStoreTests(unittest.TestCase):
    """Exercise the Stage 2 EventStore failure contract without storage changes."""

    def _workspace(self):
        return os.path.abspath(os.path.join(
            os.path.dirname(__file__), "..", "..", "fixtures", "sample_project"))

    def test_f27_persistent_append_failure_stays_structured_in_memory(self):
        store = PersistentAppendFailureStore()
        result = AgentRunner(self._workspace(), MockProvider(), store).run(
            "Find target_function.")
        self.assertEqual("FAILED", result.status)
        self.assertFalse(result.trace_complete)
        self.assertEqual("EVENT_STORE_FAILED", result.error["code"])
        self.assertTrue(all(
            item["code"] == "EVENT_STORE_FAILED" for item in result.errors))
        self.assertGreaterEqual(len(result.errors), 2)
        self.assertEqual(
            ["state.transition", "state.transition", "run.final"],
            [item[1] for item in store.append_calls])
        self.assertEqual("FAILED", store.update_calls[-1][1])
        self.assertFalse(store.update_calls[-1][2])

    def test_f27_cli_returns_one_and_keeps_result_without_traceback(self):
        created = []

        def make_store(path):
            store = PersistentAppendFailureStore(path)
            created.append(store)
            return store

        with tempfile.TemporaryDirectory() as directory:
            output = io.StringIO()
            errors = io.StringIO()
            with mock.patch("win7_agent.cli.__main__.EventStore", side_effect=make_store):
                with redirect_stdout(output), redirect_stderr(errors):
                    code = main([
                        "analyze", "--workspace", self._workspace(),
                        "--task", "Find target_function.",
                        "--events", os.path.join(directory, "events.sqlite")])
        self.assertEqual(1, code)
        self.assertIn("RESULT status=FAILED trace_complete=false", output.getvalue())
        self.assertNotIn("Traceback", output.getvalue() + errors.getvalue())
        self.assertEqual(1, len(created))
