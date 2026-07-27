#!/usr/bin/env python3
"""Run the formally authorized Phase 1 and Phase 2 unittest suites.

This is deliberately a small, stdlib-only test entry point.  It finds test
files from the filesystem rather than maintaining a module list, so a newly
added nested test is part of the gate without editing this script.
"""

from __future__ import print_function

import argparse
import ast
import compileall
import importlib.util
import os
import re
import shutil
import sys
import tempfile
import unittest


MINIMUM_TEST_COUNT = 60
TEST_FILE_RE = re.compile(r"^test_.*\.py$")
PYTHON39_GENERIC_RE = re.compile(r"\b(?:list|dict|tuple)\s*\[")


class DiscoveryError(Exception):
    """A test root cannot be discovered or imported."""


class TestRunSummary(object):
    """The machine-readable facts returned by one test run."""

    def __init__(self, exit_code, tests_run, errors):
        self.exit_code = exit_code
        self.tests_run = tests_run
        self.errors = errors


def _ascii(value):
    """Return a console-safe representation without losing failure context."""
    return str(value).encode("ascii", "backslashreplace").decode("ascii")


def repository_root():
    """Return the repository root independent of the current directory."""
    return os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def default_test_roots():
    """Return the two recursively discovered formal test roots."""
    root = repository_root()
    return [os.path.join(root, "tests", "unit"),
            os.path.join(root, "tests", "integration")]


def discover_test_files(test_roots):
    """Find test files recursively in deterministic normalized-path order."""
    paths = []
    for test_root in test_roots:
        if not os.path.isdir(test_root):
            raise DiscoveryError("test directory is not readable: {0}".format(
                test_root))

        walk_errors = []

        def onerror(error):
            walk_errors.append(error)

        try:
            for directory, directory_names, file_names in os.walk(
                    test_root, topdown=True, onerror=onerror):
                directory_names.sort(key=os.path.normcase)
                for file_name in sorted(file_names, key=os.path.normcase):
                    if TEST_FILE_RE.match(file_name):
                        paths.append(os.path.join(directory, file_name))
        except OSError as error:
            raise DiscoveryError("test directory is not readable: {0}".format(
                error))
        if walk_errors:
            raise DiscoveryError("test directory is not readable: {0}".format(
                walk_errors[0]))
    return sorted(paths, key=lambda item: os.path.normcase(os.path.abspath(item)))


def _load_module(path, index):
    """Import an individually discovered test file with an isolated name."""
    name = "_agent_test_{0}".format(index)
    specification = importlib.util.spec_from_file_location(name, path)
    if specification is None or specification.loader is None:
        raise DiscoveryError("cannot load test module: {0}".format(path))
    module = importlib.util.module_from_spec(specification)
    try:
        specification.loader.exec_module(module)
    except Exception as error:
        raise DiscoveryError("cannot import test module {0}: {1}".format(
            path, error))
    return module


def _suite_from_module(module, loader):
    """Load TestCase classes without legacy cross-directory load_tests hooks."""
    suite = unittest.TestSuite()
    for name in sorted(dir(module), key=os.path.normcase):
        candidate = getattr(module, name)
        if (isinstance(candidate, type) and
                issubclass(candidate, unittest.TestCase) and
                candidate is not unittest.TestCase and
                candidate.__module__ == module.__name__):
            suite.addTests(loader.loadTestsFromTestCase(candidate))
    return suite


def build_suite(test_roots):
    """Build a suite from all dynamically discovered test modules."""
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    paths = discover_test_files(test_roots)
    for index, path in enumerate(paths):
        suite.addTests(_suite_from_module(_load_module(path, index), loader))
    return suite


def run_test_suite(test_roots, minimum_test_count=MINIMUM_TEST_COUNT,
                   stream=None):
    """Run a discovered unittest suite and return factual execution results."""
    if stream is None:
        stream = sys.stdout
    try:
        suite = build_suite(test_roots)
    except DiscoveryError as error:
        print("ERROR test discovery: {0}".format(_ascii(error)), file=sys.stderr)
        return TestRunSummary(1, 0, [_ascii(error)])

    runner = unittest.TextTestRunner(stream=stream, verbosity=2)
    result = runner.run(suite)
    count = result.testsRun
    print("TOTAL tests run: {0}".format(count), file=stream)
    if count == 0:
        print("ERROR no tests discovered", file=sys.stderr)
        return TestRunSummary(1, count, ["no tests discovered"])
    if count < minimum_test_count:
        message = "test count {0} is below minimum {1}".format(
            count, minimum_test_count)
        print("ERROR {0}".format(message), file=sys.stderr)
        return TestRunSummary(1, count, [message])
    if not result.wasSuccessful():
        return TestRunSummary(1, count, ["test failure"])
    return TestRunSummary(0, count, [])


class _SafetyVisitor(ast.NodeVisitor):
    """Reject statically recognizable forbidden production operations."""

    FORBIDDEN_IMPORTS = set(["urllib", "http.client", "socket", "requests"])
    FORBIDDEN_ATTRIBUTES = set([
        ("os", "system"), ("os", "popen"),
        ("subprocess", "getoutput"),
        ("pathlib.Path", "is_relative_to"),
        ("str", "removeprefix"), ("str", "removesuffix")])

    def __init__(self, path):
        self.path = path
        self.findings = []

    def _record(self, node, category):
        self.findings.append("{0}:{1}: {2}".format(
            self.path, getattr(node, "lineno", 0), category))

    def _check_annotation(self, annotation):
        if isinstance(annotation, ast.Subscript):
            if isinstance(annotation.value, ast.Name):
                if annotation.value.id in ("list", "dict", "tuple"):
                    self._record(annotation, "forbidden Python 3.9 generic annotation")
        if isinstance(annotation, ast.BinOp) and isinstance(annotation.op, ast.BitOr):
            self._record(annotation, "forbidden Python 3.10 union annotation")

    def visit_arg(self, node):
        if node.annotation is not None:
            self._check_annotation(node.annotation)
        self.generic_visit(node)

    def visit_AnnAssign(self, node):
        self._check_annotation(node.annotation)
        self.generic_visit(node)

    def visit_FunctionDef(self, node):
        if node.returns is not None:
            self._check_annotation(node.returns)
        self.generic_visit(node)

    def visit_Import(self, node):
        for alias in node.names:
            if alias.name in self.FORBIDDEN_IMPORTS:
                self._record(node, "forbidden import {0}".format(alias.name))
        self.generic_visit(node)

    def visit_ImportFrom(self, node):
        if node.module in self.FORBIDDEN_IMPORTS:
            self._record(node, "forbidden import {0}".format(node.module))
        self.generic_visit(node)

    def visit_Call(self, node):
        if isinstance(node.func, ast.Attribute):
            value = node.func.value
            if isinstance(value, ast.Name):
                pair = (value.id, node.func.attr)
                if pair in self.FORBIDDEN_ATTRIBUTES:
                    self._record(node, "forbidden call {0}.{1}".format(*pair))
            if node.func.attr in ("is_relative_to", "removeprefix", "removesuffix"):
                self._record(node, "forbidden Python 3.9 API {0}".format(
                    node.func.attr))
        if isinstance(node.func, ast.Name) and node.func.id == "open":
            has_encoding = any(keyword.arg == "encoding" for keyword in node.keywords)
            mode = None
            if len(node.args) >= 2 and isinstance(node.args[1], ast.Str):
                mode = node.args[1].s
            for keyword in node.keywords:
                if keyword.arg == "mode" and isinstance(keyword.value, ast.Str):
                    mode = keyword.value.s
            if not has_encoding and (mode is None or "b" not in mode):
                self._record(node, "text open without encoding")
        for keyword in node.keywords:
            if keyword.arg == "shell" and isinstance(keyword.value, ast.NameConstant):
                if keyword.value.value is True:
                    self._record(node, "forbidden shell execution")
        self.generic_visit(node)


def production_python_files(root):
    """Return production source and Python script paths in stable order."""
    candidates = []
    source_root = os.path.join(root, "src", "win7_agent")
    scripts_root = os.path.join(root, "scripts")
    for directory in (source_root, scripts_root):
        if not os.path.isdir(directory):
            continue
        for current, directories, files in os.walk(directory):
            directories.sort(key=os.path.normcase)
            for filename in sorted(files, key=os.path.normcase):
                if filename.endswith(".py"):
                    candidates.append(os.path.join(current, filename))
    return sorted(candidates, key=lambda item: os.path.normcase(os.path.abspath(item)))


def static_safety_scan(root=None):
    """Return static-scan findings for production files, never test literals."""
    if root is None:
        root = repository_root()
    findings = []
    for path in production_python_files(root):
        try:
            with open(path, "r", encoding="utf-8", newline="") as reader:
                source = reader.read()
            tree = ast.parse(source, filename=path)
        except (OSError, SyntaxError, UnicodeError) as error:
            findings.append("{0}: unreadable source: {1}".format(path, error))
            continue
        visitor = _SafetyVisitor(path)
        visitor.visit(tree)
        findings.extend(visitor.findings)
    return findings


def run_compileall(root=None):
    """Compile authorized source, tests, and scripts with the active Python."""
    if root is None:
        root = repository_root()
    cache_directory = tempfile.mkdtemp(prefix="win7_agent_compile_")
    original_prefix = getattr(sys, "pycache_prefix", None)
    try:
        if hasattr(sys, "pycache_prefix"):
            sys.pycache_prefix = cache_directory
        success = True
        for relative_path in ("src", "tests", "scripts"):
            success = compileall.compile_dir(
                os.path.join(root, relative_path), quiet=1) and success
        return 0 if success else 1
    finally:
        if hasattr(sys, "pycache_prefix"):
            sys.pycache_prefix = original_prefix
        shutil.rmtree(cache_directory, ignore_errors=True)


def main(argv=None):
    """Provide the test, compileall, and static-scan entry points."""
    parser = argparse.ArgumentParser(description="Run formal agent tests")
    parser.add_argument("--compileall", action="store_true")
    parser.add_argument("--static-scan", action="store_true")
    arguments = parser.parse_args(argv)
    if arguments.compileall:
        return run_compileall()
    if arguments.static_scan:
        findings = static_safety_scan()
        for finding in findings:
            print("ERROR static scan: {0}".format(_ascii(finding)), file=sys.stderr)
        return 0 if not findings else 1
    return run_test_suite(default_test_roots()).exit_code


if __name__ == "__main__":
    sys.exit(main())
