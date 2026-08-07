#!/usr/bin/env python3
"""Mock D-013 helper for LOCAL harness logic tests (macOS/Linux only).

It is NOT a Win7 artifact: it fakes the JSON-over-stdio protocol so the
acceptance harness assertion/classification logic can be exercised without a
Windows helper binary.

Behavior:
  - Reads one JSON request line from stdin.
  - Looks up "requestId" in D013_MOCK_FIXTURES (JSON map requestId->response).
  - Prints the canned response line; if absent, prints a generic completed
    response. The received request is appended to D013_MOCK_LOG (JSON array).
"""
import json
import os
import sys

fixtures_path = os.environ.get("D013_MOCK_FIXTURES", "")
log_path = os.environ.get("D013_MOCK_LOG", "")

fixtures = {}
if fixtures_path and os.path.exists(fixtures_path):
    with open(fixtures_path, "r", encoding="utf-8") as stream:
        fixtures = json.load(stream)

line = sys.stdin.readline()
if not line:
    sys.exit(0)

try:
    request = json.loads(line)
except ValueError:
    print(json.dumps({"schema_version": 1, "type": "error", "error": "JSON_PARSE_FAILED",
                      "message": "mock: cannot parse request"}))
    sys.exit(0)

if log_path:
    entries = []
    if os.path.exists(log_path):
        with open(log_path, "r", encoding="utf-8") as stream:
            entries = json.load(stream)
    entries.append(request)
    with open(log_path, "w", encoding="utf-8") as stream:
        json.dump(entries, stream, ensure_ascii=False)

request_id = request.get("requestId", "")
if request_id in fixtures:
    response = fixtures[request_id]
else:
    response = {
        "schema_version": 1, "type": "execution_result", "requestId": request_id,
        "status": "completed", "exitCode": 0, "executionTimeMs": 1,
        "timedOut": False, "canceled": False, "outputTruncated": False,
        "containmentVerified": True, "inputDetached": True,
        "stdoutSize": 0, "stderrSize": 0, "stdoutBase64": "", "stderrBase64": "",
        "aclChanges": [],
    }
print(json.dumps(response, ensure_ascii=False))
sys.exit(0)
