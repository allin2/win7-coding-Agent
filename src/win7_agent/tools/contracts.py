"""Public data contracts for the six frozen prototype tools."""

from dataclasses import dataclass
from typing import Any, Dict, Optional


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    parameters: Dict[str, Dict[str, Any]]
    permission: str

    def to_dict(self) -> Dict[str, Any]:
        return {"name": self.name, "description": self.description, "parameters": self.parameters, "permission": self.permission}


@dataclass(frozen=True)
class ToolRequest:
    tool_call_id: str
    tool_name: str
    arguments: Dict[str, Any]
    run_id: str

    def to_dict(self) -> Dict[str, Any]:
        return {"tool_call_id": self.tool_call_id, "tool_name": self.tool_name, "arguments": self.arguments, "run_id": self.run_id}


@dataclass(frozen=True)
class ToolResult:
    tool_call_id: str
    status: str
    content: str
    truncated: bool
    error: Optional[Dict[str, Any]]
    duration_ms: int
    executed: bool

    def to_dict(self) -> Dict[str, Any]:
        return {
            "tool_call_id": self.tool_call_id,
            "status": self.status,
            "content": self.content,
            "truncated": self.truncated,
            "error": self.error,
            "duration_ms": self.duration_ms,
            "executed": self.executed,
        }
