#!/bin/bash
# SPIKE 02 - 终端容器化测试脚本
#
# 验证 C++ Helper 和 VT 过滤器的 containment 功能。
# 需要在 Win7 实机上运行（需要 MSVC 编译的 helper.exe）。
#
# 用法: bash test_containment.sh [helper_path]
#
# Win7-Validation: NOT_PERFORMED

set -euo pipefail

# ─── 配置 ────────────────────────────────────────────────────────────────────

HELPER_PATH="${1:-../helper/build/Release/helper.exe}"
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="${TEST_DIR}/output"
RESULTS_DIR="${TEST_DIR}/results"

# ─── 颜色输出 ────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; }
info() { echo -e "${YELLOW}[INFO]${NC} $1"; }

# ─── 初始化 ──────────────────────────────────────────────────────────────────

echo "=============================================="
echo "SPIKE 02 - 终端容器化测试"
echo "=============================================="
echo ""

# 创建结果目录
mkdir -p "${RESULTS_DIR}"

# 检查 helper 是否存在
if [[ ! -f "${HELPER_PATH}" ]]; then
    info "Helper 未编译: ${HELPER_PATH}"
    info "请先编译 C++ Helper:"
    info "  cd ../helper && mkdir build && cd build"
    info "  cmake .. -G 'Visual Studio 16 2019' -A x64"
    info "  cmake --build . --config Release"
    echo ""
    info "当前运行静态检查..."
    echo ""
fi

# ─── 测试项定义 ──────────────────────────────────────────────────────────────

PASS_COUNT=0
FAIL_COUNT=0

run_test() {
    local test_id="$1"
    local test_name="$2"
    local test_cmd="$3"
    
    info "运行测试: ${test_id} - ${test_name}"
    
    if eval "${test_cmd}"; then
        pass "${test_id} - ${test_name}"
        ((PASS_COUNT++))
    else
        fail "${test_id} - ${test_name}"
        ((FAIL_COUNT++))
    fi
}

# ─── 静态检查（可在任何平台运行）────────────────────────────────────────────

echo "--- 静态检查 ---"
echo ""

# C01: Job Object 代码检查
run_test "C01" "Job Object API 使用" \
    "grep -q 'CreateJobObject' ../helper/helper.cpp"

# C02: Restricted Token 代码检查
run_test "C02" "Restricted Token API 使用" \
    "grep -q 'CreateRestrictedToken' ../helper/helper.cpp"

# C03: ACL 设置代码检查
run_test "C03" "ACL API 使用" \
    "grep -q 'SetEntriesInAcl\|SetNamedSecurityInfo' ../helper/helper.cpp"

# C04: argv 白名单代码检查
run_test "C04" "argv 白名单函数存在" \
    "grep -q 'ValidateArgvWhitelist' ../helper/helper.cpp"

# C05: 子进程启动代码检查
run_test "C05" "CreateProcess API 使用" \
    "grep -q 'CreateProcessW' ../helper/helper.cpp"

# C06: 超时处理代码检查
run_test "C06" "超时处理代码存在" \
    "grep -q 'WaitForSingleObject\|WAIT_TIMEOUT' ../helper/helper.cpp"

# C07: 输出上限代码检查
run_test "C07" "输出上限常量定义" \
    "grep -q 'MAX_OUTPUT_SIZE' ../helper/helper.h"

# C11: JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
run_test "C11" "KILL_ON_JOB_CLOSE 标志" \
    "grep -q 'JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE' ../helper/helper.cpp"

# C12: IsProcessInJob 探测
run_test "C12" "IsProcessInJob 探测" \
    "grep -q 'IsProcessInJob' ../helper/helper.cpp"

# C13-C15: VT 过滤器检查
run_test "C13" "OSC 52 过滤正则" \
    "grep -q 'OSC_52_CLIPBOARD' ../winpty/filter.js"

run_test "C14" "窗口标题过滤正则" \
    "grep -q 'WINDOW_TITLE' ../winpty/filter.js"

run_test "C15" "DECRQSS 过滤正则" \
    "grep -q 'DECRQSS' ../winpty/filter.js"

# C10: 中文+空格路径兼容
run_test "C10" "Unicode 定义（中文路径支持）" \
    "grep -q 'UNICODE' ../helper/CMakeLists.txt"

echo ""

# ─── 动态测试（需要 Win7 实机）──────────────────────────────────────────────

if [[ -f "${HELPER_PATH}" ]]; then
    echo "--- 动态测试（Win7 实机）---"
    echo ""
    
    # TODO: 实现动态测试
    # 1. 启动 helper.exe
    # 2. 发送 JSON 命令
    # 3. 验证输出
    # 4. 测试恶意输入过滤
    
    info "动态测试尚未实现，需要 Win7 实机验证"
    echo ""
fi

# ─── 恶意输入测试 ────────────────────────────────────────────────────────────

echo "--- 恶意输入生成 ---"
echo ""

# 生成恶意样本
node generate_malicious.js "${OUTPUT_DIR}"

echo ""

# ─── 汇总 ────────────────────────────────────────────────────────────────────

echo "=============================================="
echo "测试结果汇总"
echo "=============================================="
echo ""
echo "通过: ${PASS_COUNT}"
echo "失败: ${FAIL_COUNT}"
echo "总计: $((PASS_COUNT + FAIL_COUNT))"
echo ""

if [[ ${FAIL_COUNT} -eq 0 ]]; then
    echo -e "${GREEN}判定: GO${NC} - 所有静态检查通过"
else
    echo -e "${RED}判定: NO-GO${NC} - 存在未通过的检查项"
fi

echo ""
echo "Win7-Validation: NOT_PERFORMED"
echo "=============================================="

# 保存结果
{
    echo "SPIKE 02 - 测试结果"
    echo "日期: $(date)"
    echo "通过: ${PASS_COUNT}"
    echo "失败: ${FAIL_COUNT}"
    echo "Win7-Validation: NOT_PERFORMED"
} > "${RESULTS_DIR}/test_results.txt"

exit ${FAIL_COUNT}
