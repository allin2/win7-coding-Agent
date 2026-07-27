"""Entrypoint for ``python -m win7_agent.cli analyze``."""

import argparse
import os
import sys
import tempfile

from win7_agent.models import MockProvider, ProviderError, ReplayProvider
from win7_agent.runtime import PrototypeRuntime, RunStatus
from win7_agent.storage import EventStore, EventStoreError
from win7_agent.workspace import WorkspaceContext, WorkspaceError


class CliArgumentError(Exception):
    pass


class PrototypeArgumentParser(argparse.ArgumentParser):
    def error(self, message):
        self.print_usage(sys.stderr)
        self._print_message("{0}: error: {1}\n".format(self.prog, message), sys.stderr)
        raise CliArgumentError(message)


def _ascii(value: str) -> str:
    return value.encode("ascii", "backslashreplace").decode("ascii")


def _parser() -> argparse.ArgumentParser:
    parser = PrototypeArgumentParser(prog="python -m win7_agent.cli")
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
    try:
        arguments = parser.parse_args(argv)
    except CliArgumentError:
        return 3
    except SystemExit as error:
        return 0 if error.code == 0 else 3
    if arguments.command != "analyze":
        parser.print_usage()
        return 3
    if arguments.max_turns < 1 or arguments.max_tool_calls < 1:
        try:
            parser.error("--max-turns and --max-tool-calls must be positive")
        except CliArgumentError:
            return 3
    try:
        workspace = WorkspaceContext(arguments.workspace)
        event_db = arguments.event_db or os.path.join(tempfile.mkdtemp(prefix="w7a_proto_"), "events.sqlite")
        event_path = os.path.realpath(event_db)
        if event_path == workspace.root or event_path.startswith(workspace.root + os.sep):
            print("NOTE event-db is inside the target workspace")
        provider = ReplayProvider.from_event_db(arguments.replay) if arguments.replay else MockProvider()
        store = EventStore(event_db)
        try:
            result = PrototypeRuntime(workspace, arguments.task, provider, store, arguments.max_turns, arguments.max_tool_calls).run()
            try:
                _, events = store.load_run(result.run_id)
            except EventStoreError:
                events = []
        finally:
            store.close()
    except (ProviderError, WorkspaceError, EventStoreError, OSError) as error:
        print("ERROR {0}".format(_ascii(str(error))), file=sys.stderr)
        return 3
    for event in events:
        print(_event_summary(event))
    print("RESULT status={0} turns={1} tool_calls={2} event_db={3}".format(result.status.value, result.turns, result.tool_calls, _ascii(event_db)))
    if result.status == RunStatus.COMPLETED:
        return 0
    if result.status == RunStatus.CANCELLED:
        return 2
    return 1


def _event_summary(event):
    payload = event["payload"]
    details = []
    if event["event_type"] in ("state.transition", "state.transition_rejected"):
        details.append("from={0}".format(payload.get("from", "")))
        details.append("to={0}".format(payload.get("to", "")))
    elif event["event_type"] in ("tool.requested", "tool.result", "tool.denied"):
        details.append("tool={0}".format(payload.get("tool_name", "")))
    elif event["event_type"] == "policy.decision":
        details.append("decision={0}".format(payload.get("decision", "")))
    return "EVENT seq={0} type={1}{2}".format(event["seq"], event["event_type"], " " + " ".join(_ascii(item) for item in details) if details else "")


if __name__ == "__main__":
    sys.exit(main())
