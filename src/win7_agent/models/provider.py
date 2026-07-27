"""Deterministic offline Mock and SQLite Replay providers."""

import hashlib
import json
import os
import sqlite3
from pathlib import Path

from .contracts import FinishReason, ModelResponse, ToolCall, Usage


SCHEMA_VERSION = 1


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
        if not path:
            raise ProviderError("replay database path is required")
        resolved = os.path.abspath(path)
        if not os.path.exists(resolved):
            raise ProviderError("replay database does not exist")
        self._connection = None
        try:
            self._connection = sqlite3.connect(
                Path(resolved).resolve().as_uri() + "?mode=ro", uri=True)
            schema_rows = self._connection.execute(
                "SELECT schema_version FROM schema_info").fetchall()
            if len(schema_rows) != 1 or schema_rows[0][0] != SCHEMA_VERSION:
                raise ProviderError("replay database has unsupported schema version")
            run_row = self._connection.execute(
                "SELECT run_id FROM runs ORDER BY created_at LIMIT 1").fetchone()
            if run_row is None:
                raise ProviderError("replay database has no runs")
            rows = self._connection.execute(
                "SELECT event_type,payload FROM events WHERE run_id=? ORDER BY seq",
                (run_row[0],)).fetchall()
        except ProviderError:
            self.close()
            raise
        except (sqlite3.Error, OSError) as error:
            self.close()
            raise ProviderError(str(error))
        self._pairs = []
        pending = None
        self._surplus_responses = 0
        for kind, payload in rows:
            try:
                data = json.loads(payload)
            except (TypeError, ValueError) as error:
                self.close()
                raise ProviderError("invalid replay payload: {0}".format(error))
            if kind == "model.request":
                if pending is not None:
                    self._pairs.append((pending, None))
                pending = data
            elif kind == "model.response":
                if pending is None:
                    self._surplus_responses += 1
                    continue
                try:
                    response = self._response_from_payload(data)
                except ProviderError:
                    self.close()
                    raise
                self._pairs.append((pending, response))
                pending = None
        if pending is not None:
            self._pairs.append((pending, None))
        self._index = 0

    def respond(self, request):
        if self._index >= len(self._pairs):
            raise ProviderError("REPLAY_MISMATCH provider exhausted")
        expected, response = self._pairs[self._index]
        self._index += 1
        if expected.get("request_fingerprint") != request_fingerprint(request):
            raise ProviderError("REPLAY_MISMATCH request fingerprint")
        if response is None:
            raise ProviderError("REPLAY_MISMATCH response missing")
        if (response.finish_reason == FinishReason.STOP and
                (self._index != len(self._pairs) or self._surplus_responses)):
            raise ProviderError("REPLAY_MISMATCH replay has surplus response")
        return response

    @staticmethod
    def _response_from_payload(response):
        try:
            calls = [ToolCall(item["tool_call_id"], item["name"], item["arguments"])
                     for item in response["tool_calls"]]
            usage_data = response.get("usage", {})
            usage = Usage(
                prompt_chars=usage_data.get("prompt_chars", 0),
                completion_chars=usage_data.get("completion_chars", 0))
            return ModelResponse(
                response["content"], calls,
                FinishReason(response["finish_reason"]), usage)
        except (KeyError, TypeError, ValueError) as error:
            raise ProviderError("invalid replay response: {0}".format(error))

    def close(self):
        if self._connection is not None:
            try:
                self._connection.close()
            except sqlite3.Error:
                pass
            self._connection = None
