"""Deterministic local-only providers for the prototype's testable loop."""

from abc import ABCMeta, abstractmethod
import json
import sqlite3
from typing import Any, Dict, Iterable, List, Optional

from .contracts import FinishReason, ModelRequest, ModelResponse, ToolCall, Usage


class ProviderError(Exception):
    def __init__(self, code: str, message: str) -> None:
        Exception.__init__(self, message)
        self.code = code
        self.message = message


class ReplayMismatch(ProviderError):
    def __init__(self, message: str) -> None:
        ProviderError.__init__(self, "REPLAY_MISMATCH", message)


class ModelProvider(metaclass=ABCMeta):
    @abstractmethod
    def generate(self, request: ModelRequest) -> ModelResponse:
        """Produce one local, provider-neutral response."""


def _response_from_dict(data: Dict[str, Any]) -> ModelResponse:
    return ModelResponse(
        content=data.get("content", ""),
        tool_calls=[ToolCall(item["tool_call_id"], item["tool_name"], item.get("arguments", {})) for item in data.get("tool_calls", [])],
        finish_reason=FinishReason(data.get("finish_reason", "STOP")),
        usage=Usage(data.get("usage", {}).get("prompt_chars", 0), data.get("usage", {}).get("completion_chars", 0)),
    )


class MockProvider(ModelProvider):
    """A deterministic scripted provider; it never contacts a model service."""

    def __init__(self, responses: Optional[Iterable[ModelResponse]] = None) -> None:
        self._responses = list(responses) if responses is not None else self._default_script()
        self._position = 0

    @staticmethod
    def _default_script() -> List[ModelResponse]:
        return [
            ModelResponse(tool_calls=[ToolCall("call-1", "list_directory", {"path": ""})], finish_reason=FinishReason.TOOL_CALLS),
            ModelResponse(tool_calls=[ToolCall("call-2", "search_text", {"pattern": "target_function"})], finish_reason=FinishReason.TOOL_CALLS),
            ModelResponse(tool_calls=[ToolCall("call-3", "read_file_range", {"path": "src/target.py", "start_line": 1, "end_line": 4})], finish_reason=FinishReason.TOOL_CALLS),
            ModelResponse(content="target_function is defined in src/target.py:1-2.", finish_reason=FinishReason.STOP),
        ]

    def generate(self, request: ModelRequest) -> ModelResponse:
        if self._position >= len(self._responses):
            raise ReplayMismatch("mock script has no response for turn {0}".format(request.turn))
        response = self._responses[self._position]
        self._position += 1
        return response


class ReplayProvider(ModelProvider):
    """Replays recorded model responses in their original order from SQLite events."""

    def __init__(self, responses: Iterable[ModelResponse]) -> None:
        self._responses = list(responses)
        self._position = 0

    @classmethod
    def from_event_db(cls, database_path: str, run_id: Optional[str] = None):
        connection = sqlite3.connect(database_path, timeout=5.0)
        try:
            if run_id is None:
                row = connection.execute("SELECT run_id FROM runs ORDER BY created_at LIMIT 1").fetchone()
                if row is None:
                    raise ReplayMismatch("replay database has no runs")
                run_id = row[0]
            rows = connection.execute("SELECT payload FROM events WHERE run_id = ? AND event_type = ? ORDER BY seq", (run_id, "model.response")).fetchall()
        except sqlite3.Error as error:
            raise ReplayMismatch("cannot load replay events: {0}".format(error))
        finally:
            connection.close()
        return cls([_response_from_dict(json.loads(row[0])) for row in rows])

    def generate(self, request: ModelRequest) -> ModelResponse:
        if self._position >= len(self._responses):
            raise ReplayMismatch("recorded responses exhausted at turn {0}".format(request.turn))
        response = self._responses[self._position]
        self._position += 1
        return response
