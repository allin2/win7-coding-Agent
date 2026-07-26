"""Entrypoint for ``python -m win7_agent.cli analyze``."""

import argparse
import os
import sys
import tempfile

from win7_agent.models import MockProvider, ReplayProvider
from win7_agent.runtime import PrototypeRuntime, RunStatus
from win7_agent.storage import EventStore, EventStoreError
from win7_agent.workspace import WorkspaceContext, WorkspaceError


def _ascii(value: str) -> str:
    return value.encode("ascii", "backslashreplace").decode("ascii")


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m win7_agent.cli")
    subcommands = parser.add_subparsers(dest="command")
    analyze = subcommands.add_parser("analyze")
    analyze.add_argument("--workspace", required=True)
    analyze.add_argument("--task", required=True)
    analyze.add_argument("--max-turns", type=int, default=8)
    analyze.add_argument("--max-tool-calls", type=int, default=16)
    analyze.add_argument("--event-db")
    analyze.add_argument("--replay")
    return parser


def main(argv=None) -> int:
    parser = _parser()
    arguments = parser.parse_args(argv)
    if arguments.command != "analyze":
        parser.print_usage()
        return 3
    if arguments.max_turns < 1 or arguments.max_tool_calls < 1:
        parser.error("--max-turns and --max-tool-calls must be positive")
    try:
        workspace = WorkspaceContext(arguments.workspace)
        event_db = arguments.event_db or os.path.join(tempfile.mkdtemp(prefix="w7a_proto_"), "events.sqlite")
        provider = ReplayProvider.from_event_db(arguments.replay) if arguments.replay else MockProvider()
        store = EventStore(event_db)
        try:
            result = PrototypeRuntime(workspace, arguments.task, provider, store, arguments.max_turns, arguments.max_tool_calls).run()
        finally:
            store.close()
    except (WorkspaceError, EventStoreError, OSError) as error:
        print("ERROR {0}".format(_ascii(str(error))), file=sys.stderr)
        return 3
    print("RESULT status={0} turns={1} tool_calls={2} event_db={3}".format(result.status.value, result.turns, result.tool_calls, _ascii(event_db)))
    if result.status == RunStatus.COMPLETED:
        return 0
    if result.status == RunStatus.CANCELLED:
        return 2
    return 1


if __name__ == "__main__":
    sys.exit(main())
