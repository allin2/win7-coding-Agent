"""ASCII-only console helpers."""

from typing import Any


def ascii_safe(value: Any) -> str:
    """Return a representation that can be written to a CP936 console."""
    return str(value).encode("ascii", "backslashreplace").decode("ascii")


def console_line(text: str) -> None:
    """Print one ASCII-only line without terminal control sequences."""
    print(ascii_safe(text))
