"""F45 context compilation equivalence tests."""

from __future__ import print_function

import unittest

from win7_agent.context import compile_request


class CompilerTests(unittest.TestCase):
    def test_f45_context_keeps_task_tools_and_utf8_bounded_recent_observations(self):
        request = compile_request(
            "inspect", [{"name": "read_file"}], 2,
            instructions="x" * 5000, recent_results=["first", "second"])
        self.assertEqual(2, request.turn)
        self.assertEqual([{"name": "read_file"}], request.tools)
        self.assertEqual(["system", "user", "tool", "tool"],
                         [message.role for message in request.messages])
        self.assertEqual(4096, len(request.messages[0].content.encode("utf-8")))
