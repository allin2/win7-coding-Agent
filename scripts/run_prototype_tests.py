"""Recursively run every prototype and Probe unittest with one ASCII-only command."""

import os
import sys
import unittest


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEST_ROOTS = ("tests/unit", "tests/integration")
MINIMUM_TEST_COUNT = 93


def _sort_key(path):
    return os.path.normcase(os.path.normpath(path))


def _clear_bare_test_modules():
    for name in list(sys.modules):
        if name.startswith("test_"):
            del sys.modules[name]


class _IsolatedTextResult(unittest.TextTestResult):
    """Keep nested Probe discovery independent of duplicate bare test names."""

    def startTest(self, test):
        _clear_bare_test_modules()
        unittest.TextTestResult.startTest(self, test)


def _find_test_directories(root):
    directories = []
    errors = []
    for relative in TEST_ROOTS:
        test_root = os.path.join(root, relative)
        if not os.path.isdir(test_root):
            errors.append("test root is missing or unreadable: {0}".format(relative))
            continue

        def onerror(error):
            errors.append("cannot read test directory: {0}".format(error.filename or relative))

        try:
            for directory, subdirs, files in os.walk(test_root, onerror=onerror):
                subdirs.sort(key=_sort_key)
                files.sort(key=_sort_key)
                if any(name.startswith("test_") and name.endswith(".py") for name in files):
                    directories.append(directory)
        except OSError as error:
            errors.append("cannot read test directory: {0}".format(error.filename or relative))
    # Some legacy Probe tests expose a ``load_tests`` hook that performs its
    # own discovery of a sibling suite with duplicate bare module names.  Load
    # such hook directories first; each group is still path-normalized and
    # stably sorted, and every later discovery clears its transient modules.
    return sorted(
        directories,
        key=lambda path: (0 if os.path.isfile(os.path.join(path, "test_integration_suite.py")) else 1, _sort_key(path)),
    ), errors


def build_suite(root=ROOT):
    src = os.path.join(root, "src")
    if src not in sys.path:
        sys.path.insert(0, src)
    if root not in sys.path:
        sys.path.insert(0, root)
    loader = unittest.defaultTestLoader
    suite = unittest.TestSuite()
    directories, errors = _find_test_directories(root)
    for start in directories:
        _clear_bare_test_modules()
        try:
            suite.addTests(loader.discover(start_dir=start, pattern="test_*.py", top_level_dir=start))
        except (ImportError, OSError) as error:
            errors.append("cannot load tests from {0}: {1}".format(start, error))
    # Suites retain their imported TestCase objects.  Removing bare module
    # names before execution prevents Probe's own nested discover call from
    # mistaking an equally named module from another test directory for its
    # integration test module.
    _clear_bare_test_modules()
    return suite, errors


def main(root=ROOT, minimum_test_count=MINIMUM_TEST_COUNT):
    suite, discovery_errors = build_suite(root)
    total = suite.countTestCases()
    print("TOTAL tests run: {0}".format(total))
    for error in discovery_errors:
        print("ERROR {0}".format(error), file=sys.stderr)
    if discovery_errors or total == 0 or total < minimum_test_count:
        if total < minimum_test_count:
            print("ERROR test count below minimum: {0} < {1}".format(total, minimum_test_count), file=sys.stderr)
        return 1
    result = unittest.TextTestRunner(verbosity=2, resultclass=_IsolatedTextResult).run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())
