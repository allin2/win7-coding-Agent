"""Compile only bounded task and instruction context for one model request."""

from win7_agent.models import Message, ModelRequest


MAX_INSTRUCTION_BYTES = 4096


def _truncate_utf8(value, limit):
    data = value.encode("utf-8")[:limit]
    return data.decode("utf-8", errors="ignore")


def compile_request(task, tools, turn, instructions="", recent_results=None):
    messages = []
    if instructions:
        messages.append(Message("system", _truncate_utf8(instructions, MAX_INSTRUCTION_BYTES)))
    messages.append(Message("user", task))
    for result in list(recent_results or [])[-4:]:
        messages.append(Message("tool", _truncate_utf8(result, MAX_INSTRUCTION_BYTES)))
    return ModelRequest(messages, list(tools), turn)
