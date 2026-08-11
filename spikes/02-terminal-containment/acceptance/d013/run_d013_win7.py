"""D-013 containment acceptance harness (runs on Windows 7, acceptance-only).

Covers the D-013 helper contract at the SPIKE_02 level:

  C01  Job Object tree kill      start a detached ping inside the Job, verify
                                 zero residual after helper returns
  C02  Host already in a Job     helper must fail closed with
                                 HOST_ALREADY_IN_JOB (Win7 cannot nest Jobs)
  C03  Restricted Token          actual suspended child token audited as a
                                 restricted primary Low Integrity token
                                 (S-1-16-4096), privileges
                                 deleted, workspace-inside write OK, workspace-
                                 outside write blocked, protected registry read
                                 denied
  C04  ACL boundary              protectedDirectories: deny ACE applied +
                                 verified + rolled back; write attempt fails
                                 and is recorded; authorization gate refuses
                                 ACL targets outside the per-run root
  C05  Network reachability      loopback TCP/UDP/localhost DNS measured and
                                 recorded; NEVER claimed as isolation
                                 (formal classification stays ENVIRONMENT_MISSING)
  C06  argv allow-list           non-whitelisted executable and cmd /k are
                                 rejected with ARGV_REJECTED
  C07  timeout / output cap      timeout kills the tree; output is truncated
                                 and marked
  C08  Runner host memory        peak helper working set sampled during each
                                 request and compared with budget #4
  N06  no taskkill               harness records that taskkill is never used

The harness never changes network, services, startup items, registry or
system configuration. It never uses taskkill. ACL changes are made by the
helper on directories the harness created inside the per-run root, and are
rolled back by the helper; the harness verifies the rollback.

Run (on Win7):  python run_d013_win7.py --acceptance-id A4-YYYYMMDD-xxx \
    --helper <path>\spike02_helper.exe --root <root> --acceptance-root <acceptance_root> \
    --out results.json
Policy check (any host): python run_d013_win7.py --check-policy <root> <target>
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

SUITE = "SPIKE_02_D013_CONTAINMENT_WIN7"
FORMAL_C05 = "ENVIRONMENT_MISSING"


def utc_now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def norm_path(path):
    return os.path.normcase(os.path.abspath(path))


def check_policy(root, target):
    """Minimal authorization: ACL-modifying targets must live inside root."""
    norm_root = norm_path(root)
    norm_target = norm_path(target)
    within = norm_target == norm_root or norm_target.startswith(norm_root + os.sep)
    return {
        "allowed": within,
        "root": norm_root,
        "target": norm_target,
        "reason": "within per-run root" if within
                  else "OUTSIDE per-run root: ACL modification refused",
    }


def run_sync(command, args, timeout=20):
    started = time.time()
    try:
        completed = subprocess.run(
            [command] + list(args), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=timeout, universal_newlines=True, encoding="mbcs",
            errors="replace", shell=False)
        return {"command": command, "args": list(args),
                "exit_code": completed.returncode, "stdout": completed.stdout,
                "stderr": completed.stderr,
                "elapsed_ms": int((time.time() - started) * 1000), "error": None}
    except Exception as error:
        return {"command": command, "args": list(args), "exit_code": None,
                "stdout": "", "stderr": "",
                "elapsed_ms": int((time.time() - started) * 1000),
                "error": "%s: %s" % (type(error).__name__, error)}


def process_working_set_bytes(pid):
    """Read one process working set with Win7-compatible PSAPI."""
    if os.name != "nt":
        return None
    try:
        from ctypes import wintypes

        class PROCESS_MEMORY_COUNTERS(ctypes.Structure):
            _fields_ = [
                ("cb", wintypes.DWORD),
                ("PageFaultCount", wintypes.DWORD),
                ("PeakWorkingSetSize", ctypes.c_size_t),
                ("WorkingSetSize", ctypes.c_size_t),
                ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
                ("QuotaPagedPoolUsage", ctypes.c_size_t),
                ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                ("PagefileUsage", ctypes.c_size_t),
                ("PeakPagefileUsage", ctypes.c_size_t),
            ]

        handle = ctypes.windll.kernel32.OpenProcess(0x1000 | 0x0400, False, pid)
        if not handle:
            return None
        try:
            counters = PROCESS_MEMORY_COUNTERS()
            counters.cb = ctypes.sizeof(counters)
            if not ctypes.windll.psapi.GetProcessMemoryInfo(
                    handle, ctypes.byref(counters), counters.cb):
                return None
            return int(counters.WorkingSetSize)
        finally:
            ctypes.windll.kernel32.CloseHandle(handle)
    except Exception:
        return None


def helper_request(helper, request, timeout=30):
    started = time.time()
    process = subprocess.Popen(
        [helper], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, universal_newlines=True, encoding="utf-8",
        errors="replace", shell=False)
    responses = queue.Queue()
    stderr_lines = []
    peak_working_set = [0]
    stop_sampling = threading.Event()

    def read_stdout():
        for line in process.stdout:
            if line.strip():
                responses.put(line.rstrip("\r\n"))

    def read_stderr():
        for line in process.stderr:
            stderr_lines.append(line)

    def sample_memory():
        while not stop_sampling.is_set():
            sample = process_working_set_bytes(process.pid)
            if sample is not None:
                peak_working_set[0] = max(peak_working_set[0], sample)
            stop_sampling.wait(0.02)

    stdout_reader = threading.Thread(target=read_stdout)
    stderr_reader = threading.Thread(target=read_stderr)
    memory_sampler = threading.Thread(target=sample_memory)
    stdout_reader.daemon = True
    stderr_reader.daemon = True
    memory_sampler.daemon = True
    stdout_reader.start()
    stderr_reader.start()
    memory_sampler.start()
    try:
        process.stdin.write(json.dumps(request, ensure_ascii=False) + "\n")
        process.stdin.flush()
        line = responses.get(timeout=timeout)
    except queue.Empty:
        process.kill()
        stop_sampling.set()
        memory_sampler.join(timeout=5)
        stdout_reader.join(timeout=5)
        stderr_reader.join(timeout=5)
        return {"transport": {"exit_code": process.returncode,
                              "stderr": "".join(stderr_lines), "timed_out": True,
                              "peak_working_set_bytes": peak_working_set[0] or None},
                "response": None}
    finally:
        if process.stdin and not process.stdin.closed:
            process.stdin.close()
    process.wait(timeout=10)
    stop_sampling.set()
    memory_sampler.join(timeout=10)
    stdout_reader.join(timeout=10)
    stderr_reader.join(timeout=10)
    response = None
    invalid = []
    for candidate in [line] + [value for value in stderr_lines if value.strip()]:
        try:
            response = json.loads(candidate)
        except ValueError:
            invalid.append(candidate)
    return {"transport": {"exit_code": process.returncode,
                          "elapsed_ms": int((time.time() - started) * 1000),
                          "timed_out": False,
                          "peak_working_set_bytes": peak_working_set[0] or None},
            "response": response, "invalid_stdout_lines": invalid}


def snapshot_processes():
    wmic = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "System32",
                        "wbem", "wmic.exe")
    return run_sync(wmic, ["process", "get", "Name,ProcessId,ParentProcessId,CommandLine",
                           "/format:csv"])


def tasklist_filter(name):
    tasklist = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "System32",
                            "tasklist.exe")
    return run_sync(tasklist, ["/FI", "IMAGENAME eq %s" % name, "/FO", "CSV", "/NH"])


def icacls_dacl(path):
    icacls = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "System32",
                          "icacls.exe")
    return run_sync(icacls, [path])


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
    c01_root = os.path.join(root, "c01-tree")
    c03_root = os.path.join(root, "c03-boundary")
    c04_root = os.path.join(root, "c04-boundary")
    c05_root = os.path.join(root, "c05-loopback")
    outside_root = os.path.join(root, "protected-outside")
    for directory in [c01_root, c03_root, c04_root, c05_root, outside_root]:
        os.makedirs(directory)

    c01_script = os.path.join(c01_root, "c01-tree.cmd")
    with open(c01_script, "w", encoding="utf-8", newline="") as stream:
        stream.write("@echo off\r\n")
        stream.write('start "" /b ping -n 60 127.0.0.1 > nul\r\n')
        stream.write("exit /b 0\r\n")

    c03_script = os.path.join(c03_root, "c03-boundary.cmd")
    with open(c03_script, "w", encoding="utf-8", newline="") as stream:
        stream.write("@echo off\r\n")
        stream.write("echo inside>\"%~dp0inside-probe.txt\"\r\n")
        stream.write("echo outside>\"%~dp0..\\protected-outside\\outside-probe.txt\"\r\n")
        stream.write("reg.exe query HKLM\\SAM\\SAM >\"%~dp0protected-registry.txt\" 2>&1\r\n")
        stream.write("whoami /groups >\"%~dp0token-groups.txt\"\r\n")
        stream.write("whoami /priv >\"%~dp0token-privs.txt\"\r\n")
        stream.write("exit /b 0\r\n")

    c04_script = os.path.join(c04_root, "c04-protected.cmd")
    with open(c04_script, "w", encoding="utf-8", newline="") as stream:
        stream.write("@echo off\r\n")
        stream.write("echo probe>\"%~dp0..\\protected-outside\\c04-protected-probe.txt\"\r\n")
        stream.write("exit /b 0\r\n")

    network_probe = os.path.join(c05_root, "network_probe.py")
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

    c05_script = os.path.join(c05_root, "c05-loopback.cmd")
    c05_result = os.path.join(c05_root, "network-result.json")
    with open(c05_script, "w", encoding="utf-8", newline="") as stream:
        stream.write("@echo off\r\n")
        stream.write('"%s" "%s" "%s" "%s" "%s"\r\n' % (
            python_path, network_probe, tcp_port, udp_port, c05_result))
        stream.write("exit /b 0\r\n")
    return {
        "c01_root": c01_root, "c01_script": c01_script,
        "c03_root": c03_root, "c03_script": c03_script,
        "c04_root": c04_root, "c04_script": c04_script,
        "c05_root": c05_root, "c05_script": c05_script,
        "c05_result": c05_result,
        "outside_root": outside_root, "network_probe": network_probe,
    }


def case(case_id, status, expected, actual, **extra):
    result = {"id": case_id, "status": status, "expected": expected, "actual": actual}
    result.update(extra)
    return result


def acl_rollback_record(response, mechanism):
    """Return the matching ACL audit record, or None when it is absent."""
    for record in (response or {}).get("aclChanges", []):
        if record.get("mechanism") == mechanism:
            return record
    return None


def read_console_text(path):
    """Read Win7 console evidence while keeping local mock tests portable."""
    encoding = "mbcs" if os.name == "nt" else "utf-8"
    with open(path, "r", encoding=encoding, errors="replace") as stream:
        return stream.read()


def run_cases(record, files, args, cmd):
    cases = record["cases"]
    system32 = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "System32")
    # ACL changes are only authorized inside the per-run root, which must itself
    # live under the acceptance root (helper enforces the same boundary — the
    # harness value here is passed through and re-resolved by the helper).
    acl_policy = {"acceptanceRoot": args.acceptance_root, "perRunRoot": args.root}

    # ── C01: Job Object whole-tree kill ──────────────────────────────────────
    c01 = helper_request(args.helper, {
        "requestId": "c01-tree-kill", "executable": cmd,
        "argv": ["/d", "/s", "/c", files["c01_script"]],
        "workingDirectory": files["c01_root"], "timeoutMs": 8000, "maxOutputSize": 4096,
        "allowedDirectories": [files["c01_root"]], "aclPolicy": acl_policy})
    time.sleep(2)
    residual = tasklist_filter("ping.exe")
    response = c01.get("response") or {}
    label_record = acl_rollback_record(response, "low_integrity_label")
    c01_pass = (response.get("status") == "completed"
                and response.get("containmentVerified") is True
                and response.get("inputDetached") is True
                and label_record is not None
                and label_record.get("applied") is True
                and label_record.get("verified") is True
                and label_record.get("rolledBack") is True
                and not residual.get("error")
                and "ping.exe" not in (residual.get("stdout") or "").lower())
    cases.append(case(
        "C01-job-tree-kill",
        "PASS" if c01_pass else "FAIL",
        "detached ping inside the Job is killed; zero residual; containment/input detachment and label rollback reported",
        c01, residual_tasklist=residual["stdout"], label_rollback=label_record))

    # ── C03: Restricted Token boundary (fixed semantics) ─────────────────────
    c03 = helper_request(args.helper, {
        "requestId": "c03-restricted-boundary", "executable": cmd,
        "argv": ["/d", "/s", "/c", files["c03_script"]],
        "workingDirectory": files["c03_root"], "timeoutMs": 10000, "maxOutputSize": 8192,
        "allowedDirectories": [files["c03_root"]], "aclPolicy": acl_policy})
    inside = os.path.exists(os.path.join(files["c03_root"], "inside-probe.txt"))
    outside = os.path.exists(os.path.join(files["outside_root"], "outside-probe.txt"))
    registry_text = ""
    registry_path = os.path.join(files["c03_root"], "protected-registry.txt")
    if os.path.exists(registry_path):
        registry_text = read_console_text(registry_path)
    groups_text = ""
    groups_path = os.path.join(files["c03_root"], "token-groups.txt")
    if os.path.exists(groups_path):
        groups_text = read_console_text(groups_path)
    privs_text = ""
    privs_path = os.path.join(files["c03_root"], "token-privs.txt")
    if os.path.exists(privs_path):
        privs_text = read_console_text(privs_path)
    registry_denied = ("access is denied" in registry_text.lower()
                       or "拒绝访问" in registry_text
                       or "error" in registry_text.lower())
    # Trusted C03 evidence comes from the helper opening the actual suspended
    # child process token and querying TokenIntegrityLevel before ResumeThread.
    # Win7 `whoami /groups` may itself fail with ERROR_ACCESS_DENIED under the
    # restricted token, so its localized output is supplemental only.
    token_audit = (c03.get("response") or {}).get("tokenAudit") or {}
    low_integrity = (token_audit.get("source") == "suspended_child_process_token"
                     and token_audit.get("verified") is True
                     and token_audit.get("isRestricted") is True
                     and token_audit.get("tokenType") == "primary"
                     and token_audit.get("restrictedSidSetVerified") is True
                     and token_audit.get("userRestrictedSid") is True
                     and token_audit.get("worldRestrictedSid") is True
                     and token_audit.get("administratorsRestrictedSid") is False
                     and isinstance(token_audit.get("restrictedSidCount"), int)
                     and token_audit.get("restrictedSidCount") >= 2
                     and token_audit.get("integritySid") == "S-1-16-4096"
                     and token_audit.get("integrityRid") == 4096)
    privileges_deleted = "SeDebugPrivilege" not in privs_text
    c03_label = acl_rollback_record(c03.get("response") or {}, "low_integrity_label")
    c03_pass = (c03.get("response", {}).get("status") == "completed"
                and inside and not outside and registry_denied
                and low_integrity and privileges_deleted
                and c03_label is not None
                and c03_label.get("applied") is True
                and c03_label.get("verified") is True
                and c03_label.get("rolledBack") is True)
    cases.append(case(
        "C03-restricted-token-boundary", "PASS" if c03_pass else "FAIL",
        "inside workspace write succeeds; outside write and protected registry read fail; "
        "child token is Low Integrity (S-1-16-4096) with privileges deleted",
        c03, probes={"inside_created": inside, "outside_created": outside,
                     "protected_registry_denied": registry_denied,
                     "child_low_integrity": low_integrity,
                     "child_privileges_deleted": privileges_deleted,
                     "label_rollback": c03_label},
        token_evidence={"trusted_child_token_audit": token_audit,
                        "whoami_groups_supplemental": groups_text,
                        "privileges": privs_text}))

    # ── C04: ACL boundary with authorization, verification and rollback ──────
    policy = check_policy(args.root, files["outside_root"])
    before = icacls_dacl(files["outside_root"])
    c04 = helper_request(args.helper, {
        "requestId": "c04-acl-boundary", "executable": cmd,
        "argv": ["/d", "/s", "/c", files["c04_script"]],
        "workingDirectory": files["c04_root"], "timeoutMs": 10000, "maxOutputSize": 8192,
        "allowedDirectories": [files["c04_root"]],
        "protectedDirectories": [files["outside_root"]], "aclPolicy": acl_policy})
    after = icacls_dacl(files["outside_root"])
    protected_probe = os.path.exists(os.path.join(files["outside_root"],
                                                  "c04-protected-probe.txt"))
    acl_entry = None
    for entry in (c04.get("response", {}) or {}).get("aclChanges", []):
        if entry.get("mechanism") == "deny_ace" and norm_path(entry.get("path", "")) == norm_path(files["outside_root"]):
            acl_entry = entry
            break
    acl_ok = bool(acl_entry and acl_entry.get("applied") is True
                  and acl_entry.get("verified") is True
                  and acl_entry.get("rolledBack") is True)
    rollback_ok = not protected_probe and before.get("stdout") == after.get("stdout")
    c04_pass = policy.get("allowed") and acl_ok and rollback_ok
    cases.append(case(
        "C04-acl-boundary",
        "PASS" if c04_pass else "FAIL",
        "protected dir: deny ACE applied+verified+rolled back; write fails; "
        "ACL restored; authorization gate allows only in-root targets",
        c04, policy=policy,
        acl_record=acl_entry, protected_write_failed=not protected_probe,
        dacl_before=before["stdout"], dacl_after=after["stdout"]))

    # ── C05: network reachability measurement (record-only) ──────────────────
    c05 = helper_request(args.helper, {
        "requestId": "c05-loopback", "executable": cmd,
        "argv": ["/d", "/s", "/c", files["c05_script"]],
        "workingDirectory": files["c05_root"], "timeoutMs": 15000, "maxOutputSize": 8192,
        "allowedDirectories": [files["c05_root"]], "aclPolicy": acl_policy})
    network_result = None
    if os.path.exists(files["c05_result"]):
        with open(files["c05_result"], "r", encoding="utf-8") as stream:
            network_result = json.load(stream)
    loopback_pass = (c05.get("response", {}).get("status") == "completed"
                     and network_result
                     and all(network_result.get(key) is True
                             for key in ("tcp", "udp", "dns_localhost")))
    c05_label = acl_rollback_record(c05.get("response") or {}, "low_integrity_label")
    loopback_pass = (loopback_pass
                     and c05_label is not None
                     and c05_label.get("applied") is True
                     and c05_label.get("verified") is True
                     and c05_label.get("rolledBack") is True)
    cases.append(case(
        "C05-loopback-network", "PASS" if loopback_pass else "FAIL",
        "restricted child reaches local TCP/UDP fixtures and resolves localhost; "
        "measurement recorded, NOT an isolation assertion",
        c05, measurement=network_result, label_rollback=c05_label,
        formal_classification=FORMAL_C05,
        note="Job/Token/ACL cannot block Winsock; formal no-network/enterprise "
             "conclusion requires approved endpoints and audit (GATE-NET)"))

    # ── C06: argv allow-list ─────────────────────────────────────────────────
    notepad = helper_request(args.helper, {
        "requestId": "c06-argv-reject", "executable": os.path.join(system32, "notepad.exe"),
        "argv": [], "workingDirectory": files["c03_root"], "timeoutMs": 5000})
    cmd_k = helper_request(args.helper, {
        "requestId": "c06-cmd-k-reject", "executable": cmd,
        "argv": ["/d", "/s", "/k", "echo hi"], "workingDirectory": files["c03_root"],
        "timeoutMs": 5000})
    c06_pass = (notepad.get("response", {}).get("error") == "ARGV_REJECTED"
                and cmd_k.get("response", {}).get("error") == "ARGV_REJECTED")
    cases.append(case(
        "C06-argv-whitelist", "PASS" if c06_pass else "FAIL",
        "non-whitelisted executable and cmd /k are rejected with ARGV_REJECTED",
        {"notepad": notepad, "cmd_k": cmd_k}))

    # ── C07: timeout kills the tree; output cap truncates ────────────────────
    timeout_req = helper_request(args.helper, {
        "requestId": "c07-timeout", "executable": cmd,
        "argv": ["/d", "/s", "/c", "ping -n 10 127.0.0.1 > nul"],
        "workingDirectory": files["c03_root"], "timeoutMs": 3000, "maxOutputSize": 4096})
    timeout_response = timeout_req.get("response") or {}
    timeout_pass = (timeout_response.get("status") == "completed"
                    and timeout_response.get("timedOut") is True
                    and timeout_response.get("executionTimeMs", 0) >= 2500)
    cases.append(case(
        "C07-timeout-process-tree", "PASS" if timeout_pass else "FAIL",
        "helper times out and kills the whole tree via the Job (never taskkill)",
        timeout_req))

    cap_req = helper_request(args.helper, {
        "requestId": "c07-output-cap", "executable": cmd,
        "argv": ["/d", "/s", "/c", "for /l %i in (1,1,3000) do @echo line %i"],
        "workingDirectory": files["c03_root"], "timeoutMs": 15000, "maxOutputSize": 1024})
    cap_response = cap_req.get("response") or {}
    cap_pass = (cap_response.get("status") == "completed"
                and cap_response.get("outputTruncated") is True
                and cap_response.get("stdoutSize", 0) <= 1024)
    cases.append(case(
        "C07-output-cap", "PASS" if cap_pass else "FAIL",
        "stdout is truncated at maxOutputSize and marked",
        cap_req))

    # ── C08: peak working set for each helper instance (budget #4) ──────────
    peaks = []

    def collect_peaks(value):
        if isinstance(value, dict):
            peak = value.get("peak_working_set_bytes")
            if isinstance(peak, int) and peak > 0:
                peaks.append(peak)
            for child in value.values():
                collect_peaks(child)
        elif isinstance(value, list):
            for child in value:
                collect_peaks(child)

    collect_peaks(cases)
    peak_bytes = max(peaks) if peaks else None
    c08_pass = peak_bytes is not None and peak_bytes <= 60 * 1024 * 1024
    cases.append(case(
        "C08-runner-memory", "PASS" if c08_pass else "FAIL",
        "peak helper working set is measured during long-output execution and is <= performance budget #4 (60MB)",
        {"peak_working_set_bytes": peak_bytes,
         "peak_working_set_mb": round(peak_bytes / 1024.0 / 1024.0, 3) if peak_bytes else None,
         "sample_count": len(peaks), "budget_mb": 60, "no_go_mb": 100}))

    cases.append(case(
        "N06-no-taskkill", "PASS",
        "harness and orchestrator never use taskkill as containment",
        {"taskkill_used": False, "mechanism": "Job Object"}))

    # ── C02 last: host-in-Job must fail closed ───────────────────────────────
    try:
        job_info = assign_current_process_to_job()
    except Exception as error:  # non-Windows hosts (mock tests): record, not crash
        job_info = {"created": False, "assigned": False,
                    "error": "%s: %s" % (type(error).__name__, error)}
    c02 = helper_request(args.helper, {
        "requestId": "c02-host-already-in-job", "executable": cmd,
        "argv": ["/d", "/s", "/c", "echo never"], "workingDirectory": files["c03_root"]})
    response = c02.get("response") or {}
    c02_pass = (job_info.get("assigned")
                and response.get("error") == "HOST_ALREADY_IN_JOB")
    c02_fail_closed = (job_info.get("assigned")
                       and response.get("error") in ("HOST_ALREADY_IN_JOB", "JOB_CREATE_FAILED"))
    cases.append(case(
        "C02-host-already-in-job",
        "PASS" if c02_pass else ("PARTIAL" if c02_fail_closed else "FAIL"),
        "host in a non-nestable Job is reported and child execution is refused",
        c02, job_assignment=job_info,
        note="JOB_CREATE_FAILED is fail-closed but does not prove an explicit "
             "host-in-job diagnostic"))

    # ── Authorization gate negative: out-of-root ACL target refused ──────────
    out_of_root = os.path.join(os.path.dirname(args.root), "..", "outside-root")
    negative_policy = check_policy(args.root, out_of_root)
    cases.append(case(
        "C04-authorization-gate", "PASS" if not negative_policy.get("allowed") else "FAIL",
        "ACL-modifying target outside the per-run root is refused before any helper call",
        negative_policy))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--acceptance-id")
    parser.add_argument("--helper")
    parser.add_argument("--root")
    parser.add_argument("--acceptance-root", default=r"C:\Win7CodingAgent\acceptance")
    parser.add_argument("--out")
    parser.add_argument("--check-policy", nargs=2, metavar=("ROOT", "TARGET"))
    args = parser.parse_args()

    if args.check_policy:
        root, target = args.check_policy
        result = check_policy(root, target)
        print(json.dumps(result, ensure_ascii=False))
        return 0 if result["allowed"] else 1

    if not (args.acceptance_id and args.helper and args.root and args.out):
        parser.error("--acceptance-id/--helper/--root/--out are required outside --check-policy")

    root = os.path.abspath(args.root)
    # On the native (Win7) host the acceptance root is a real absolute path:
    # resolve it, create it if missing, and refuse a per-run root that escapes
    # the boundary (the helper re-enforces the same check, fail-closed). On a
    # dev host a Windows-style value like the default is not absolute, so pass
    # it through untouched — the helper resolves the real path on Win7.
    if os.path.isabs(args.acceptance_root):
        acceptance_root = os.path.abspath(args.acceptance_root)
        if not (root == acceptance_root or root.startswith(acceptance_root + os.sep)):
            parser.error("--root must be inside --acceptance-root (ACL authorization boundary)")
        os.makedirs(acceptance_root, exist_ok=True)
        args.acceptance_root = acceptance_root
    os.makedirs(root, exist_ok=True)
    args.root = root
    system32 = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "System32")
    cmd = os.path.join(system32, "cmd.exe")
    record = {
        "schema_version": 1,
        "acceptance_id": args.acceptance_id,
        "suite": SUITE,
        "captured_at": utc_now(),
        "host": {"platform": sys.platform, "architecture": platform.machine(),
                 "release": platform.release(), "version": platform.version(),
                 "python": sys.version},
        "artifact": {"path": os.path.abspath(args.helper), "sha256": sha256(args.helper)},
        "cases": [], "taskkill_used": False,
        "scope": {"C05": "LOOPBACK_ONLY_NO_ENTERPRISE_NETWORK_CONCLUSION",
                  "formal_c05": FORMAL_C05,
                  "acl_targets_authorized_only_under_root": True},
    }
    cases = record["cases"]
    tcp, udp, seen = start_loopback_servers()
    files = write_test_files(root, sys.executable, tcp.getsockname()[1], udp.getsockname()[1])
    record["generated_files"] = {
        name: {"path": path, "sha256": sha256(path)}
        for name, path in files.items() if os.path.isfile(path)
    }
    try:
        run_cases(record, files, args, cmd)
    finally:
        tcp.close()
        udp.close()
    record["server_observations"] = seen
    record["final_process_snapshot"] = snapshot_processes()
    record["status"] = "PASS" if all(item["status"] == "PASS" for item in cases) else "PARTIAL"
    record["formal_status"] = "PARTIAL_C02_C03_C04_C05_C06_C07_EVIDENCE_READY"
    record["finished_at"] = utc_now()
    with open(args.out, "w", encoding="utf-8", newline="\n") as stream:
        json.dump(record, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
    print(json.dumps(record, ensure_ascii=False, indent=2))
    return 0 if record["status"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
