"""The formal Phase 2 runtime state machine and independent budgets."""

from __future__ import print_function

from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Set


class RunStatus(str, Enum):
    """The frozen statuses for one formal read-only agent run."""

    RECEIVED = "RECEIVED"
    DISCOVERING = "DISCOVERING"
    PLANNING = "PLANNING"
    EXECUTING = "EXECUTING"
    VERIFYING = "VERIFYING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class RunFailure(Exception):
    """A structured Runtime failure with a frozen error code."""

    def __init__(self, code, message):
        Exception.__init__(self, message)
        self.code = code
        self.message = message

    def to_dict(self):
        return {"code": self.code, "message": self.message}


class InvalidStateTransition(RunFailure):
    """Raised after the required rejected-transition audit record is emitted."""

    def __init__(self, current, requested):
        RunFailure.__init__(
            self,
            "INVALID_STATE_TRANSITION",
            "cannot transition from {0} to {1}".format(
                current.value, requested.value))


class RunCancelled(Exception):
    """Control flow raised when the Runtime applies a cancellation request."""

    pass


class RunState(object):
    """Runtime-owned mutable state with read-only public observations."""

    def __init__(self, run_id, max_turns, max_tool_calls):
        self._run_id = run_id
        self._status = RunStatus.RECEIVED
        self._max_turns = max_turns
        self._max_tool_calls = max_tool_calls
        self._turn_count = 0
        self._tool_call_count = 0
        self._cancel_requested = False
        self._errors = []  # type: List[Dict[str, str]]

    @property
    def run_id(self):
        return self._run_id

    @property
    def status(self):
        return self._status

    @property
    def turn_count(self):
        return self._turn_count

    @property
    def tool_call_count(self):
        return self._tool_call_count

    @property
    def max_turns(self):
        return self._max_turns

    @property
    def max_tool_calls(self):
        return self._max_tool_calls

    @property
    def cancel_requested(self):
        return self._cancel_requested

    @property
    def errors(self):
        return list(self._errors)

    def snapshot(self):
        return {
            "run_id": self.run_id,
            "status": self.status.value,
            "turn_count": self.turn_count,
            "tool_call_count": self.tool_call_count,
            "max_turns": self.max_turns,
            "max_tool_calls": self.max_tool_calls,
            "cancel_requested": self.cancel_requested,
            "errors": self.errors}


class RunController(object):
    """The only object authorized to transition a :class:`RunState`."""

    TERMINAL = set([RunStatus.COMPLETED, RunStatus.FAILED, RunStatus.CANCELLED])
    ALLOWED_TRANSITIONS = {
        RunStatus.RECEIVED: set([RunStatus.DISCOVERING]),
        RunStatus.DISCOVERING: set([RunStatus.PLANNING]),
        RunStatus.PLANNING: set([RunStatus.EXECUTING]),
        RunStatus.EXECUTING: set([RunStatus.VERIFYING]),
        RunStatus.VERIFYING: set([
            RunStatus.COMPLETED, RunStatus.FAILED, RunStatus.EXECUTING])
    }  # type: Dict[RunStatus, Set[RunStatus]]

    def __init__(self, run_id, max_turns=8, max_tool_calls=32, event_sink=None):
        self._validate_budget("max_turns", max_turns)
        self._validate_budget("max_tool_calls", max_tool_calls)
        self._state = RunState(run_id, max_turns, max_tool_calls)
        self._event_sink = event_sink  # type: Optional[Callable[[str, Dict[str, Any]], None]]

    @staticmethod
    def _validate_budget(name, value):
        if isinstance(value, bool) or not isinstance(value, int) or value < 1:
            raise ValueError("{0} must be a positive integer".format(name))

    @property
    def state(self):
        return self._state

    def request_cancel(self):
        """Mark a cancellation request; the next runtime checkpoint applies it."""
        self._state._cancel_requested = True

    def start_turn(self):
        """Consume one provider turn or fail the run at the frozen limit."""
        self._apply_cancellation()
        if self._state._turn_count >= self._state._max_turns:
            self.fail("RUN_LIMIT_EXCEEDED", "maximum turn count reached")
            raise RunFailure("RUN_LIMIT_EXCEEDED", "maximum turn count reached")
        self._state._turn_count += 1

    def record_tool_attempt(self):
        """Consume one tool budget unit before any possible dispatch outcome."""
        self._apply_cancellation()
        if self._state._tool_call_count >= self._state._max_tool_calls:
            self.fail("RUN_LIMIT_EXCEEDED", "maximum tool-call count reached")
            raise RunFailure("RUN_LIMIT_EXCEEDED", "maximum tool-call count reached")
        self._state._tool_call_count += 1

    def transition(self, target, reason):
        """Perform one legal state transition, otherwise emit a rejection event."""
        self._apply_cancellation()
        current = self._state._status
        if current in self.TERMINAL or target not in self.ALLOWED_TRANSITIONS.get(
                current, set()):
            self._state._errors.append({
                "code": "INVALID_STATE_TRANSITION",
                "message": "invalid state transition"})
            self._emit("state.transition_rejected", {
                "from": current.value,
                "to": target.value,
                "reason": reason,
                "turn": self._state._turn_count})
            raise InvalidStateTransition(current, target)
        self._emit("state.transition", {
            "from": current.value,
            "to": target.value,
            "reason": reason,
            "turn": self._state._turn_count})
        self._state._status = target

    def complete_after_verification(self, reason):
        """Only the later verification integration may request COMPLETED."""
        self.transition(RunStatus.COMPLETED, reason)

    def fail(self, code, message):
        """Move any nonterminal state to FAILED while retaining the cause."""
        if self._state._status not in self.TERMINAL:
            current = self._state._status
            self._state._errors.append({"code": code, "message": message})
            self._emit("state.transition", {
                "from": current.value,
                "to": RunStatus.FAILED.value,
                "reason": code,
                "turn": self._state._turn_count})
            self._state._status = RunStatus.FAILED

    def fail_after_event_store_error(self, message):
        """Preserve a storage failure when its required audit event cannot persist."""
        if self._state._status in self.TERMINAL:
            return None
        current = self._state._status
        self._state._errors.append({
            "code": "EVENT_STORE_FAILED", "message": message})
        self._state._status = RunStatus.FAILED
        return {
            "from": current.value,
            "to": RunStatus.FAILED.value,
            "reason": "EVENT_STORE_FAILED",
            "turn": self._state._turn_count}

    def record_event_store_audit_failure(self, message):
        """Keep the secondary audit failure observable in the in-memory result."""
        self._state._errors.append({
            "code": "EVENT_STORE_FAILED", "message": message})

    def _apply_cancellation(self):
        if (self._state._cancel_requested and
                self._state._status not in self.TERMINAL):
            current = self._state._status
            self._emit("state.transition", {
                "from": current.value,
                "to": RunStatus.CANCELLED.value,
                "reason": "cancel requested",
                "turn": self._state._turn_count})
            self._state._status = RunStatus.CANCELLED
            raise RunCancelled("cancellation requested")

    def _emit(self, event_type, payload):
        if self._event_sink is not None:
            self._event_sink(event_type, payload)
