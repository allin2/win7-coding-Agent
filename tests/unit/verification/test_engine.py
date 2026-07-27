"""F36 verification requires recorded reading and valid policy evidence."""

import unittest

from win7_agent.verification import VerificationEngine


class VerificationTests(unittest.TestCase):
    def test_f36_requires_a_real_read_reference(self):
        engine = VerificationEngine()
        rejected = engine.verify("target found", [])
        self.assertFalse(rejected.completed)
        events = [
            {"type": "policy.decision", "payload": {"tool_call_id": "c", "decision": {"decision": "ALLOW"}}},
            {"type": "tool.result", "payload": {"tool_call_id": "c", "executed": True,
                                                      "content": "code.py:2: target_function"}}]
        accepted = engine.verify("Found code.py:2", events)
        self.assertTrue(accepted.completed)

    def test_f36_rejects_execution_without_matching_allow(self):
        event = {"type": "tool.result", "payload": {"tool_call_id": "bad", "executed": True,
                                                         "content": "code.py:2: target"}}
        decision = VerificationEngine().verify("code.py:2", [event])
        self.assertFalse(decision.completed)
