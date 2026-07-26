import unittest

from win7_agent.policy import PermissionType, PolicyEngine


class PolicyEngineTests(unittest.TestCase):
    def test_read_only_is_allowed(self):
        self.assertEqual("ALLOW", PolicyEngine().evaluate(PermissionType.READ_ONLY).decision)

    def test_all_non_read_only_permissions_are_denied(self):
        engine = PolicyEngine()
        for permission in [PermissionType.WORKSPACE_WRITE, PermissionType.PROCESS_EXECUTION, PermissionType.EXTERNAL_WRITE, PermissionType.DESTRUCTIVE]:
            self.assertEqual("DENY", engine.evaluate(permission).decision)
