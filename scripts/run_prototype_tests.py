"""Run every prototype and Probe unittest directory with one ASCII-only command."""

import os
import sys
import unittest


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEST_DIRECTORIES = [
    "tests/unit/models",
    "tests/unit/runtime",
    "tests/unit/context",
    "tests/unit/tools",
    "tests/unit/policy",
    "tests/unit/workspace",
    "tests/unit/storage",
    "tests/unit/verification",
    "tests/unit/cli",
    "tests/integration/prototype",
    "tests/unit/probe",
    "tests/integration/probe",
]


def main():
    src = os.path.join(ROOT, "src")
    if src not in sys.path:
        sys.path.insert(0, src)
    if ROOT not in sys.path:
        sys.path.insert(0, ROOT)
    loader = unittest.defaultTestLoader
    suite = unittest.TestSuite()
    for relative in TEST_DIRECTORIES:
        start = os.path.join(ROOT, relative)
        for name in list(sys.modules):
            if name.startswith("test_"):
                del sys.modules[name]
        suite.addTests(loader.discover(start_dir=start, pattern="test_*.py", top_level_dir=start))
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())
