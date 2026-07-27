"""Tool registration contracts; invocation data lives in win7_agent.models."""

from dataclasses import dataclass
from typing import Any, Dict


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    parameters: Dict[str, Dict[str, Any]]
    permission: str

    def to_dict(self):
        return {"name": self.name, "description": self.description,
                "parameters": self.parameters, "permission": self.permission}
