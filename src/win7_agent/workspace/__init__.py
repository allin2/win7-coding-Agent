"""Read-only workspace boundary enforcement for the prototype."""

from .context import ShadowWorkspace, WorkspaceContext, WorkspaceError

__all__ = ["ShadowWorkspace", "WorkspaceContext", "WorkspaceError"]
