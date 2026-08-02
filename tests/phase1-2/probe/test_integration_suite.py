"""Make the batch-test discovery command include integration tests."""

import os
import unittest


def load_tests(loader: unittest.TestLoader, tests: unittest.TestSuite,
               pattern: str) -> unittest.TestSuite:
    """Add the separately located integration suite to unit-test discovery."""
    integration_directory = os.path.abspath(os.path.join(
        os.path.dirname(__file__), "..", "..", "integration", "probe"))
    integration_loader = unittest.TestLoader()
    tests.addTests(integration_loader.discover(integration_directory, pattern="test_*.py"))
    return tests
