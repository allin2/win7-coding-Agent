"""F05--F09 workspace boundary tests."""

import errno
import os
import tempfile
import unittest
from unittest import mock

from win7_agent.workspace import WorkspaceContext, WorkspaceError


class WorkspaceTests(unittest.TestCase):
    def test_f05_and_f06_reject_traversal_and_absolute_external_paths(self):
        with tempfile.TemporaryDirectory() as root, tempfile.TemporaryDirectory() as outside:
            workspace = WorkspaceContext(root)
            for path, code in (("../outside", "PATH_TRAVERSAL_DENIED"),
                               (outside, "PATH_OUTSIDE_WORKSPACE")):
                with self.assertRaises(WorkspaceError) as captured:
                    workspace.resolve(path)
                self.assertEqual(code, captured.exception.code)

    def test_f07_realpath_escape_is_rejected_when_supported(self):
        with tempfile.TemporaryDirectory() as root, tempfile.TemporaryDirectory() as outside:
            link = os.path.join(root, "escape")
            try:
                os.symlink(outside, link)
            except (AttributeError, OSError):
                self.skipTest("symbolic links unavailable")
            with self.assertRaises(WorkspaceError) as captured:
                WorkspaceContext(root).resolve("escape")
            self.assertEqual("PATH_OUTSIDE_WORKSPACE", captured.exception.code)

    def test_f08_recognizes_both_path_too_long_forms(self):
        native = OSError(errno.ENAMETOOLONG, "too long")
        windows = OSError("too long")
        windows.winerror = 206
        self.assertEqual("PATH_TOO_LONG", WorkspaceContext._path_error(native).code)
        self.assertEqual("PATH_TOO_LONG", WorkspaceContext._path_error(windows).code)

    def test_f09_special_paths_and_backslash_are_kept_in_workspace(self):
        with tempfile.TemporaryDirectory() as root:
            name = "中文 space % #"
            os.mkdir(os.path.join(root, name))
            workspace = WorkspaceContext(root)
            self.assertEqual(os.path.realpath(os.path.join(root, name)),
                             workspace.resolve(name.replace("/", "\\")))
