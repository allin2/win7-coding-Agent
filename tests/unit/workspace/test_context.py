import os
import tempfile
import unittest

from win7_agent.workspace import WorkspaceContext, WorkspaceError


class WorkspaceContextTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.workspace = WorkspaceContext(self.tempdir.name)

    def tearDown(self):
        self.tempdir.cleanup()

    def test_relative_path_resolves_under_root(self):
        self.assertEqual(os.path.join(self.workspace.root, "a.txt"), self.workspace.resolve("a.txt"))

    def test_parent_traversal_is_denied(self):
        with self.assertRaises(WorkspaceError) as error:
            self.workspace.resolve("../outside.txt")
        self.assertEqual("PATH_TRAVERSAL_DENIED", error.exception.code)

    def test_outside_absolute_path_is_denied(self):
        with self.assertRaises(WorkspaceError) as error:
            self.workspace.resolve(os.path.dirname(self.tempdir.name))
        self.assertEqual("PATH_OUTSIDE_WORKSPACE", error.exception.code)

    def test_chinese_and_space_path_is_allowed(self):
        name = "中文 space.txt"
        self.assertEqual(os.path.join(self.workspace.root, name), self.workspace.resolve(name))

    def test_symlink_escape_is_denied_when_platform_allows_link(self):
        outside = tempfile.TemporaryDirectory()
        self.addCleanup(outside.cleanup)
        link = os.path.join(self.workspace.root, "escape")
        try:
            os.symlink(outside.name, link)
        except (AttributeError, NotImplementedError, OSError):
            self.skipTest("symbolic links are unavailable on this platform")
        with self.assertRaises(WorkspaceError) as error:
            self.workspace.resolve("escape")
        self.assertEqual("PATH_OUTSIDE_WORKSPACE", error.exception.code)
