"""SQLite audit storage for formal Phase 2."""

from .event_store import EventStore, EventStoreError

__all__ = ["EventStore", "EventStoreError"]
