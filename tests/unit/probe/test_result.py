"""Unit tests for probe result and report semantics."""

import unittest

from win7_agent.probe.reportio import summarize
from win7_agent.probe.result import CheckResult, ProbeError


class ResultTests(unittest.TestCase):
    """Exercise JSON-safe result structures."""

    def test_error_serializes(self):
        result = CheckResult("example", "fail", {"value": 1}, 12,
                             ProbeError("CODE", "message", "ValueError"))
        self.assertEqual("CODE", result.as_dict()["error"]["code"])
        self.assertEqual(12, result.as_dict()["duration_ms"])

    def test_exit_code_priority(self):
        summary = summarize([CheckResult("a", "pass", {}),
                             CheckResult("b", "degraded", {}),
                             CheckResult("c", "error", {})])
        self.assertEqual(2, summary["exit_code"])
        self.assertFalse(summary["agent_runnable"])
