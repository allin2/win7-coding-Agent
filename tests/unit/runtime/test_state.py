"""F01--F04 tests for the formal Phase 2 runtime state machine."""

import unittest

from win7_agent.runtime import InvalidStateTransition, RunCancelled, RunController, RunFailure, RunStatus


class StateTests(unittest.TestCase):
    """Exercise only the M2 state and budget contracts."""

    def _controller(self, **kwargs):
        events = []
        controller = RunController("run-1", event_sink=lambda kind, data: events.append((kind, data)),
                                   **kwargs)
        return controller, events

    def _to_verifying(self, controller):
        controller.transition(RunStatus.DISCOVERING, "discover")
        controller.transition(RunStatus.PLANNING, "plan")
        controller.transition(RunStatus.EXECUTING, "respond")
        controller.transition(RunStatus.VERIFYING, "provider stop")

    def test_f01_all_frozen_legal_transitions(self):
        controller, _ = self._controller()
        self._to_verifying(controller)
        controller.complete_after_verification("verified")
        self.assertEqual(RunStatus.COMPLETED, controller.state.status)

        retry, _ = self._controller()
        self._to_verifying(retry)
        retry.transition(RunStatus.EXECUTING, "evidence incomplete")
        retry.transition(RunStatus.VERIFYING, "provider stop")
        retry.transition(RunStatus.FAILED, "no remaining budget")
        self.assertEqual(RunStatus.FAILED, retry.state.status)

    def test_f01_any_nonterminal_can_fail_or_cancel(self):
        targets = [
            RunStatus.RECEIVED, RunStatus.DISCOVERING, RunStatus.PLANNING,
            RunStatus.EXECUTING, RunStatus.VERIFYING]
        for target in targets:
            failed, _ = self._controller()
            while failed.state.status != target:
                failed.transition(
                    RunController.ALLOWED_TRANSITIONS[failed.state.status].copy().pop(),
                    "advance")
            failed.fail("UNEXPECTED", "forced failure")
            self.assertEqual(RunStatus.FAILED, failed.state.status)

            cancelled, _ = self._controller()
            while cancelled.state.status != target:
                cancelled.transition(
                    RunController.ALLOWED_TRANSITIONS[cancelled.state.status].copy().pop(),
                    "advance")
            cancelled.request_cancel()
            with self.assertRaises(RunCancelled):
                cancelled.start_turn()
            self.assertEqual(RunStatus.CANCELLED, cancelled.state.status)

    def test_f02_invalid_transition_is_audited_without_state_change(self):
        controller, events = self._controller()
        with self.assertRaises(InvalidStateTransition) as captured:
            controller.transition(RunStatus.EXECUTING, "skip discovery")
        self.assertEqual("INVALID_STATE_TRANSITION", captured.exception.code)
        self.assertEqual(RunStatus.RECEIVED, controller.state.status)
        self.assertEqual("state.transition_rejected", events[-1][0])

    def test_f02_terminal_transition_is_rejected_and_audited(self):
        controller, events = self._controller()
        self._to_verifying(controller)
        controller.complete_after_verification("verified")
        with self.assertRaises(InvalidStateTransition):
            controller.transition(RunStatus.FAILED, "late failure")
        self.assertEqual(RunStatus.COMPLETED, controller.state.status)
        self.assertEqual("state.transition_rejected", events[-1][0])

    def test_f03_turn_limit_fails_the_run(self):
        controller, _ = self._controller(max_turns=1)
        controller.start_turn()
        with self.assertRaises(RunFailure) as captured:
            controller.start_turn()
        self.assertEqual("RUN_LIMIT_EXCEEDED", captured.exception.code)
        self.assertEqual(RunStatus.FAILED, controller.state.status)

    def test_f04_every_tool_attempt_outcome_consumes_budget(self):
        controller, _ = self._controller(max_tool_calls=4)
        for unused_outcome in ("success", "execution_failure", "deny", "tool_not_found"):
            controller.record_tool_attempt()
        self.assertEqual(4, controller.state.tool_call_count)
        with self.assertRaises(RunFailure) as captured:
            controller.record_tool_attempt()
        self.assertEqual("RUN_LIMIT_EXCEEDED", captured.exception.code)

    def test_cancellation_is_applied_at_a_runtime_checkpoint(self):
        controller, _ = self._controller()
        controller.request_cancel()
        with self.assertRaises(RunCancelled) as captured:
            controller.start_turn()
        self.assertEqual("cancellation requested", str(captured.exception))
        self.assertEqual(RunStatus.CANCELLED, controller.state.status)

    def test_budgets_reject_bool_and_nonpositive_values(self):
        for field, value in (("max_turns", True), ("max_turns", 0),
                             ("max_tool_calls", False), ("max_tool_calls", -1)):
            with self.assertRaises(ValueError):
                RunController("run", **{field: value})
