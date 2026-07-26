import unittest

from win7_agent.runtime import InvalidStateTransition, RunController, RunStatus
from win7_agent.runtime.state import RuntimeErrorInfo


class RunControllerTests(unittest.TestCase):
    def setUp(self):
        self.events = []
        self.controller = RunController("run-1", event_sink=lambda name, payload: self.events.append((name, payload)))

    def test_all_normal_transition_edges_are_accepted(self):
        self.controller.transition(RunStatus.DISCOVERING, "start")
        self.controller.transition(RunStatus.PLANNING, "discovered")
        self.controller.transition(RunStatus.EXECUTING, "tool request")
        self.controller.transition(RunStatus.EXECUTING, "more tools")
        self.controller.transition(RunStatus.PLANNING, "results returned")
        self.controller.transition(RunStatus.VERIFYING, "final text")
        self.controller.complete("verified")
        self.assertEqual(RunStatus.COMPLETED, self.controller.state.status)
        self.assertEqual(7, len(self.events))

    def test_invalid_and_terminal_transitions_are_rejected(self):
        with self.assertRaises(InvalidStateTransition) as error:
            self.controller.transition(RunStatus.COMPLETED, "skip")
        self.assertEqual("INVALID_STATE_TRANSITION", error.exception.code)
        self.assertEqual(RunStatus.RECEIVED, self.controller.state.status)

    def test_turn_budget_fails_before_extra_turn(self):
        controller = RunController("run-2", max_turns=1)
        controller.start_turn()
        with self.assertRaises(RuntimeErrorInfo) as error:
            controller.start_turn()
        self.assertEqual("RUN_LIMIT_EXCEEDED", error.exception.code)
        self.assertEqual(RunStatus.FAILED, controller.state.status)

    def test_tool_budget_fails_before_extra_tool_call(self):
        controller = RunController("run-3", max_tool_calls=1)
        controller.reserve_tool_call()
        with self.assertRaises(RuntimeErrorInfo) as error:
            controller.reserve_tool_call()
        self.assertEqual("RUN_LIMIT_EXCEEDED", error.exception.code)
        self.assertEqual(RunStatus.FAILED, controller.state.status)

    def test_cancellation_wins_at_next_control_point(self):
        self.controller.request_cancel()
        with self.assertRaises(RuntimeErrorInfo) as error:
            self.controller.start_turn()
        self.assertEqual("CANCELLED", error.exception.code)
        self.assertEqual(RunStatus.CANCELLED, self.controller.state.status)

    def test_state_exposes_snapshot_not_a_status_setter(self):
        self.assertFalse(hasattr(self.controller.state, "set_status"))
        snapshot = self.controller.state.snapshot()
        snapshot["status"] = "COMPLETED"
        self.assertEqual(RunStatus.RECEIVED, self.controller.state.status)
