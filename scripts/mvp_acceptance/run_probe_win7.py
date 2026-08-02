"""Run the Phase 1 capability probe from the Win7 acceptance tree."""
import os
import sys

MVP_ID = "MVP-20260802-07"
for argument in sys.argv[1:]:
    if argument.startswith("--mvp-id="):
        MVP_ID = argument.split("=", 1)[1] or MVP_ID

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "src", "phase1-2"))
# Use the controlled acceptance Git only for this process; do not change the
# machine PATH or the Bitvise/SSH service configuration.
os.environ["PATH"] = r"C:\acceptance\mvp_mingit\cmd;" + os.environ.get("PATH", "")
from win7_agent.probe.__main__ import main

out = os.path.join(ROOT, "phase1_probe_" + MVP_ID + ".json")
db = os.path.join(ROOT, "phase1_probe_" + MVP_ID + ".sqlite3")
sys.exit(main(["--out", out, "--db", db, "--timeout-scale", "0.5"]))
