"""A5 T05 formal Win7 harness for the D-013 v21 one-request helper.

This process is launched through Win32_Process.Create, outside Electron's
Chromium Job. It never uses taskkill and writes only below the signed per-run
acceptance root.
"""

from __future__ import print_function

import argparse
import json
import os
import subprocess
import sys
import time


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--acceptance-id", required=True)
    parser.add_argument("--helper", required=True)
    parser.add_argument("--acceptance-root", required=True)
    parser.add_argument("--per-run-root", required=True)
    parser.add_argument("--lease-id", required=True)
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--package-manifest-sha256", required=True)
    parser.add_argument("--out", required=True)
    return parser.parse_args()


def run_helper(helper, request):
    process = subprocess.Popen(
        [helper], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, shell=False)
    request_bytes = (json.dumps(request, ensure_ascii=False) + "\n").encode("utf-8")
    stdout_bytes, stderr_bytes = process.communicate(request_bytes, timeout=30)
    stdout_text = stdout_bytes.decode("utf-8", errors="strict").strip()
    stderr_text = stderr_bytes.decode("utf-8", errors="replace")
    if not stdout_text:
        return {"type": "error", "requestId": request["requestId"],
                "error": "EMPTY_HELPER_RESPONSE", "stderr": stderr_text,
                "helperExitCode": process.returncode}
    lines = [line for line in stdout_text.splitlines() if line.strip()]
    response = json.loads(lines[-1])
    response["helperExitCode"] = process.returncode
    response["helperStderr"] = stderr_text
    return response


def ping_residue():
    result = subprocess.run(
        ["tasklist.exe", "/FI", "IMAGENAME eq ping.exe", "/FO", "CSV", "/NH"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=False, timeout=15)
    stdout = result.stdout.decode("mbcs", errors="replace")
    stderr = result.stderr.decode("mbcs", errors="replace")
    return {
        "exitCode": result.returncode,
        "stdout": stdout,
        "stderr": stderr,
        "present": "ping.exe" in (stdout + "\n" + stderr).lower(),
    }


def main():
    args = parse_args()
    if not args.acceptance_id.startswith("A5-"):
        raise ValueError("invalid A5 acceptance id")
    os.makedirs(args.per_run_root, exist_ok=True)
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    script_path = os.path.join(args.per_run_root, "t05-tree.cmd")
    with open(script_path, "w", encoding="utf-8", newline="") as stream:
        stream.write('@echo off\r\nstart "" /b ping.exe -n 60 127.0.0.1 > nul\r\nexit /b 0\r\n')

    windir = os.environ.get("WINDIR", r"C:\Windows")
    cmd = os.path.join(windir, "System32", "cmd.exe")
    request_id = "t05-" + args.acceptance_id
    request = {
        "requestId": request_id,
        "executable": cmd,
        "argv": ["/d", "/s", "/c", script_path],
        "workingDirectory": args.per_run_root,
        "timeoutMs": 15000,
        "maxOutputSize": 1048576,
        "allowNetwork": False,
        "allowedDirectories": [args.per_run_root],
        "protectedDirectories": [],
        "aclPolicy": {
            "acceptanceRoot": args.acceptance_root,
            "perRunRoot": args.per_run_root,
        },
    }
    response = run_helper(args.helper, request)
    time.sleep(2)
    residue = ping_residue()
    label = None
    for item in response.get("aclChanges", []):
        if item.get("mechanism") == "low_integrity_label":
            label = item
            break
    checks = [
        {"name": "d013-v21-response", "ok": response.get("type") == "execution_result" and response.get("status") == "completed"},
        {"name": "request-id-bound", "ok": response.get("requestId") == request_id},
        {"name": "containment-verified", "ok": response.get("containmentVerified") is True},
        {"name": "stdin-detached", "ok": response.get("inputDetached") is True},
        {"name": "not-timed-out", "ok": response.get("timedOut") is False},
        {"name": "helper-exit-zero", "ok": response.get("exitCode") == 0 and response.get("helperExitCode") == 0},
        {"name": "low-integrity-label-applied", "ok": bool(label and label.get("applied") is True and label.get("verified") is True)},
        {"name": "acl-label-rolled-back", "ok": bool(label and label.get("rolledBack") is True)},
        {"name": "ping-process-zero-residue", "ok": residue["exitCode"] == 0 and not residue["present"],
         "note": (residue["stdout"] + residue["stderr"])[:2048]},
    ]
    passed = all(item["ok"] is True for item in checks)
    case = {
        "id": "T05",
        "title": "会话回收（D-013 Job Object 进程树必杀）",
        "status": "PASS" if passed else "FAIL",
        "evidence_class": "WIN7",
        "detail": ("D-013 v21 后台 ping 进程树已由 Job 回收，零残留且 Low Integrity 标签已回滚。"
                   if passed else "T05 fail-closed: helper=%s, pingResidue=%s" %
                   (response.get("error", response.get("status", "unknown")), residue["present"])),
        "notes": "D013_V21_CONTAINMENT_CONFIRMED" if passed else "D013_V21_T05_FAILED",
        "subchecks": checks,
        "helper_response": response,
        "residue_probe": residue,
    }
    evidence = {
        "schema_version": 1,
        "acceptance_id": args.acceptance_id,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "mode": "win7-t05-only-python",
        "evidence_grade": "CANDIDATE_EVIDENCE",
        "lease_id": args.lease_id,
        "source_commit": args.source_commit,
        "package_manifest_sha256": args.package_manifest_sha256,
        "cases": [case],
        "counts": {case["status"]: 1},
        "win7_validation": "COORDINATOR_POSTFLIGHT_PENDING",
    }
    with open(args.out, "w", encoding="utf-8", newline="\n") as stream:
        json.dump(evidence, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
    print("A5_WIN7_RESULT_WRITTEN " + args.out)
    return 0 if passed else 2


if __name__ == "__main__":
    sys.exit(main())
