"""Read-only, lexical and realpath workspace boundary checks."""

from __future__ import print_function

import errno
import os


class WorkspaceError(Exception):
    """A structured workspace error from a frozen Phase 2 error code."""

    def __init__(self, code, message):
        Exception.__init__(self, message)
        self.code = code
        self.message = message

    def to_dict(self):
        return {"code": self.code, "message": self.message}


class WorkspaceContext(object):
    """A workspace root with no filesystem mutation methods."""

    DEFAULT_IGNORED = [".git", ".svn", "__pycache__", "node_modules"]

    def __init__(self, root, ignored_directories=None):
        if not isinstance(root, str) or not root:
            raise WorkspaceError("INVALID_TOOL_ARGUMENT", "workspace root must be a string")
        try:
            normalized = os.path.realpath(os.path.abspath(root))
        except OSError as error:
            raise self._path_error(error)
        if not os.path.isdir(normalized):
            raise WorkspaceError("PATH_OUTSIDE_WORKSPACE", "workspace root does not exist")
        self.root = normalized
        self._root_compare = self._comparison_path(normalized)
        self.ignored_directories = list(
            self.DEFAULT_IGNORED if ignored_directories is None else ignored_directories)

    @staticmethod
    def _path_error(error):
        if (getattr(error, "errno", None) == errno.ENAMETOOLONG or
                getattr(error, "winerror", None) == 206):
            return WorkspaceError("PATH_TOO_LONG", "path exceeds platform limit")
        return WorkspaceError("UNEXPECTED", str(error))

    @staticmethod
    def _comparison_path(path):
        return os.path.normcase(os.path.realpath(os.path.abspath(path)))

    @staticmethod
    def _under_root(candidate, root):
        return candidate == root or candidate.startswith(root + os.sep)

    def resolve(self, requested_path=""):
        """Resolve an in-workspace path while preserving rejection reasons."""
        if not isinstance(requested_path, str):
            raise WorkspaceError("INVALID_TOOL_ARGUMENT", "path must be a string")
        requested_path = requested_path.replace("\\", os.sep)
        try:
            if os.path.isabs(requested_path):
                lexical = os.path.normpath(requested_path)
                lexical_code = "PATH_OUTSIDE_WORKSPACE"
            else:
                lexical = os.path.normpath(os.path.join(self.root, requested_path))
                lexical_code = "PATH_TRAVERSAL_DENIED"
            lexical_compare = os.path.normcase(os.path.abspath(lexical))
            if not self._under_root(lexical_compare, self._root_compare):
                raise WorkspaceError(lexical_code, "path is outside the workspace")
            resolved = os.path.realpath(lexical)
        except WorkspaceError:
            raise
        except OSError as error:
            raise self._path_error(error)
        if not self._under_root(self._comparison_path(resolved), self._root_compare):
            raise WorkspaceError("PATH_OUTSIDE_WORKSPACE", "resolved path escapes the workspace")
        return resolved

    def relative_path(self, absolute_path):
        return os.path.relpath(absolute_path, self.root).replace(os.sep, "/")

    def is_ignored_name(self, name):
        return name in self.ignored_directories
