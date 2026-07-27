"""Formal contract tests for M2 and F45 migration equivalence."""

from dataclasses import FrozenInstanceError
import unittest

from win7_agent.models import FinishReason, Message, ModelRequest, ModelResponse
from win7_agent.models import ToolCall, ToolRequest, ToolResult, Usage


class ContractTests(unittest.TestCase):
    """Assert the formal, provider-neutral data contracts."""

    def test_finish_reasons_are_the_frozen_values(self):
        self.assertEqual(
            ["STOP", "TOOL_CALLS", "ERROR"],
            [item.value for item in FinishReason])

    def test_request_and_response_are_vendor_neutral_serializable_data(self):
        request = ModelRequest([Message("user", "find target")], [{"name": "search_text"}], 2)
        response = ModelResponse("", [ToolCall("call-1", "search_text", {"pattern": "x"})],
                                 FinishReason.TOOL_CALLS, Usage(12, 0))
        self.assertEqual("find target", request.to_dict()["messages"][0]["content"])
        self.assertEqual("search_text", response.to_dict()["tool_calls"][0]["name"])
        self.assertEqual({"prompt_chars": 12, "completion_chars": 0},
                         response.to_dict()["usage"])

    def test_tool_request_preserves_the_model_tool_call_identity(self):
        request = ToolRequest.from_call(ToolCall("same-id", "read_file", {"path": "a.py"}))
        self.assertEqual("same-id", request.tool_call_id)
        self.assertEqual("read_file", request.name)
        self.assertEqual({"path": "a.py"}, request.arguments)

    def test_tool_result_keeps_executed_separate_from_result_status(self):
        preflight = ToolResult("error", False, "", False, {"code": "TOOL_NOT_FOUND"})
        executed = ToolResult("error", True, "", True, {"code": "TOOL_TIMEOUT"})
        self.assertFalse(preflight.executed)
        self.assertTrue(executed.executed)
        self.assertEqual("TOOL_TIMEOUT", executed.to_dict()["error"]["code"])

    def test_contracts_are_immutable(self):
        message = Message("user", "read")
        with self.assertRaises(FrozenInstanceError):
            message.content = "write"
