"""Run Phase 1 probe tests from the self-contained Win7 acceptance tree."""
import os
import sys
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "src", "phase1-2"))
PROBE_TESTS = os.path.join(ROOT, "tests", "phase1-2", "probe")
if not os.path.isdir(PROBE_TESTS):
    # E2 may use a flattened Chinese/space deployment tree.
    PROBE_TESTS = os.path.join(ROOT, "phase1-2", "probe")
    sys.path.insert(0, os.path.join(ROOT, "phase1-2"))
sys.path.insert(0, PROBE_TESTS)

suite = unittest.defaultTestLoader.discover(
    PROBE_TESTS, pattern="test_*.py", top_level_dir=PROBE_TESTS
)
result = unittest.TextTestRunner(verbosity=2).run(suite)
sys.exit(0 if result.wasSuccessful() else 1)
