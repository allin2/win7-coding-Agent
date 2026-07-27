"""The frozen Phase 2 READ_ONLY-only policy."""

from dataclasses import dataclass
from enum import Enum


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

    def to_dict(self):
        return {"decision": self.decision, "permission": self.permission.value,
                "reason": self.reason}


class PolicyEngine(object):
    """Allow only declared read-only tools, explicitly denying every other class."""

    def evaluate(self, permission):
        if permission == PermissionType.READ_ONLY:
            return PolicyDecision("ALLOW", permission, "read-only tool is permitted")
        return PolicyDecision("DENY", permission, "Phase 2 permits READ_ONLY only")
