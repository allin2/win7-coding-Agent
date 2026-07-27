"""Tool registration and strict pre-execution argument validation."""

from __future__ import print_function

from typing import Callable, Dict, Tuple


class ToolRegistry(object):
    def __init__(self):
        self._entries = {}  # type: Dict[str, Tuple[object, Callable]]

    def register(self, spec, implementation):
        if spec.name in self._entries:
            raise ValueError("duplicate tool registration: {0}".format(spec.name))
        self._entries[spec.name] = (spec, implementation)

    def lookup(self, name):
        return self._entries.get(name)

    def specs(self):
        return [self._entries[name][0] for name in sorted(self._entries)]

    @staticmethod
    def validate(spec, arguments):
        if not isinstance(arguments, dict):
            return "arguments must be an object"
        unknown = set(arguments) - set(spec.parameters)
        if unknown:
            return "unknown parameter: {0}".format(sorted(unknown)[0])
        for name, rule in spec.parameters.items():
            if rule.get("required") and name not in arguments:
                return "missing required parameter: {0}".format(name)
            if name not in arguments:
                continue
            value = arguments[name]
            expected = rule["type"]
            if expected is int and isinstance(value, bool):
                return "invalid type for parameter: {0}".format(name)
            if not isinstance(value, expected):
                return "invalid type for parameter: {0}".format(name)
        return ""
