"""Integration tests for CLI reports and selective execution."""

import json
import os
import tempfile
import unittest

from win7_agent.probe.__main__ import main


class CliTests(unittest.TestCase):
    """Run the CLI with a lightweight selected check."""

    def test_only_keeps_all_report_entries(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "Chinese report.json")
            code = main(["--out", path, "--db", "-", "--only", "sqlite.basic"])
            with open(path, "r", encoding="utf-8", newline="") as reader:
                report = json.load(reader)
        self.assertEqual(18, len(report["checks"]))
        self.assertEqual("pass", report["checks"][3]["status"])
        self.assertIn(code, (0, 1, 2))

    def test_invalid_path_returns_internal_error(self):
        path = os.path.join(tempfile.gettempdir(), "cap_probe_missing_parent", "result.json")
        code = main(["--out", path, "--db", "-", "--only", "sqlite.basic"])
        self.assertEqual(3, code)
