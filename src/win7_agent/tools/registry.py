"""Tool registration and frozen-schema argument validation."""

from typing import Callable, Dict, Tuple

from .contracts import ToolSpec


class ToolRegistry:
    def __init__(self) -> None:
        self._entries = {}  # type: Dict[str, Tuple[ToolSpec, Callable]]

    def register(self, spec: ToolSpec, implementation: Callable) -> None:
        if spec.name in self._entries:
            raise ValueError("duplicate tool registration: {0}".format(spec.name))
        self._entries[spec.name] = (spec, implementation)

    def lookup(self, name: str):
        return self._entries.get(name)

    def specs(self):
        return [entry[0] for entry in self._entries.values()]

    @staticmethod
    def validate(spec: ToolSpec, arguments: Dict) -> str:
        if not isinstance(arguments, dict):
            return "arguments must be an object"
        unknown = set(arguments.keys()) - set(spec.parameters.keys())
        if unknown:
            return "unknown parameter: {0}".format(sorted(unknown)[0])
        for name, rule in spec.parameters.items():
            if rule.get("required") and name not in arguments:
                return "missing required parameter: {0}".format(name)
            if name in arguments:
                expected_type = rule.get("type", object)
                value = arguments[name]
                if expected_type is int and isinstance(value, bool):
                    return "invalid type for parameter: {0}".format(name)
                if not isinstance(value, expected_type):
                    return "invalid type for parameter: {0}".format(name)
        return ""
