"""Vendor-neutral request, response, and tool-message data contracts."""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


class FinishReason(str, Enum):
    """The only completion reasons used by prototype providers."""

    STOP = "STOP"
    TOOL_CALLS = "TOOL_CALLS"
    ERROR = "ERROR"


@dataclass(frozen=True)
class Message:
    role: str
    content: str
    tool_call_id: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {"role": self.role, "content": self.content, "tool_call_id": self.tool_call_id}


@dataclass(frozen=True)
class ToolCall:
    tool_call_id: str
    tool_name: str
    arguments: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return {"tool_call_id": self.tool_call_id, "tool_name": self.tool_name, "arguments": dict(self.arguments)}


@dataclass(frozen=True)
class ToolResultMessage:
    tool_call_id: str
    status: str
    content: str
    truncated: bool
    error: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "tool_call_id": self.tool_call_id,
            "status": self.status,
            "content": self.content,
            "truncated": self.truncated,
            "error": self.error,
        }


@dataclass(frozen=True)
class Usage:
    prompt_chars: int = 0
    completion_chars: int = 0

    def to_dict(self) -> Dict[str, int]:
        return {"prompt_chars": self.prompt_chars, "completion_chars": self.completion_chars}


@dataclass(frozen=True)
class ModelRequest:
    messages: List[Message]
    tools: List[Dict[str, Any]]
    turn: int
    budget: Dict[str, int]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "messages": [message.to_dict() for message in self.messages],
            "tools": list(self.tools),
            "turn": self.turn,
            "budget": dict(self.budget),
        }


@dataclass(frozen=True)
class ModelResponse:
    content: str = ""
    tool_calls: List[ToolCall] = field(default_factory=list)
    finish_reason: FinishReason = FinishReason.STOP
    usage: Usage = field(default_factory=Usage)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "content": self.content,
            "tool_calls": [tool_call.to_dict() for tool_call in self.tool_calls],
            "finish_reason": self.finish_reason.value,
            "usage": self.usage.to_dict(),
        }
