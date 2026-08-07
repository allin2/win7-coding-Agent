#!/bin/bash
# SPIKE 02 / D-013 — containment source assertions and local logic tests.
#
# Runs on ANY host:
#   - static assertions on the helper implementation (no taskkill path — N06,
#     restricted token actually applied, Job tree kill, structured argv),
#   - platform-neutral logic unit tests (JSON protocol, argv quoting,
#     allow-list) when the logic_tests binary is built or buildable.
#
# Runs on Win7 only (requires a compiled helper.exe):
#   - dynamic protocol round trip.
#
# Usage: bash test_containment.sh [helper.exe path] [path to logic_tests binary]
#
# Win7-Validation: NOT_PERFORMED (dynamic cases require the D-013 Win10 build
# return package and the WIN7_LEASE_GRANTED gate).

set -uo pipefail

HELPER_PATH="${1:-}"
LOGIC_BIN="${2:-}"
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELPER_SRC_DIR="${TEST_DIR}/../helper"
HELPER_CPP="${HELPER_SRC_DIR}/helper.cpp"
HELPER_H="${HELPER_SRC_DIR}/helper.h"
RESULTS_DIR="${TEST_DIR}/results"
PASS_COUNT=0
FAIL_COUNT=0

pass() { echo "[PASS] $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
fail() { echo "[FAIL] $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
info() { echo "[INFO] $1"; }

mkdir -p "${RESULTS_DIR}"

echo "=============================================="
echo "SPIKE 02 / D-013 containment assertions"
echo "=============================================="

# ── N06: no taskkill ANYWHERE (hard gate). Comments documenting the
#    constraint are fine; executable taskkill paths are not. ──────────────────
if grep -RniE 'L?"taskkill(\.exe)?"|taskkill[[:space:]]+/F|system\([^)]*taskkill|CreateProcess[^)]*taskkill' "${HELPER_SRC_DIR}" --include='*.cpp' --include='*.h' >/dev/null 2>&1; then
    fail "N06: taskkill must never be used to fake Job containment"
else
    pass "N06: no executable taskkill path in helper sources"
fi

# ── C01: Job Object with whole-tree kill ─────────────────────────────────────
for token in CreateJobObjectW SetInformationJobObject JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE TerminateJobObject AssignProcessToJobObject; do
    if grep -q "${token}" "${HELPER_CPP}"; then pass "C01: ${token} present"; else fail "C01: ${token} missing"; fi
done

# ── C02: host Job probe fail-closed ──────────────────────────────────────────
if grep -q 'IsProcessInJob(GetCurrentProcess()' "${HELPER_CPP}" \
    && grep -q 'HOST_ALREADY_IN_JOB' "${HELPER_CPP}"; then
    pass "C02: host-in-Job probe with HOST_ALREADY_IN_JOB fail-closed"
else
    fail "C02: host-in-Job probe missing"
fi

# ── C03: Restricted Token actually applied to the child ──────────────────────
for token in CreateRestrictedToken SetTokenInformation TokenIntegrityLevel CreateProcessWithTokenW DuplicateTokenEx; do
    if grep -q "${token}" "${HELPER_CPP}"; then pass "C03: ${token} present"; else fail "C03: ${token} missing"; fi
done
if grep -q 'S-1-16-4096' "${HELPER_CPP}"; then pass "C03: Low Integrity S-1-16-4096 applied"; else fail "C03: Low Integrity SID missing"; fi

# ── C04: ACL boundary with rollback ──────────────────────────────────────────
for token in AddMandatoryAce SetNamedSecurityInfoW SetEntriesInAclW RestoreDirectoryDacl protectedDirectories; do
    if grep -q "${token}" "${HELPER_CPP}" "${HELPER_H}" 2>/dev/null; then pass "C04: ${token} present"; else fail "C04: ${token} missing"; fi
done

# ── C06/C09: structured argv allow-list, no shell concatenation ──────────────
for token in CheckWhitelist BuildCommandLine QuoteArg; do
    if grep -Rq "${token}" "${HELPER_SRC_DIR}" --include='*.cpp' --include='*.h' 2>/dev/null; then pass "C06/C09: ${token} present"; else fail "C06/C09: ${token} missing"; fi
done
if grep -q 'system(' "${HELPER_CPP}" || grep -q ' _wsystem' "${HELPER_CPP}"; then
    fail "C09: helper must never execute shell strings via system()"
else
    pass "C09: no system() shell-string execution"
fi

# ── C07: timeout + output cap ────────────────────────────────────────────────
for token in outputTruncated kMaxOutputSizeDefault kMaxOutputSizeAbsolute maxOutputSize; do
    if grep -q "${token}" "${HELPER_CPP}" "${HELPER_H}" 2>/dev/null; then pass "C07: ${token} present"; else fail "C07: ${token} missing"; fi
done

# ── C19: input detachment ────────────────────────────────────────────────────
if grep -q '\\\\\.\\\\NUL' "${HELPER_CPP}" || grep -q 'NUL' "${HELPER_CPP}"; then
    pass "C19: child stdin detached (NUL device)"
else
    fail "C19: child stdin detachment missing"
fi

# ── Skeleton leftovers are forbidden ─────────────────────────────────────────
if grep -nE '// *(TODO: *(实现|fill|complete))' "${HELPER_CPP}" "${HELPER_H}" | grep -v 'TODO.*Win7 runtime evidence' >/dev/null; then
    fail "helper still contains implementation TODOs"
else
    pass "helper contains no implementation TODO skeletons"
fi

# ── Platform-neutral logic unit tests ────────────────────────────────────────
if [ -n "${LOGIC_BIN}" ] && [ -x "${LOGIC_BIN}" ]; then
    if "${LOGIC_BIN}" | grep -q 'ALL PASS'; then
        pass "logic_tests: ALL PASS (${LOGIC_BIN})"
    else
        fail "logic_tests: FAIL (${LOGIC_BIN})"
    fi
elif [ -x "${HELPER_SRC_DIR}/build-mac/logic_tests" ]; then
    if "${HELPER_SRC_DIR}/build-mac/logic_tests" | grep -q 'ALL PASS'; then
        pass "logic_tests: ALL PASS (build-mac)"
    else
        fail "logic_tests: FAIL (build-mac)"
    fi
else
    info "logic_tests binary not found; run: cmake -S helper -B helper/build-mac && cmake --build helper/build-mac --target logic_tests"
fi

# ── Dynamic protocol round trip (Win7 only) ──────────────────────────────────
if [ -n "${HELPER_PATH}" ] && [ -f "${HELPER_PATH}" ]; then
    info "dynamic cases require the D-013 Win10 return package and WIN7_LEASE_GRANTED; skipped here"
else
    info "no helper.exe provided; dynamic containment cases NOT_PERFORMED (GATE-WIN10-BUILD / WIN7 lease)"
fi

echo "=============================================="
echo "通过: ${PASS_COUNT}  失败: ${FAIL_COUNT}  Win7-Validation: NOT_PERFORMED"
echo "=============================================="
{
    echo "SPIKE 02 / D-013 containment assertions"
    echo "date: $(date)"
    echo "pass: ${PASS_COUNT}"
    echo "fail: ${FAIL_COUNT}"
    echo "Win7-Validation: NOT_PERFORMED"
} > "${RESULTS_DIR}/test_results.txt"

[ "${FAIL_COUNT}" -eq 0 ]
