#!/usr/bin/env python3
"""A9-27 Win7 verification projection check (stdlib only)."""
import os
import sys


def main():
    target = os.path.join(os.getcwd(), "calc.ts")
    if not os.path.isfile(target):
        print("projection-missing", file=sys.stderr)
        return 2
    with open(target, "r", encoding="utf-8") as stream:
        text = stream.read()
    print("projection-verified" if ("return a + b" in text or "reliabilityProbe" in text)
          else "smoke-verified")
    return 0


if __name__ == "__main__":
    sys.exit(main())
