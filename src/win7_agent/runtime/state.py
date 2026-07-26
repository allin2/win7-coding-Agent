"""The runtime-owned state machine for a single prototype run."""

from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Set


class RunStatus(str, Enum):
    RECEIVED = "RECEIVED"
    DISCOVERING = "DISCOVERING"
    PLANNING = "PLANNING"
    EXECUTING = "EXECUTING"
    VERIFYING = "VERIFYING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class RuntimeErrorInfo(Exception):
    """An exception that keeps the task-book error code available to callers."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message

    def to_dict(self) -> Dict[str, str]:
        return {"code": self.code, "message": self.message, "exception_type": self.__class__.__name__}


class InvalidStateTransition(RuntimeErrorInfo):
    def __init__(self, current: RunStatus, requested: RunStatus) -> None:
        RuntimeErrorInfo.__init__(
            self,
            "INVALID_STATE_TRANSITION",
            "cannot transition from {0} to {1}".format(current.value, requested.value),
        )


class RunState:
    """Mutable state whose mutation methods are intentionally controller-private."""

    def __init__(self, run_id: str, max_turns: int, max_tool_calls: int) -> None:
        self._run_id = run_id
        self._status = RunStatus.RECEIVED
        self._turn_count = 0
        self._tool_call_count = 0
        self._max_turns = max_turns
        self._max_tool_calls = max_tool_calls
        self._cancel_requested = False
        self._errors = []  # type: List[Dict[str, str]]

    @property
    def run_id(self) -> str:
        return self._run_id

    @property
    def status(self) -> RunStatus:
        return self._status

    def snapshot(self) -> Dict[str, Any]:
        return {
            "run_id": self._run_id,
            "status": self._status.value,
            "turn_count": self._turn_count,
            "tool_call_count": self._tool_call_count,
            "max_turns": self._max_turns,
            "max_tool_calls": self._max_tool_calls,
            "cancel_requested": self._cancel_requested,
            "errors": list(self._errors),
        }


class RunController:
    """The sole authority allowed to mutate a :class:`RunState`."""

    _TERMINAL = set([RunStatus.COMPLETED, RunStatus.FAILED, RunStatus.CANCELLED])
    _ALLOWED = {
        RunStatus.RECEIVED: set([RunStatus.DISCOVERING]),
        RunStatus.DISCOVERING: set([RunStatus.PLANNING]),
        RunStatus.PLANNING: set([RunStatus.EXECUTING, RunStatus.VERIFYING]),
        RunStatus.EXECUTING: set([RunStatus.EXECUTING, RunStatus.PLANNING, RunStatus.VERIFYING]),
        RunStatus.VERIFYING: set([RunStatus.COMPLETED, RunStatus.FAILED, RunStatus.EXECUTING]),
    }  # type: Dict[RunStatus, Set[RunStatus]]

    def __init__(
        self,
        run_id: str,
        max_turns: int = 8,
        max_tool_calls: int = 16,
        event_sink: Optional[Callable[[str, Dict[str, Any]], None]] = None,
    ) -> None:
        if max_turns < 1 or max_tool_calls < 1:
            raise ValueError("run budgets must be positive")
        self._state = RunState(run_id, max_turns, max_tool_calls)
        self._event_sink = event_sink

    @property
    def state(self) -> RunState:
        return self._state

    def request_cancel(self) -> None:
        self._state._cancel_requested = True

    def start_turn(self) -> None:
        self._check_cancel()
        if self._state._turn_count >= self._state._max_turns:
            self.fail("RUN_LIMIT_EXCEEDED", "maximum turn count reached")
            raise RuntimeErrorInfo("RUN_LIMIT_EXCEEDED", "maximum turn count reached")
        self._state._turn_count += 1

    def reserve_tool_call(self) -> None:
        self._check_cancel()
        if self._state._tool_call_count >= self._state._max_tool_calls:
            self.fail("RUN_LIMIT_EXCEEDED", "maximum tool-call count reached")
            raise RuntimeErrorInfo("RUN_LIMIT_EXCEEDED", "maximum tool-call count reached")
        self._state._tool_call_count += 1

    def transition(self, target: RunStatus, reason: str) -> None:
        self._check_cancel()
        current = self._state._status
        if current in self._TERMINAL or target not in self._ALLOWED.get(current, set()):
            self._record_error("INVALID_STATE_TRANSITION", "invalid state transition")
            raise InvalidStateTransition(current, target)
        self._state._status = target
        self._emit("state.transition", {"from": current.value, "to": target.value, "reason": reason, "turn": self._state._turn_count})

    def fail(self, code: str, message: str) -> None:
        if self._state._status not in self._TERMINAL:
            current = self._state._status
            self._record_error(code, message)
            self._state._status = RunStatus.FAILED
            self._emit("state.transition", {"from": current.value, "to": RunStatus.FAILED.value, "reason": code, "turn": self._state._turn_count})

    def complete(self, reason: str) -> None:
        self.transition(RunStatus.COMPLETED, reason)

    def _check_cancel(self) -> None:
        if self._state._cancel_requested and self._state._status not in self._TERMINAL:
            current = self._state._status
            self._state._status = RunStatus.CANCELLED
            self._record_error("CANCELLED", "cancellation requested")
            self._emit("state.transition", {"from": current.value, "to": RunStatus.CANCELLED.value, "reason": "cancel requested", "turn": self._state._turn_count})
            raise RuntimeErrorInfo("CANCELLED", "cancellation requested")

    def _record_error(self, code: str, message: str) -> None:
        self._state._errors.append({"code": code, "message": message})

    def _emit(self, event_type: str, payload: Dict[str, Any]) -> None:
        if self._event_sink is not None:
            self._event_sink(event_type, payload)
