#!/usr/bin/env python3
"""Check the acceptance workspace edit before emitting the verification marker."""
import os
import sys


def main():
    target = os.path.join(os.getcwd(), "calc.ts")
    if not os.path.isfile(target):
        print("verification-target-missing", file=sys.stderr)
        return 2
    with open(target, "r", encoding="utf-8") as stream:
        content = stream.read()
    if "return a + b" not in content:
        print("verification-edit-missing", file=sys.stderr)
        return 1
    print("projection-verified" if "// verified after older failure" in content else "smoke-verified")
    return 0


if __name__ == "__main__":
    sys.exit(main())
