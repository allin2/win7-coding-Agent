"""Unit tests for deterministic OS-source arbitration."""

import unittest
from unittest import mock

from win7_agent.probe.checks import c_os


class Context(object):
    """Minimum immutable-like context for this unit test."""

    process_bitness = 64


class OsTests(unittest.TestCase):
    """Validate the frozen SP and conflict rules."""

    def test_win7_without_sp1_fails(self):
        sources = {
            "getwindowsversion": {"available": True, "raw": {"major": 6, "minor": 1,
                "build": 7600, "service_pack": "", "service_pack_major": 0,
                "service_pack_minor": 0, "platform": 2}},
            "win32_ver": {"available": True, "raw": {"release": "7", "version": "6.1.7600",
                "csd": "", "ptype": ""}},
            "registry": {"available": True, "raw": {"CurrentVersion": "6.1",
                "CurrentBuildNumber": "7600", "CSDVersion": "", "ProductName": "Windows 7"}},
        }
        with mock.patch.object(c_os, "_getwindowsversion_source", return_value=sources["getwindowsversion"]), \
             mock.patch.object(c_os, "_win32_ver_source", return_value=sources["win32_ver"]), \
             mock.patch.object(c_os, "_registry_source", return_value=sources["registry"]):
            result = c_os.check_os_version(Context())
        self.assertEqual("fail", result.status)
        self.assertEqual("SP_UNCONFIRMED", result.error.code)

    def test_conflict_is_degraded(self):
        first = {"available": True, "raw": {"major": 6, "minor": 1, "build": 7601,
                 "service_pack": "Service Pack 1", "service_pack_major": 1,
                 "service_pack_minor": 0, "platform": 2}}
        second = {"available": True, "raw": {"release": "10", "version": "10.0.1",
                  "csd": "", "ptype": ""}}
        third = {"available": False, "reason": "unavailable", "exception_type": "OSError"}
        with mock.patch.object(c_os, "_getwindowsversion_source", return_value=first), \
             mock.patch.object(c_os, "_win32_ver_source", return_value=second), \
             mock.patch.object(c_os, "_registry_source", return_value=third):
            result = c_os.check_os_version(Context())
        self.assertEqual("degraded", result.status)
        self.assertEqual("OS_SOURCE_CONFLICT", result.error.code)
