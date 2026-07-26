import unittest

from win7_agent.verification import VerificationEngine


class VerificationEngineTests(unittest.TestCase):
    def test_real_permitted_read_evidence_completes(self):
        trace = [
            {"event_type": "tool.requested", "payload": {"tool_call_id": "call-1", "tool_name": "read_file_range", "arguments": {"path": "src/target.py"}}},
            {"event_type": "policy.decision", "payload": {"tool_call_id": "call-1", "decision": "ALLOW"}},
            {"event_type": "tool.result", "payload": {"tool_call_id": "call-1", "status": "ok"}},
        ]
        _, decision = VerificationEngine().verify({}, trace, "See src/target.py:1-2.")
        self.assertEqual("COMPLETE", decision.decision)

    def test_model_cannot_complete_without_read_evidence(self):
        _, decision = VerificationEngine().verify({}, [], "The answer is complete.")
        self.assertEqual("REJECT", decision.decision)

    def test_tool_result_without_allow_is_rejected(self):
        trace = [{"event_type": "tool.result", "payload": {"tool_call_id": "call-1", "status": "ok"}}]
        results, decision = VerificationEngine().verify({}, trace, "src/target.py:1")
        self.assertFalse([result for result in results if result.rule_id == "no_policy_violation"][0].passed)
        self.assertEqual("REJECT", decision.decision)
