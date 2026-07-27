"""Deterministic local-only providers for the prototype's testable loop."""

from abc import ABCMeta, abstractmethod
import hashlib
import json
import os
from pathlib import Path
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


def request_fingerprint(request: ModelRequest) -> str:
    """Return the deterministic replay fingerprint, not an integrity signature."""
    normalized = {
        "messages": [message.to_dict() for message in request.messages],
        "tool_names": [tool.get("name", "") for tool in request.tools],
        "turn": request.turn,
    }
    encoded = json.dumps(normalized, sort_keys=True, ensure_ascii=True, separators=(",", ":")).encode("ascii")
    return hashlib.sha256(encoded).hexdigest()


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

    def __init__(self, records) -> None:
        self._records = list(records)
        self._position = 0

    @classmethod
    def from_event_db(cls, database_path: str, run_id: Optional[str] = None):
        if not os.path.isfile(database_path):
            raise ProviderError("REPLAY_LOAD_FAILED", "replay database does not exist")
        uri_path = Path(database_path).resolve().as_uri() + "?mode=ro"
        connection = None
        try:
            connection = sqlite3.connect(uri_path, timeout=5.0, uri=True)
            tables = connection.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('meta', 'runs', 'events')").fetchall()
            if set([row[0] for row in tables]) != set(["meta", "runs", "events"]):
                raise ProviderError("REPLAY_LOAD_FAILED", "replay database schema is missing required tables")
            if run_id is None:
                row = connection.execute("SELECT run_id FROM runs ORDER BY created_at LIMIT 1").fetchone()
                if row is None:
                    raise ProviderError("REPLAY_LOAD_FAILED", "replay database has no runs")
                run_id = row[0]
            if connection.execute("SELECT 1 FROM runs WHERE run_id = ?", (run_id,)).fetchone() is None:
                raise ProviderError("REPLAY_LOAD_FAILED", "recorded run does not exist")
            rows = connection.execute("SELECT event_type, payload FROM events WHERE run_id = ? ORDER BY seq", (run_id,)).fetchall()
            records = []
            pending = None
            surplus_response = False
            for event_type, payload_text in rows:
                if event_type == "model.request":
                    if pending is not None:
                        records.append((pending[0], pending[1], None))
                    payload = json.loads(payload_text)
                    if "turn" not in payload or "request_fingerprint" not in payload:
                        raise ProviderError("REPLAY_LOAD_FAILED", "recorded request lacks replay fields")
                    pending = (payload["turn"], payload["request_fingerprint"])
                elif event_type == "model.response":
                    if pending is None:
                        surplus_response = True
                    else:
                        records.append((pending[0], pending[1], _response_from_dict(json.loads(payload_text))))
                        pending = None
            if pending is not None:
                records.append((pending[0], pending[1], None))
            if surplus_response:
                records.append((None, None, None))
            if not records:
                raise ProviderError("REPLAY_LOAD_FAILED", "recorded run has no model exchanges")
        except ProviderError:
            raise
        except (sqlite3.Error, ValueError, TypeError) as error:
            raise ProviderError("REPLAY_LOAD_FAILED", "cannot load replay events: {0}".format(error))
        finally:
            if connection is not None:
                connection.close()
        return cls(records)

    def generate(self, request: ModelRequest) -> ModelResponse:
        if self._position >= len(self._records):
            raise ReplayMismatch("recorded responses exhausted at turn {0}".format(request.turn))
        expected_turn, expected_fingerprint, response = self._records[self._position]
        self._position += 1
        if expected_turn is None:
            raise ReplayMismatch("recorded response ordering is invalid")
        if request.turn != expected_turn:
            raise ReplayMismatch("recorded turn does not match current request")
        if request_fingerprint(request) != expected_fingerprint:
            raise ReplayMismatch("recorded request fingerprint does not match current request")
        if response is None:
            raise ReplayMismatch("recorded response is missing")
        if response.finish_reason == FinishReason.STOP and self._position < len(self._records) and self._records[self._position][0] is None:
            raise ReplayMismatch("recorded responses contain a surplus entry")
        return response
