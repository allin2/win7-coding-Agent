"""Entry point for the offline formal read-only analysis demo."""

import argparse
import os
import sys
import tempfile

from win7_agent.models import MockProvider, ProviderError, ReplayProvider
from win7_agent.runtime.runner import AgentRunner
from win7_agent.storage import EventStore, EventStoreError


class Parser(argparse.ArgumentParser):
    def error(self, message):
        self.exit(3, "ERROR argument: {0}\n".format(message).encode("ascii", "backslashreplace").decode("ascii"))


def main(argv=None):
    parser = Parser()
    sub = parser.add_subparsers(dest="command")
    analyze = sub.add_parser("analyze")
    analyze.add_argument("--workspace", required=True)
    analyze.add_argument("--task", required=True)
    analyze.add_argument("--provider", choices=["mock", "replay"], default="mock")
    analyze.add_argument("--events")
    analyze.add_argument("--replay-from")
    analyze.add_argument("--max-turns", type=int, default=8)
    analyze.add_argument("--max-tool-calls", type=int, default=32)
    try:
        args = parser.parse_args(argv)
    except SystemExit as error:
        return int(error.code)
    if args.command != "analyze" or args.max_turns < 1 or args.max_tool_calls < 1:
        parser.error("analyze and positive limits are required")
    if args.provider == "replay" and not args.replay_from:
        sys.stderr.write("ERROR setup: replay provider requires --replay-from\n")
        return 3
    path = args.events or os.path.join(tempfile.gettempdir(), "win7_agent_events.sqlite")
    try:
        provider = MockProvider() if args.provider == "mock" else ReplayProvider(args.replay_from)
        store = EventStore(path)
    except (ProviderError, EventStoreError) as error:
        sys.stderr.write("ERROR setup: {0}\n".format(str(error).encode("ascii", "backslashreplace").decode("ascii")))
        return 3
    result = AgentRunner(args.workspace, provider, store, args.max_turns, args.max_tool_calls).run(args.task)
    store.close()
    if result is None:
        return 3
    sys.stdout.write("RESULT status={0} trace_complete={1} turns={2} tool_calls={3}\n".format(
        result.status, str(result.trace_complete).lower(), result.turns, result.tool_calls))
    return {"COMPLETED": 0, "CANCELLED": 2}.get(result.status, 1)


if __name__ == "__main__":
    sys.exit(main())
