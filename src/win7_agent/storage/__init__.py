"""SQLite event persistence for prototype runs."""

from .event_store import EventStore, EventStoreError

__all__ = ["EventStore", "EventStoreError"]
