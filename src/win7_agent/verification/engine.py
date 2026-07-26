"""Rules ensuring that final text is backed by permitted real tool evidence."""

from abc import ABCMeta, abstractmethod
from dataclasses import dataclass
import re
from typing import Any, Dict, List


@dataclass(frozen=True)
class VerificationResult:
    rule_id: str
    passed: bool
    reasons: List[str]

    def to_dict(self) -> Dict[str, Any]:
        return {"rule_id": self.rule_id, "passed": self.passed, "reasons": list(self.reasons)}


@dataclass(frozen=True)
class CompletionDecision:
    decision: str
    reasons: List[str]

    def to_dict(self) -> Dict[str, Any]:
        return {"decision": self.decision, "reasons": list(self.reasons)}


class VerificationRule(metaclass=ABCMeta):
    @abstractmethod
    def evaluate(self, run_snapshot: Dict[str, Any], event_trace: List[Dict[str, Any]], final_text: str) -> VerificationResult:
        """Evaluate one immutable run trace."""


class RequiredEvidenceRule(VerificationRule):
    def evaluate(self, run_snapshot, event_trace, final_text):
        requests = {}
        successful_ids = set()
        for event in event_trace:
            payload = event["payload"]
            if event["event_type"] == "tool.requested":
                requests[payload.get("tool_call_id")] = payload
            elif event["event_type"] == "tool.result" and payload.get("status") == "ok":
                successful_ids.add(payload.get("tool_call_id"))
        evidence_paths = []
        for call_id in successful_ids:
            request = requests.get(call_id, {})
            if request.get("tool_name") in ("read_file", "read_file_range"):
                path = request.get("arguments", {}).get("path")
                if path:
                    evidence_paths.append(path)
        for path in evidence_paths:
            if path in final_text and re.search(re.escape(path) + r":\d+", final_text):
                return VerificationResult("required_evidence", True, [])
        return VerificationResult("required_evidence", False, ["final analysis lacks a cited read-file path and line number"])


class NoPolicyViolationRule(VerificationRule):
    def evaluate(self, run_snapshot, event_trace, final_text):
        allowed = set()
        denied = set()
        violations = []
        for event in event_trace:
            payload = event["payload"]
            if event["event_type"] == "policy.decision":
                if payload.get("decision") == "ALLOW":
                    allowed.add(payload.get("tool_call_id"))
                else:
                    denied.add(payload.get("tool_call_id"))
            elif event["event_type"] == "tool.result":
                call_id = payload.get("tool_call_id")
                if call_id not in allowed or call_id in denied:
                    violations.append("tool result without an ALLOW decision: {0}".format(call_id))
        return VerificationResult("no_policy_violation", not violations, violations)


class VerificationEngine:
    def __init__(self, rules=None) -> None:
        self._rules = list(rules) if rules is not None else [RequiredEvidenceRule(), NoPolicyViolationRule()]

    def verify(self, run_snapshot: Dict[str, Any], event_trace: List[Dict[str, Any]], final_text: str):
        results = [rule.evaluate(run_snapshot, event_trace, final_text) for rule in self._rules]
        reasons = []
        for result in results:
            reasons.extend(result.reasons)
        return results, CompletionDecision("COMPLETE" if not reasons else "REJECT", reasons)
