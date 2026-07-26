import unittest

from win7_agent.models import FinishReason, Message, ModelRequest, ModelResponse, ToolCall, Usage


class ContractTests(unittest.TestCase):
    def test_response_serializes_vendor_neutral_fields(self):
        response = ModelResponse(
            content="analysis",
            tool_calls=[ToolCall("call-1", "list_directory", {"path": ""})],
            finish_reason=FinishReason.TOOL_CALLS,
            usage=Usage(12, 8),
        )
        self.assertEqual("TOOL_CALLS", response.to_dict()["finish_reason"])
        self.assertEqual("list_directory", response.to_dict()["tool_calls"][0]["tool_name"])

    def test_request_serializes_messages_and_budget(self):
        request = ModelRequest([Message("user", "inspect")], [], 1, {"remaining_turns": 7})
        self.assertEqual("inspect", request.to_dict()["messages"][0]["content"])
