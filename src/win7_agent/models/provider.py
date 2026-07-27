"""Deterministic offline Mock and SQLite Replay providers."""

import hashlib
import json
import os
import sqlite3
from pathlib import Path

from .contracts import FinishReason, ModelResponse, ToolCall, Usage


class ProviderError(Exception):
    pass


def request_fingerprint(request):
    payload = {"messages": [item.to_dict() for item in request.messages],
               "tools": [item.get("name", "") for item in request.tools], "turn": request.turn}
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


class MockProvider(object):
    def __init__(self):
        self._index = 0

    def respond(self, request):
        calls = [
            ToolCall("mock-1", "list_directory", {}),
            ToolCall("mock-2", "search_text", {"pattern": "target_function"}),
            ToolCall("mock-3", "read_file_range", {"path": "code.py", "start_line": 1, "end_line": 3})]
        if self._index < len(calls):
            call = calls[self._index]
            self._index += 1
            return ModelResponse("", [call], FinishReason.TOOL_CALLS, Usage())
        return ModelResponse("Found target_function in code.py:1", [], FinishReason.STOP, Usage())


class ReplayProvider(object):
    def __init__(self, path):
        resolved = os.path.abspath(path)
        if not os.path.exists(resolved):
            raise ProviderError("replay database does not exist")
        try:
            self._connection = sqlite3.connect(
                Path(resolved).resolve().as_uri() + "?mode=ro", uri=True)
            rows = self._connection.execute(
                "SELECT event_type,payload FROM events ORDER BY run_id,seq").fetchall()
        except sqlite3.Error as error:
            raise ProviderError(str(error))
        self._pairs = []
        pending = None
        for kind, payload in rows:
            data = json.loads(payload)
            if kind == "model.request":
                if pending is not None:
                    raise ProviderError("replay recording has missing response")
                pending = data
            elif kind == "model.response":
                if pending is None:
                    raise ProviderError("replay recording has surplus response")
                self._pairs.append((pending, data))
                pending = None
        if pending is not None or not self._pairs:
            raise ProviderError("replay database has no complete runs")
        self._index = 0

    def respond(self, request):
        if self._index >= len(self._pairs):
            raise ProviderError("REPLAY_MISMATCH provider exhausted")
        expected, response = self._pairs[self._index]
        self._index += 1
        if expected.get("request_fingerprint") != request_fingerprint(request):
            raise ProviderError("REPLAY_MISMATCH request fingerprint")
        calls = [ToolCall(item["tool_call_id"], item["name"], item["arguments"])
                 for item in response.get("tool_calls", [])]
        return ModelResponse(response.get("content", ""), calls,
                             FinishReason(response.get("finish_reason", "STOP")), Usage())
