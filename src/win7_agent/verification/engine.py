"""Verification based on recorded evidence, never provider assertions alone."""

from __future__ import print_function

import re
from dataclasses import dataclass
from typing import List


@dataclass(frozen=True)
class VerificationResult:
    accepted: bool
    code: str
    message: str


@dataclass(frozen=True)
class CompletionDecision:
    completed: bool
    results: List[VerificationResult]


class RequiredEvidenceRule(object):
    _REFERENCE = re.compile(r"[^\s:]+:\d+")

    def evaluate(self, final_content, events):
        references = self._REFERENCE.findall(final_content or "")
        if not references:
            return VerificationResult(False, "VERIFICATION_REJECTED", "analysis has no file line reference")
        read_content = "\n".join(
            event["payload"].get("content", "") for event in events
            if event["type"] == "tool.result" and event["payload"].get("executed") is True)
        for reference in references:
            if reference in read_content:
                return VerificationResult(True, "", "read evidence found")
        return VerificationResult(False, "VERIFICATION_REJECTED", "referenced evidence was not read")


class NoPolicyViolationRule(object):
    def evaluate(self, unused_content, events):
        allowed = set()
        denied = set()
        for event in events:
            payload = event["payload"]
            if event["type"] == "policy.decision" and payload.get("decision", {}).get("decision") == "ALLOW":
                allowed.add(payload.get("tool_call_id"))
            elif event["type"] == "tool.denied":
                denied.add(payload.get("tool_call_id"))
            elif event["type"] == "tool.result" and payload.get("executed") is True:
                if payload.get("tool_call_id") not in allowed:
                    return VerificationResult(False, "VERIFICATION_REJECTED", "executed tool lacks ALLOW")
                if payload.get("tool_call_id") in denied:
                    return VerificationResult(False, "VERIFICATION_REJECTED", "DENY was followed by execution")
        return VerificationResult(True, "", "policy trace is consistent")


class VerificationEngine(object):
    def __init__(self, rules=None):
        self.rules = list(rules or [RequiredEvidenceRule(), NoPolicyViolationRule()])

    def verify(self, final_content, events):
        results = [rule.evaluate(final_content, events) for rule in self.rules]
        return CompletionDecision(all(result.accepted for result in results), results)
