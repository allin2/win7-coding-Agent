"""Filesystem boundary checks; this module intentionally exposes no write API."""

import os
from abc import ABCMeta, abstractmethod
from typing import List, Optional


class WorkspaceError(Exception):
    def __init__(self, code: str, message: str) -> None:
        Exception.__init__(self, message)
        self.code = code
        self.message = message

    def to_dict(self):
        return {"code": self.code, "message": self.message, "exception_type": self.__class__.__name__}


class WorkspaceContext:
    """A realpath-based, read-only view of one existing workspace root."""

    DEFAULT_IGNORED = [".git", "__pycache__", ".svn", "node_modules"]

    def __init__(self, root: str, ignored_directories: Optional[List[str]] = None) -> None:
        if not root:
            raise WorkspaceError("FILE_NOT_FOUND", "workspace root is required")
        normalized = os.path.realpath(os.path.abspath(root))
        if not os.path.isdir(normalized):
            raise WorkspaceError("FILE_NOT_FOUND", "workspace root does not exist")
        self.root = normalized
        self.read_only = True
        self.ignored_directories = list(ignored_directories or self.DEFAULT_IGNORED)

    def resolve(self, requested_path: str = "") -> str:
        if not isinstance(requested_path, str):
            raise WorkspaceError("INVALID_TOOL_ARGUMENT", "path must be a string")
        if os.path.isabs(requested_path):
            candidate = os.path.normpath(requested_path)
        else:
            candidate = os.path.normpath(os.path.join(self.root, requested_path))
        root_compare = os.path.normcase(self.root)
        candidate_compare = os.path.normcase(candidate)
        if not self._is_under_root(candidate_compare, root_compare):
            code = "PATH_OUTSIDE_WORKSPACE" if os.path.isabs(requested_path) else "PATH_TRAVERSAL_DENIED"
            raise WorkspaceError(code, "path is outside the workspace")
        resolved = os.path.realpath(candidate)
        if not self._is_under_root(os.path.normcase(resolved), root_compare):
            raise WorkspaceError("PATH_OUTSIDE_WORKSPACE", "resolved path escapes the workspace")
        return resolved

    def relative_path(self, absolute_path: str) -> str:
        return os.path.relpath(absolute_path, self.root).replace(os.sep, "/")

    def is_ignored_name(self, name: str) -> bool:
        return name in self.ignored_directories

    @staticmethod
    def _is_under_root(candidate: str, root: str) -> bool:
        return candidate == root or candidate.startswith(root + os.sep)


class ShadowWorkspace(metaclass=ABCMeta):
    """Future write-isolation boundary only; no implementation belongs in this prototype."""

    @abstractmethod
    def prepare(self) -> None:
        """Prepare a future shadow workspace without modifying the source workspace."""

    @abstractmethod
    def apply(self) -> None:
        """Apply a future reviewed change set."""

    @abstractmethod
    def discard(self) -> None:
        """Discard a future shadow workspace."""
