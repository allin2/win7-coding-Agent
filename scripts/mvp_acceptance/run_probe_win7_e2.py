"""Run the Phase 1 probe in the E2 Chinese/space-path, Git-absent profile."""
import os
import sys

MVP_ID = "MVP-20260802-12"
for argument in sys.argv[1:]:
    if argument.startswith("--mvp-id="):
        MVP_ID = argument.split("=", 1)[1] or MVP_ID

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
source_root = os.path.join(ROOT, "src", "phase1-2")
if not os.path.isdir(source_root):
    # The E2 deployment is intentionally flatter so the acceptance path
    # itself contains the Chinese/space segment without an extra build tree.
    source_root = os.path.join(ROOT, "phase1-2")
sys.path.insert(0, source_root)
# Preserve only Win7 system locations.  The interpreter is invoked by its
# absolute path, so this process-level PATH simulates Git not being installed
# without changing the machine PATH or the SSH service environment.
os.environ["PATH"] = r"C:\\Windows\\System32;C:\\Windows;C:\\Windows\\System32\\Wbem"

from win7_agent.probe.__main__ import main

out = os.path.join(ROOT, "phase1_probe_" + MVP_ID + "_e2.json")
db = os.path.join(ROOT, "phase1_probe_" + MVP_ID + "_e2.sqlite3")
sys.exit(main(["--out", out, "--db", db, "--timeout-scale", "0.5"]))
