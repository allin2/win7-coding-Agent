"""Win7-only A4 helper acceptance harness (CPython 3.8 stdlib)."""

import argparse
import csv
import hashlib
import json
import os
import platform
import queue
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from datetime import datetime


def utc_now():
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run_sync(command, args):
    started = time.time()
    try:
        completed = subprocess.run(
            [command] + list(args), stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, timeout=15, universal_newlines=True,
            encoding="utf-8", errors="replace", shell=False)
        return {
            "command": command, "args": list(args),
            "exit_code": completed.returncode,
            "stdout": completed.stdout, "stderr": completed.stderr,
            "elapsed_ms": int((time.time() - started) * 1000),
            "error": None,
        }
    except Exception as error:
        return {
            "command": command, "args": list(args), "exit_code": None,
            "stdout": "", "stderr": "",
            "elapsed_ms": int((time.time() - started) * 1000),
            "error": "%s: %s" % (type(error).__name__, error),
        }


def snapshot_processes():
    command = [
        os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "System32", "wbem", "wmic.exe"),
        "process", "get", "Name,ProcessId,ParentProcessId,CommandLine,WorkingSetSize", "/format:csv",
    ]
    completed = subprocess.run(
        command, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        timeout=15, universal_newlines=True, encoding="mbcs",
        errors="replace", shell=False)
    rows = []
    lines = [line for line in completed.stdout.splitlines() if line.strip()]
    if completed.returncode == 0 and lines:
        for row in csv.DictReader(lines):
            try:
                rows.append({
                    "name": row.get("Name", ""),
                    "pid": int(row.get("ProcessId", "0") or 0),
                    "parent_pid": int(row.get("ParentProcessId", "0") or 0),
                    "command_line": row.get("CommandLine", ""),
                    "working_set_bytes": int(row.get("WorkingSetSize", "0") or 0),
                })
            except ValueError:
                continue
    return {
        "exit_code": completed.returncode,
        "stderr": completed.stderr,
        "rows": rows,
    }


def descendants(snapshot, root_pid, baseline_pids=None):
    selected = []
    baseline_pids = baseline_pids or set()
    parent_ids = {root_pid}
    changed = True
    while changed:
        changed = False
        for row in snapshot["rows"]:
            if (row["pid"] not in parent_ids and row["pid"] not in baseline_pids and
                    row["parent_pid"] in parent_ids):
                parent_ids.add(row["pid"])
                selected.append(row)
                changed = True
    return selected


class HelperClient:
    def __init__(self, helper):
        self.process = subprocess.Popen(
            [helper], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, universal_newlines=True, encoding="utf-8",
            errors="strict", bufsize=1, shell=False)
        self.responses = queue.Queue()
        self.stderr_lines = []
        self.stdout_thread = threading.Thread(target=self._read_stdout)
        self.stderr_thread = threading.Thread(target=self._read_stderr)
        self.stdout_thread.daemon = True
        self.stderr_thread.daemon = True
        self.stdout_thread.start()
        self.stderr_thread.start()

    def _read_stdout(self):
        for line in self.process.stdout:
            line = line.rstrip("\r\n")
            if line:
                try:
                    self.responses.put(json.loads(line))
                except Exception as error:
                    self.responses.put({"type": "invalid_json", "line": line, "error": str(error)})

    def _read_stderr(self):
        for line in self.process.stderr:
            self.stderr_lines.append(line.rstrip("\r\n"))

    def send(self, request):
        self.process.stdin.write(json.dumps(request, ensure_ascii=False) + "\n")
        self.process.stdin.flush()

    def next(self, timeout=15):
        return self.responses.get(timeout=timeout)

    def request(self, request, timeout=15):
        self.send(request)
        return self.next(timeout)

    def close(self):
        if self.process.poll() is None:
            self.process.stdin.close()
            try:
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.process.terminate()
                self.process.wait(timeout=5)
        return {"exit_code": self.process.returncode, "stderr": self.stderr_lines}


def case(case_id, passed, expected, actual, **extra):
    record = {
        "id": case_id, "status": "PASS" if passed else "FAIL",
        "expected": expected, "actual": actual,
    }
    record.update(extra)
    return record


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--acceptance-id", required=True)
    parser.add_argument("--helper", required=True)
    parser.add_argument("--fault-helper")
    parser.add_argument("--out", required=True)
    parser.add_argument("--keep", action="store_true")
    args = parser.parse_args()

    record = {
        "schema_version": 1,
        "acceptance_id": args.acceptance_id,
        "suite": "A4_EXECUTION_BETA_HELPER_WIN7_PYTHON",
        "captured_at": utc_now(),
        "host": {
            "platform": sys.platform, "architecture": platform.machine(),
            "release": platform.release(), "version": platform.version(),
            "python": sys.version,
        },
        "artifact": {"path": os.path.abspath(args.helper), "sha256": sha256(args.helper)},
        "cases": [],
        "taskkill_used": False,
    }
    cases = record["cases"]
    work_root = tempfile.mkdtemp(prefix="a4-win7-")
    cjk_root = os.path.join(work_root, "中文 acceptance path")
    os.makedirs(cjk_root)
    system32 = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "System32")
    cmd = os.path.join(system32, "cmd.exe")
    where = os.path.join(system32, "where.exe")
    ping = os.path.join(system32, "ping.exe")

    def write_script(name, body):
        path = os.path.join(cjk_root, name)
        with open(path, "w", encoding="utf-8", newline="") as stream:
            stream.write(body.replace("\n", "\r\n"))
        return path

    echo_script = write_script("echo.cmd", "@echo off\necho A4-CJK-PATH-OK\n")
    flood_script = write_script("flood.cmd", "@echo off\nfor /l %%i in (1,1,100000) do @echo 1234567890\n")
    tree_script = write_script(
        "tree.cmd",
        '@echo off\nstart "" /b "%ComSpec%" /d /s /c "title A4-TREE-CHILD & ping 127.0.0.1 -n 60 >nul"\nping 127.0.0.1 -n 60 >nul\n')
    memory_script = write_script(
        "memory.cmd",
        "@echo off\nfor /l %%i in (1,1,4) do (\n"
        "  for /l %%j in (1,1,500) do @echo A4-MEMORY-SAMPLE\n"
        "  ping 127.0.0.1 -n 2 >nul\n"
        ")\n")

    version_result = run_sync(args.helper, ["--version"])
    cases.append(case("C01-version", version_result["exit_code"] == 0 and "win7-x64" in version_result["stdout"],
                      "helper loads and identifies Win7 x64", version_result))
    help_result = run_sync(args.helper, ["--help"])
    cases.append(case("C02-help", help_result["exit_code"] == 0 and "stdin" in help_result["stdout"],
                      "helper help is side-effect free", help_result))

    missing = os.path.join(work_root, "missing-helper.exe")
    missing_result = run_sync(missing, ["--version"])
    cases.append(case("N01-helper-missing", missing_result["error"] is not None,
                      "missing helper fails before execution", missing_result))
    damaged = os.path.join(work_root, "damaged-helper.exe")
    with open(damaged, "wb") as stream:
        stream.write(b"not-a-pe")
    damaged_result = run_sync(damaged, ["--version"])
    cases.append(case("N02-helper-damaged", damaged_result["error"] is not None,
                      "damaged helper fails before execution", damaged_result))

    if args.fault_helper:
        fault_baseline = snapshot_processes()
        fault_baseline_pids = {row["pid"] for row in fault_baseline["rows"]}
        fault_client = HelperClient(args.fault_helper)
        try:
            fault_result = fault_client.request({
                "requestId": "fault-job-create", "executable": where,
                "argv": ["cmd.exe"], "workingDirectory": cjk_root})
        finally:
            fault_close = fault_client.close()
        fault_snapshot = snapshot_processes()
        fault_descendants = descendants(fault_snapshot, fault_client.process.pid, fault_baseline_pids)
        cases.append(case("N04-forced-job-create-failure",
                          fault_result.get("error") == "JOB_CREATE_FAILED" and
                          not fault_result.get("containmentVerified") and not fault_descendants,
                          "forced CreateJobObject failure refuses before child execution",
                          fault_result, helper_sha256=sha256(args.fault_helper),
                          helper_close=fault_close, residual_descendants=fault_descendants))

    process_baseline = snapshot_processes()
    baseline_pids = {row["pid"] for row in process_baseline["rows"]}
    record["process_baseline"] = {
        "exit_code": process_baseline["exit_code"],
        "pid_count": len(baseline_pids),
        "stderr": process_baseline["stderr"],
    }
    client = HelperClient(args.helper)
    try:
        unknown = client.request({
            "requestId": "unknown-command", "executable": os.path.join(system32, "powershell.exe"),
            "argv": ["-NoProfile"], "workingDirectory": cjk_root})
        cases.append(case("N03-unknown-command", unknown.get("error") == "ARGV_REJECTED",
                          "unknown command is rejected", unknown))

        structured = client.request({
            "requestId": "structured-argv", "executable": where,
            "argv": ["cmd.exe"], "workingDirectory": cjk_root})
        cases.append(case("C03-structured-argv",
                          structured.get("status") == "completed" and structured.get("containmentVerified") and structured.get("inputDetached"),
                          "structured argv runs in verified Job with detached stdin", structured))

        cjk = client.request({
            "requestId": "cjk-space", "executable": cmd,
            "argv": ["/d", "/s", "/c", echo_script], "workingDirectory": cjk_root})
        cases.append(case("C04-cjk-space-path",
                          cjk.get("status") == "completed" and cjk.get("containmentVerified"),
                          "Chinese and space path completes", cjk))

        flood = client.request({
            "requestId": "output-limit", "executable": cmd,
            "argv": ["/d", "/s", "/c", flood_script], "workingDirectory": cjk_root,
            "maxOutputSize": 256, "timeoutMs": 5000})
        cases.append(case("C05-output-limit",
                          flood.get("status") == "output_limit" and flood.get("outputTruncated") and flood.get("containmentVerified"),
                          "output flood is bounded and Job-terminated", flood))

        client.send({
            "requestId": "timeout-tree", "executable": cmd,
            "argv": ["/d", "/s", "/c", tree_script], "workingDirectory": cjk_root,
            "timeoutMs": 1200, "maxOutputSize": 4096})
        time.sleep(0.4)
        before_timeout = snapshot_processes()
        timeout_descendants = descendants(before_timeout, client.process.pid, baseline_pids)
        timeout_result = client.next(15)
        time.sleep(0.5)
        after_timeout = snapshot_processes()
        after_timeout_pids = {row["pid"] for row in after_timeout["rows"]}
        timeout_residual = [row for row in timeout_descendants if row["pid"] in after_timeout_pids]
        cases.append(case("C06-timeout-process-tree",
                          timeout_result.get("status") == "timed_out" and timeout_result.get("containmentVerified") and not timeout_residual,
                          "timeout kills every captured descendant PID", timeout_result,
                          descendants_before=timeout_descendants, residual_after=timeout_residual))

        client.send({
            "requestId": "cancel-tree", "executable": cmd,
            "argv": ["/d", "/s", "/c", tree_script], "workingDirectory": cjk_root,
            "timeoutMs": 10000, "maxOutputSize": 4096})
        time.sleep(0.4)
        before_cancel = snapshot_processes()
        cancel_descendants = descendants(before_cancel, client.process.pid, baseline_pids)
        client.send({"op": "cancel", "requestId": "cancel-tree"})
        cancel_ack = client.next(15)
        cancel_result = client.next(15)
        time.sleep(0.5)
        after_cancel = snapshot_processes()
        after_cancel_pids = {row["pid"] for row in after_cancel["rows"]}
        cancel_residual = [row for row in cancel_descendants if row["pid"] in after_cancel_pids]
        cases.append(case("C07-explicit-cancel",
                          cancel_ack.get("status") == "cancel_requested" and cancel_result.get("status") == "canceled" and cancel_result.get("containmentVerified") and not cancel_residual,
                          "cancel acknowledgement and Job tree cleanup", cancel_result,
                          cancel_ack=cancel_ack, descendants_before=cancel_descendants,
                          residual_after=cancel_residual))

        client.send({
            "requestId": "busy-primary", "executable": ping,
            "argv": ["127.0.0.1", "-n", "60"], "workingDirectory": cjk_root,
            "timeoutMs": 10000, "maxOutputSize": 4096})
        time.sleep(0.1)
        client.send({
            "requestId": "busy-secondary", "executable": where,
            "argv": ["cmd.exe"], "workingDirectory": cjk_root})
        busy = client.next(15)
        client.send({"op": "cancel", "requestId": "busy-primary"})
        busy_cancel_ack = client.next(15)
        busy_primary = client.next(15)
        cases.append(case("C08-concurrency-limit",
                          busy.get("error") == "HELPER_BUSY" and busy_cancel_ack.get("status") == "cancel_requested" and busy_primary.get("status") == "canceled",
                          "second run is rejected while one request is active", busy,
                          cancel_ack=busy_cancel_ack, primary_result=busy_primary))

        client.send({
            "requestId": "memory-budget", "executable": cmd,
            "argv": ["/d", "/s", "/c", memory_script], "workingDirectory": cjk_root,
            "timeoutMs": 10000, "maxOutputSize": 1024 * 1024})
        memory_samples = []
        for _ in range(6):
            time.sleep(0.35)
            memory_snapshot = snapshot_processes()
            helper_rows = [row for row in memory_snapshot["rows"] if row["pid"] == client.process.pid]
            managed_rows = descendants(memory_snapshot, client.process.pid, baseline_pids)
            measured_rows = helper_rows + managed_rows
            memory_samples.append({
                "captured_at": utc_now(),
                "working_set_bytes": sum(row["working_set_bytes"] for row in measured_rows),
                "processes": measured_rows,
            })
        memory_result = client.next(15)
        peak_memory = max(sample["working_set_bytes"] for sample in memory_samples)
        cases.append(case("C09-runner-memory-budget",
                          memory_result.get("status") == "completed" and memory_result.get("containmentVerified") and peak_memory <= 60 * 1024 * 1024,
                          "helper plus managed tree peak Working Set is within performance budget #4 Go threshold",
                          memory_result, peak_working_set_bytes=peak_memory,
                          go_threshold_bytes=60 * 1024 * 1024, samples=memory_samples))
    finally:
        record["helper_close"] = client.close()

    final_snapshot = snapshot_processes()
    final_descendants = descendants(final_snapshot, client.process.pid, baseline_pids)
    cases.append(case("C10-no-residual-descendants", not final_descendants,
                      "helper exit leaves no captured descendant process", final_descendants))
    record["final_process_snapshot"] = {
        "exit_code": final_snapshot["exit_code"],
        "stderr": final_snapshot["stderr"],
        "relevant": final_descendants,
    }
    record["status"] = "PARTIAL" if all(item["status"] == "PASS" for item in cases) else "FAIL"
    record["formal_win7_validation"] = record["status"]
    record["not_performed"] = [
        {"id": "N05-host-already-in-job", "status": "EXTERNAL_EVIDENCE", "evidence": "A4-20260805-14-harness.json"},
    ]
    if not args.fault_helper:
        record["not_performed"].append(
            {"id": "N04-forced-job-create-failure", "status": "NOT_PERFORMED", "reason": "fault helper was not supplied"})
    record["finished_at"] = utc_now()
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8", newline="\n") as stream:
        json.dump(record, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
    print(json.dumps(record, ensure_ascii=False, indent=2))
    if not args.keep:
        shutil.rmtree(work_root, ignore_errors=True)
    return 0 if record["status"] == "PARTIAL" else 1


if __name__ == "__main__":
    sys.exit(main())
