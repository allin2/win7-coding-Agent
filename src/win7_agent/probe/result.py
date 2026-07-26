"""Result objects shared by capability checks."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

PASS = "pass"
DEGRADED = "degraded"
FAIL = "fail"
ERROR = "error"
SKIPPED = "skipped"


@dataclass(frozen=True)
class ProbeError:
    """Structured, serializable failure information."""

    code: str
    message: str
    exception_type: Optional[str] = None
    traceback_tail: Optional[str] = None

    def as_dict(self) -> Dict[str, Any]:
        """Return the JSON report representation."""
        return {
            "code": self.code,
            "message": self.message,
            "exception_type": self.exception_type,
            "traceback_tail": self.traceback_tail,
        }


@dataclass(frozen=True)
class CheckResult:
    """One immutable capability-check result."""

    check_id: str
    status: str
    details: Dict[str, Any]
    duration_ms: int = 0
    error: Optional[ProbeError] = None

    def with_duration(self, duration_ms: int) -> "CheckResult":
        """Return this result with measured duration."""
        return CheckResult(self.check_id, self.status, self.details,
                           duration_ms, self.error)

    def as_dict(self) -> Dict[str, Any]:
        """Return the JSON report representation."""
        return {
            "id": self.check_id,
            "status": self.status,
            "duration_ms": self.duration_ms,
            "details": self.details,
            "error": self.error.as_dict() if self.error is not None else None,
        }
