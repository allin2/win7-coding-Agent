"""Frozen, deny-by-default policy for the architecture prototype."""

from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict


class PermissionType(str, Enum):
    READ_ONLY = "READ_ONLY"
    WORKSPACE_WRITE = "WORKSPACE_WRITE"
    PROCESS_EXECUTION = "PROCESS_EXECUTION"
    EXTERNAL_WRITE = "EXTERNAL_WRITE"
    DESTRUCTIVE = "DESTRUCTIVE"


@dataclass(frozen=True)
class PolicyDecision:
    decision: str
    permission: PermissionType
    reason: str

    def to_dict(self) -> Dict[str, Any]:
        return {"decision": self.decision, "permission": self.permission.value, "reason": self.reason}


class PolicyEngine:
    def evaluate(self, permission: PermissionType) -> PolicyDecision:
        if permission == PermissionType.READ_ONLY:
            return PolicyDecision("ALLOW", permission, "read-only tools are permitted in the prototype")
        return PolicyDecision("DENY", permission, "prototype policy permits READ_ONLY only")
