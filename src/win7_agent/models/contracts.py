"""Frozen, vendor-neutral data contracts for the read-only agent."""

from __future__ import print_function

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


class FinishReason(str, Enum):
    """The only provider completion reasons accepted in Phase 2."""

    STOP = "STOP"
    TOOL_CALLS = "TOOL_CALLS"
    ERROR = "ERROR"


@dataclass(frozen=True)
class Message:
    """One vendor-neutral model message."""

    role: str
    content: str

    def to_dict(self):
        return {"role": self.role, "content": self.content}


@dataclass(frozen=True)
class ToolCall:
    """A model request to invoke one registered tool."""

    tool_call_id: str
    name: str
    arguments: Dict[str, Any]

    def to_dict(self):
        return {
            "tool_call_id": self.tool_call_id,
            "name": self.name,
            "arguments": dict(self.arguments)}


@dataclass(frozen=True)
class ToolRequest:
    """The tool-facing representation of one requested invocation."""

    tool_call_id: str
    name: str
    arguments: Dict[str, Any]

    @classmethod
    def from_call(cls, tool_call):
        return cls(tool_call.tool_call_id, tool_call.name, dict(tool_call.arguments))


@dataclass(frozen=True)
class ToolResult:
    """A structured result, including the frozen executed boundary."""

    status: str
    executed: bool
    content: str
    truncated: bool
    error: Optional[Dict[str, Any]] = None

    def to_dict(self):
        return {
            "status": self.status,
            "executed": self.executed,
            "content": self.content,
            "truncated": self.truncated,
            "error": self.error}


@dataclass(frozen=True)
class Usage:
    """Deterministic character counts, not a claim about provider tokens."""

    prompt_chars: int = 0
    completion_chars: int = 0

    def to_dict(self):
        return {
            "prompt_chars": self.prompt_chars,
            "completion_chars": self.completion_chars}


@dataclass(frozen=True)
class ModelRequest:
    """The complete vendor-neutral input to one provider turn."""

    messages: List[Message]
    tools: List[Dict[str, Any]]
    turn: int

    def to_dict(self):
        return {
            "messages": [message.to_dict() for message in self.messages],
            "tools": list(self.tools),
            "turn": self.turn}


@dataclass(frozen=True)
class ModelResponse:
    """The complete vendor-neutral output from one provider turn."""

    content: str = ""
    tool_calls: List[ToolCall] = field(default_factory=list)
    finish_reason: FinishReason = FinishReason.STOP
    usage: Usage = field(default_factory=Usage)

    def to_dict(self):
        return {
            "content": self.content,
            "tool_calls": [tool_call.to_dict() for tool_call in self.tool_calls],
            "finish_reason": self.finish_reason.value,
            "usage": self.usage.to_dict()}
