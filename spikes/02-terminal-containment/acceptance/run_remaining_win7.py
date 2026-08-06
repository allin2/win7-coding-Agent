"""Win7-only supplementary containment probes for C02/C03/C05.

This harness is acceptance-only. It does not change ACLs, network settings,
services, startup items, routes, firewall rules, or the management channel.
C05 intentionally measures loopback only and cannot produce a formal
no-network/enterprise-network conclusion.
"""

import argparse
import ctypes
import hashlib
import json
import os
import platform
import queue
import socket
import subprocess
import sys
import threading
import time


def utc_now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run_sync(command, args, timeout=20):
    started = time.time()
    try:
        completed = subprocess.run(
            [command] + list(args), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=timeout, universal_newlines=True, encoding="mbcs",
            errors="replace", shell=False)
        return {
            "command": command, "args": list(args),
            "exit_code": completed.returncode, "stdout": completed.stdout,
            "stderr": completed.stderr,
            "elapsed_ms": int((time.time() - started) * 1000), "error": None,
        }
    except Exception as error:
        return {
            "command": command, "args": list(args), "exit_code": None,
            "stdout": "", "stderr": "",
            "elapsed_ms": int((time.time() - started) * 1000),
            "error": "%s: %s" % (type(error).__name__, error),
        }


def helper_request(helper, request, timeout=30):
    started = time.time()
    process = subprocess.Popen(
        [helper], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, universal_newlines=True, encoding="utf-8",
        errors="replace", shell=False)
    responses = queue.Queue()

    def read_stdout():
        for line in process.stdout:
            if line.strip():
                responses.put(line.rstrip("\r\n"))

    reader = threading.Thread(target=read_stdout)
    reader.daemon = True
    reader.start()
    try:
        process.stdin.write(json.dumps(request, ensure_ascii=False) + "\n")
        process.stdin.flush()
        line = responses.get(timeout=timeout)
    except queue.Empty:
        process.kill()
        stdout, stderr = process.communicate()
        return {
            "transport": {"exit_code": process.returncode, "stdout": stdout,
                          "stderr": stderr, "timed_out": True},
            "response": None,
        }
    finally:
        if process.stdin and not process.stdin.closed:
            process.stdin.close()
    stdout, stderr = process.communicate(timeout=10)
    response = None
    invalid = []
    lines = [line] + [value for value in stdout.splitlines() if value.strip()]
    for line in lines:
        try:
            response = json.loads(line)
        except ValueError:
            invalid.append(line)
    return {
        "transport": {"exit_code": process.returncode, "stdout": stdout,
                      "stderr": stderr,
                      "elapsed_ms": int((time.time() - started) * 1000),
                      "timed_out": False},
        "response": response, "invalid_stdout_lines": invalid,
    }


def snapshot_processes():
    wmic = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "System32",
                        "wbem", "wmic.exe")
    result = run_sync(wmic, ["process", "get", "Name,ProcessId,ParentProcessId,CommandLine", "/format:csv"])
    return result


def case(case_id, status, expected, actual, **extra):
    result = {"id": case_id, "status": status, "expected": expected, "actual": actual}
    result.update(extra)
    return result


def assign_current_process_to_job():
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.CreateJobObjectW.argtypes = [ctypes.c_void_p, ctypes.c_wchar_p]
    kernel32.CreateJobObjectW.restype = ctypes.c_void_p
    kernel32.AssignProcessToJobObject.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
    kernel32.AssignProcessToJobObject.restype = ctypes.c_int
    kernel32.GetCurrentProcess.argtypes = []
    kernel32.GetCurrentProcess.restype = ctypes.c_void_p
    handle = kernel32.CreateJobObjectW(None, None)
    if not handle:
        return {"created": False, "assigned": False, "error": ctypes.get_last_error()}
    assigned = bool(kernel32.AssignProcessToJobObject(handle, kernel32.GetCurrentProcess()))
    return {"created": True, "assigned": assigned,
            "error": 0 if assigned else ctypes.get_last_error(), "handle": handle}


def start_loopback_servers():
    tcp = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    tcp.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    tcp.bind(("127.0.0.1", 0))
    tcp.listen(1)
    udp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    udp.bind(("127.0.0.1", 0))
    seen = {"tcp": False, "udp": False}

    def accept_tcp():
        try:
            tcp.settimeout(10)
            connection, _ = tcp.accept()
            connection.recv(32)
            connection.sendall(b"tcp-ok")
            seen["tcp"] = True
            connection.close()
        except Exception:
            pass

    def accept_udp():
        try:
            udp.settimeout(10)
            data, address = udp.recvfrom(32)
            if data == b"udp-probe":
                udp.sendto(b"udp-ok", address)
                seen["udp"] = True
        except Exception:
            pass

    threading.Thread(target=accept_tcp).start()
    threading.Thread(target=accept_udp).start()
    return tcp, udp, seen


def write_test_files(root, python_path, tcp_port, udp_port):
    c03_root = os.path.join(root, "c03-boundary")
    network_root = os.path.join(root, "c05-loopback")
    outside_root = os.path.join(root, "c03-outside")
    for directory in [c03_root, network_root, outside_root]:
        os.makedirs(directory)

    c03_script = os.path.join(c03_root, "c03-boundary.cmd")
    with open(c03_script, "w", encoding="utf-8", newline="") as stream:
        stream.write("@echo off\r\n")
        stream.write("echo inside>\"%~dp0inside-probe.txt\"\r\n")
        stream.write("echo outside>\"%~dp0..\\c03-outside\\outside-probe.txt\"\r\n")
        stream.write("reg.exe query HKLM\\SAM\\SAM >\"%~dp0protected-registry.txt\" 2>&1\r\n")
        stream.write("exit /b 0\r\n")

    network_probe = os.path.join(network_root, "network_probe.py")
    with open(network_probe, "w", encoding="utf-8", newline="\n") as stream:
        stream.write("import json, socket, sys\n")
        stream.write("tcp_port, udp_port, output = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]\n")
        stream.write("result = {'tcp': False, 'udp': False, 'dns_localhost': False}\n")
        stream.write("try:\n  s=socket.create_connection(('127.0.0.1', tcp_port), 5); s.sendall(b'tcp-probe'); result['tcp']=s.recv(32)==b'tcp-ok'; s.close()\n")
        stream.write("except Exception as e: result['tcp_error']=str(e)\n")
        stream.write("try:\n  s=socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.settimeout(5); s.sendto(b'udp-probe', ('127.0.0.1', udp_port)); result['udp']=s.recvfrom(32)[0]==b'udp-ok'; s.close()\n")
        stream.write("except Exception as e: result['udp_error']=str(e)\n")
        stream.write("try: result['dns_localhost']=socket.gethostbyname('localhost') == '127.0.0.1'\n")
        stream.write("except Exception as e: result['dns_error']=str(e)\n")
        stream.write("open(output, 'w').write(json.dumps(result))\n")

    network_script = os.path.join(network_root, "c05-loopback.cmd")
    network_result = os.path.join(network_root, "network-result.json")
    with open(network_script, "w", encoding="utf-8", newline="") as stream:
        stream.write("@echo off\r\n")
        stream.write('"%s" "%s" "%s" "%s" "%s"\r\n' % (
            python_path, network_probe, tcp_port, udp_port, network_result))
        stream.write("exit /b 0\r\n")
    return {
        "c03_root": c03_root, "c03_script": c03_script,
        "outside_root": outside_root, "network_root": network_root,
        "network_probe": network_probe, "network_script": network_script,
        "network_result": network_result,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--acceptance-id", required=True)
    parser.add_argument("--helper", required=True)
    parser.add_argument("--root", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    root = os.path.abspath(args.root)
    os.makedirs(root, exist_ok=True)
    system32 = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "System32")
    cmd = os.path.join(system32, "cmd.exe")
    record = {
        "schema_version": 1,
        "acceptance_id": args.acceptance_id,
        "suite": "SPIKE_02_REMAINING_C02_C03_C05_WIN7",
        "captured_at": utc_now(),
        "host": {"platform": sys.platform, "architecture": platform.machine(),
                 "release": platform.release(), "version": platform.version(),
                 "python": sys.version},
        "artifact": {"path": os.path.abspath(args.helper), "sha256": sha256(args.helper)},
        "cases": [], "taskkill_used": False,
        "scope": {"C05": "LOOPBACK_ONLY_NO_ENTERPRISE_NETWORK_CONCLUSION"},
    }
    cases = record["cases"]
    tcp, udp, seen = start_loopback_servers()
    files = write_test_files(root, sys.executable, tcp.getsockname()[1], udp.getsockname()[1])
    record["generated_files"] = {
        name: {"path": path, "sha256": sha256(path)}
        for name, path in files.items() if os.path.isfile(path)
    }
    try:
        c03 = helper_request(args.helper, {
            "requestId": "c03-restricted-boundary", "executable": cmd,
            "argv": ["/d", "/s", "/c", files["c03_script"]],
            "workingDirectory": files["c03_root"], "timeoutMs": 10000, "maxOutputSize": 8192,
            "allowedDirectories": [files["c03_root"]]})
        inside = os.path.exists(os.path.join(files["c03_root"], "inside-probe.txt"))
        outside = os.path.exists(os.path.join(files["outside_root"], "outside-probe.txt"))
        protected = os.path.join(files["c03_root"], "protected-registry.txt")
        registry_text = open(protected, "r", encoding="mbcs", errors="replace").read() if os.path.exists(protected) else ""
        c03_pass = c03.get("response", {}).get("status") == "completed" and inside and not outside and (
            "access is denied" in registry_text.lower() or "error" in registry_text.lower() or
            c03.get("response", {}).get("exitCode", 0) != 0)
        cases.append(case("C03-restricted-token-boundary", "PASS" if c03_pass else "FAIL",
                          "inside workspace succeeds; outside write and protected registry read fail",
                          c03, probes={"inside_created": inside, "outside_created": outside,
                                       "protected_registry": registry_text}))

        network = helper_request(args.helper, {
            "requestId": "c05-loopback", "executable": cmd,
            "argv": ["/d", "/s", "/c", files["network_script"]],
            "workingDirectory": files["network_root"], "timeoutMs": 10000, "maxOutputSize": 8192})
        result_path = os.path.join(files["network_root"], "network-result.json")
        network_result = json.load(open(result_path, "r", encoding="utf-8")) if os.path.exists(result_path) else None
        loopback_pass = network.get("response", {}).get("status") == "completed" and network_result and all(
            network_result.get(key) is True for key in ("tcp", "udp", "dns_localhost"))
        cases.append(case("C05-loopback-network", "PASS" if loopback_pass else "FAIL",
                          "restricted child reaches local TCP/UDP fixture and resolves localhost",
                          network, measurement=network_result,
                          formal_classification="PARTIAL_LOCAL_ONLY_ENVIRONMENT_MISSING"))

        # Run C02 last: assigning this Python host to a Job is intentionally
        # irreversible for the lifetime of the process. The process exits
        # immediately after this case, so C03/C05 remain outside that Job.
        job_info = assign_current_process_to_job()
        c02 = helper_request(args.helper, {
            "requestId": "c02-host-already-in-job", "executable": os.path.join(system32, "where.exe"),
            "argv": ["cmd.exe"], "workingDirectory": files["c03_root"]})
        response = c02.get("response") or {}
        c02_pass = job_info.get("assigned") and response.get("error") == "HOST_ALREADY_IN_JOB"
        c02_fail_closed = job_info.get("assigned") and response.get("error") in ("HOST_ALREADY_IN_JOB", "JOB_CREATE_FAILED")
        cases.append(case(
            "C02-host-already-in-job",
            "PASS" if c02_pass else ("PARTIAL" if c02_fail_closed else "FAIL"),
            "host in a non-nestable Job is reported and child execution is refused",
            c02, job_assignment=job_info,
            note="JOB_CREATE_FAILED is fail-closed but does not prove an explicit host-in-job diagnostic"))
    finally:
        tcp.close()
        udp.close()
    final_process = snapshot_processes()
    record["server_observations"] = seen
    record["final_process_snapshot"] = final_process
    record["status"] = "PASS" if all(item["status"] == "PASS" for item in cases) else "PARTIAL"
    record["formal_status"] = "PARTIAL_C02_C03_C05_LOOPBACK_ONLY"
    record["finished_at"] = utc_now()
    with open(args.out, "w", encoding="utf-8", newline="\n") as stream:
        json.dump(record, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
    print(json.dumps(record, ensure_ascii=False, indent=2))
    return 0 if record["status"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
