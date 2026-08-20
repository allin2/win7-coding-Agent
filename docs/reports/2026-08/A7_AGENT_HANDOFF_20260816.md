# A7 验证状态与后续工作交接（2026-08-16）

> 文档性质：Agent 交接快照，不替代 `docs/STATUS.md`、`docs/status/*.json` 或协调器正式裁决。
> 接手 Agent 应先核对本文件记录的提交、工件哈希和原始返回证据，再更新正式状态。

## 1. 工作位置与锁定基线

| 项目 | 当前值 |
|---|---|
| worktree | `/Users/qlyf/Developer/win7-agent-a7` |
| branch | `codex/a7-release-candidate` |
| 交接内容来源 HEAD | `1640afbc924106c0556b85c4e47f230ca0fdc342`（短哈希 `1640afb`） |
| A4/A5/A6 收口基线 | `793cc4799c81d9dc27d236826a344a39d86137ec` |
| A7 任务书 | `docs/tasks/RC_01_WIN7_RELEASE_CANDIDATE.md` |
| 实现授权 | `APPROVED_FOR_IMPLEMENTATION`，仅限任务书允许路径和已追加的 Runner 截断解码修复授权 |
| 写入本交接文档前状态 | tracked/untracked 均为空，worktree clean |

不要在 `/Users/qlyf/Developer/win7-coding-Agent` 的 `main` 上继续 A7 实现；A7 工作只在上述 worktree/branch 推进。

## 2. 当前分层结论

| 层级/验收项 | 客观状态 | 说明 |
|---|---|---|
| 开发机 | **PASS** | 7 个模块共 983 项回归、19 项 release/RC 合同、Runner 定向测试、JSON、文档、ZIP 独立校验和确定性重建均已通过 |
| RC-04 Windows 产品 smoke | **PASS（当前 v3 候选）** | 2026-08-16 在 Win10 19045 x64 连续两轮各 3/3 PASS，退出码 0，关闭后无 WAL/SHM 及新增 Electron/helper 残留 |
| RC-05 Windows Runner | **FAIL_CLOSED** | RC05-P02 与 RC05-C01 因 `CONTAINMENT_UNAVAILABLE` 失败；原生 helper 在启动前拒绝 `electron.exe` |
| RC-06 Windows Storage | **PASS（当前 v3 候选）** | 7/7 PASS；SQLite 3.43.1、WAL、FTS5、Unicode/空格路径、恢复、容量限制、篡改拒绝、本地 NTFS SSD 和零 WAL/SHM 残留均有证据 |
| Win10 总门禁 | **未通过** | RC-05 失败，RC0506 summary=`FAIL`、fatal 存在、真实进程退出码为 1；不得写成 Win10 PASS |
| Win7 | **NOT_PERFORMED** | 未签发 A7 RC 租约，未连接 Win7 |
| RC 总体 | **NOT_PERFORMED / BLOCKED** | RC-05 阻断；RC-07/08 尚未实现和验收，RC-09/10 亦未执行 |

最重要的纪律是：A4/A5/A6 单项 Win7 PASS 只是 A7 输入，不能继承为 A7 Win7 PASS；当前任何 Windows 10 结果也不能冒充 Win7 或 RC PASS。

## 3. 当前候选与 v3 KIT

### 3.1 产品候选

- 文件：`release/win7-rc/out/Win7CodingAgent-0.1.0-rc.1-win7-x64.zip`
- source commit：`963eabe81080184041ed3a4d16ee79b8bc01d56c`
- size：`100878367`
- SHA-256：`39eecb6a683f90dea12e58dbeee070ec0bc4dd1706a08bd4f1967343e28040c9`
- release manifest SHA-256：`ff1a46ffa517dc84602767db144cffcae6bdcfc3300ca52949001997141932d0`
- manifest files：`731`
- D-013 helper：`7f86dac89862b2c61d55fe83ba00bf7cdaa69714d24d0f9d21b62f9040d1c134`
- D-014 binding：`7138aa2365e0027ced9bc8ae356097b31776d084a5a8f91cc2d3677785e915cc`

### 3.2 v3 Windows 验证 KIT

- 文件：`release/win7-rc/out/RC0506_WINDOWS_VALIDATION_KIT_20260814-v3.zip`
- KIT source commit：`f47fd8404ca3490d9ab6b78aa9eb204d48890dd1`
- size：`13502`
- SHA-256：`9cbe6be7e530c0f57245010db6d21845a925ca38632cda6075924f9aa7172b1e`
- KIT manifest SHA-256：`ff0eb5fe1298275f95ca9fadb26366d124c3d0249d808c6b51ca37ec2cc2887c`

上述两个本地文件在交接复核时重新计算的 SHA-256 与锁定值一致。

## 4. 2026-08-16 Windows 返回包独立复核

### 4.1 返回包

- 原路径：`/Users/qlyf/Downloads/return-to-dev-20260816.zip`
- size：`22204`
- SHA-256：`5e02a7e567df8fcf2323ec96dcced394c3fec5f778bf81e105bcbff0a8106a0e`
- 内容：16 个文件；`RETURN_MANIFEST.txt` 记录其余 15 个文件的 size/SHA-256。
- 独立结果：15/15 manifest 项大小和 SHA-256 一致；全部 JSON 可解析。
- ZIP 使用反斜杠作为部分成员路径分隔符，`unzip` 会给出 warning，但可正常提取；这不是本轮失败原因。
- 当前该返回包仍在 Downloads，尚未写入 A7 中央只读归档和正式状态台账。

### 4.2 关键证据

| 证据 | 结果/哈希 |
|---|---|
| `rc04-product-smoke-summary.json` | PASS；SHA-256 `d7b284aaefad2cb9388946694b1e267f472abd4c9bf7821839c02163382b19c7` |
| RC-04 round 1 | 3/3 PASS；SHA-256 `3388af6c6a890eb54bea9753851d914618330c77ffb4ab33933a27224fd0a5df` |
| RC-04 round 2 | 3/3 PASS；SHA-256 `a677c101214aca7465f612e2f6ea743e41ca6481f0faaac59b989841595fe011` |
| `rc0506-windows-summary.json` | FAIL；SHA-256 `f93b7c00ba07d13bd86187cf70620e4e5e2390bb8c49e628c8a676c2c80956d7` |
| `rc05-runner-windows.json` | FAIL；SHA-256 `eeacd3d21582efc32f6a61bafa7b4927fd39944c4fad5d4cdb9d236676275059` |
| `rc06-storage-windows.json` | PASS；SHA-256 `c50675d5b847007986a81332ae7476e76297d40884ead0f7627962718de48404` |
| `rc0506-windows-fatal.json` | `RC0506_CASES_FAILED:RC05=FAIL:RC06=PASS` |
| `rc0506-process-exit-code.txt` | `RC0506_EXIT_CODE=1` |
| RC-06 production DB | size `49152`；SHA-256 `0070c1167018ca652c54638da8c0a81d922efe44a81013d31ad6e08b6a9b9640`；本地 `PRAGMA quick_check=ok`；事件/FTS 各 2 条 |
| RC-06 corruption probe | SHA-256 `81870940ded84ff0c9149b132979ea003139f66da06ce6af2f3217efea004a2e` |

执行前后 `electron.exe=0`、`spike02_helper.exe=0`，未产生新增残留。返回材料声明未连接 Win7、未改网络/路由/防火墙/PATH/服务/注册表、未重启；现有证据没有显示相反事实。

## 5. RC-05 阻断根因

v3 的 TypeScript/JavaScript harness 在 `release/win7-rc/rc0506-windows-validation.cjs` 中动态注册了：

```text
profile id: rc05-harness-local-probe
executable: packaged electron.exe
args: RC0506_LOCAL_PROBE.cjs positive/bounded/wait-for-cancel
```

但 D-013 原生 helper 还有一个独立且更低层的 C06 内置 allow-list。`spikes/02-terminal-containment/helper/whitelist.cpp` 只允许真实 System32 目录下的：

```text
cmd.exe, where.exe, reg.exe, whoami.exe,
findstr.exe, ping.exe, tasklist.exe, certutil.exe
```

因此 JavaScript registry 通过后，helper 仍会在创建 Job/Restricted Token/子进程之前拒绝 `electron.exe`，返回：

```text
status=capability_unavailable
error_code=CONTAINMENT_UNAVAILABLE
stderr="executable is not in the allow-list"
containment=none
```

这解释了：

- RC05-P02 的正常输出、CP936、截断和 Job assertions 全部失败；
- RC05-C01 从未进入可取消的子进程，故 `cancelled` 与 `job_object` assertions 失败；
- RC05-Z01 仍 PASS，因为被拒绝的请求没有创建新进程。

定性：这是 **v3 验证设计与原生 helper 安全边界不兼容**，不是 Win10 网络或 Job 宿主噪音。helper 的拒绝本身符合 fail-closed 设计。

## 6. 接手 Agent 的第一批动作

按以下顺序推进，不要直接发放 Win7 租约：

1. 将 `return-to-dev-20260816.zip` 按原字节归档到新的 A7 attempt 目录，记录外层 size/SHA-256；保留 Downloads 原件，除非用户另行授权移动。
2. 在正式台账中记录 v3 Windows attempt 的客观结论：`RC04=PASS / RC05=FAIL_CLOSED / RC06=PASS / WIN10=NOT_PASS / WIN7=NOT_PERFORMED / RC=NOT_PERFORMED`。
3. 同步目前落后的文件：
   - `docs/STATUS.md`（当前停在 v3 ready/not performed）；
   - `docs/status/a7-rc-development-latest.json`；
   - `docs/status/a7-rc0506-validation-kit-latest.json`；
   - `docs/status/a7-rc-traceability.json`（RC-05/06 仍描述旧 attempt/v2）；
   - `docs/status/latest-validation.json`（A7 scope 仍是旧 v2-ready 描述，且更早 SPIKE 汇总项也存在历史滞后，修改时需谨慎只更新有正式依据的字段）。
4. 为“JS registry profile 必须与 native helper allow-list 相容”增加自动化回归/合同检查，防止再生成理论上无法通过 helper 的 KIT。
5. 设计 v4 验证路径。优先使用 helper 已允许的 System32 可执行文件配合 KIT 内哈希绑定、本地确定性 fixture 完成输出、边界截断和取消测试；必须保持无外部网络、无 Shell 拼接、严格 argv、工作目录和证据哈希约束。
6. 不要为了让 harness 通过而直接把 `electron.exe` 加入产品 helper allow-list。该动作会扩大 D-013 原生执行面，需要额外安全评审、Win10 精确重建以及 D-013/Win7 重新验收；现有 A7 授权不能默认覆盖这种扩大。
7. v4 修复后先跑定向测试、全量 `npm run verify`、release 合同、文档/JSON、`git diff --check`、路径与敏感文件检查，再确定性生成新 KIT。若产品代码未变，候选 ZIP 应继续锁定为 `39eecb6a...040c9`；若产品字节改变，RC-04/05/06 必须全部绑定并重跑新候选。
8. 只有当前候选的 RC-04/05/06 和完整 Win10 分层门禁均通过、RC-07/08 实现并完成开发机/Win10 验证后，才准备新的 A7 RC Win7 租约和 RC-01～10 实机矩阵。

## 7. 仍未完成的 RC 范围

| ID | 状态 | 剩余工作 |
|---|---|---|
| RC-01 | partial | 干净 Win7 离线安装与首次启动未执行 |
| RC-02 | partial | 开发机 manifest/ZIP 已有；Win7 `certutil` 双向核对未执行 |
| RC-03 | partial | ASAR 外置和锁定哈希已有；最终精确 Win10 PE/API/CRT 总门禁未形成 |
| RC-04 | Windows PASS | 当前 v3 候选 Win10 两轮通过；新 Win7 RC 租约下未执行 |
| RC-05 | blocked | v3 harness/helper allow-list 不兼容，必须修复并重跑 |
| RC-06 | Windows PASS | 当前 v3 候选 Win10 通过；新 Win7 RC 租约下未执行 |
| RC-07 | missing | 升级、故障注入、原版本/数据/manifest 回滚尚未实现和验收 |
| RC-08 | missing | 卸载、数据保留策略和零残留生命周期尚未实现和验收 |
| RC-09 | not performed | A7 RC 管理通道 pre/postflight 和禁止变更核验未执行 |
| RC-10 | not performed | 新签名租约、证据 manifest 和协调器评分未执行 |

## 8. 安全与裁决红线

- 同时只允许一个 `WIN7_LEASE_GRANTED`；当前 A7 没有租约。
- 每轮 Win7 前后必须检查 `BvSshServer=RUNNING`、SSH 22 可用和相关进程零残留。
- 禁止修改 Win7 网络、路由、防火墙、PATH、服务、注册表或重启。
- 所有上传文件必须做开发机 SHA-256 与 Win7 `certutil` 双向核对。
- 交互 winpty、Renderer 终端输入、任意 Shell、高风险/未知 Profile、C05 网络隔离声明继续关闭。
- 原始返回 JSON、DB、transcript 和报告按字节保存，不得“修正文案”或重新编码后冒充原始证据。
- 只有正式协调器可更新 Win7 PASS；任何单项 Windows PASS 都不能直接推出 RC PASS。

## 9. 建议接手时立即运行的只读核对

```bash
cd /Users/qlyf/Developer/win7-agent-a7
git -c core.fsmonitor=false status --short --branch
git -c core.fsmonitor=false log -5 --oneline --decorate
shasum -a 256 \
  release/win7-rc/out/Win7CodingAgent-0.1.0-rc.1-win7-x64.zip \
  release/win7-rc/out/RC0506_WINDOWS_VALIDATION_KIT_20260814-v3.zip \
  /Users/qlyf/Downloads/return-to-dev-20260816.zip
```

预期三个 SHA-256 依次为：

```text
39eecb6a683f90dea12e58dbeee070ec0bc4dd1706a08bd4f1967343e28040c9
9cbe6be7e530c0f57245010db6d21845a925ca38632cda6075924f9aa7172b1e
5e02a7e567df8fcf2323ec96dcced394c3fec5f778bf81e105bcbff0a8106a0e
```

如任一值不一致，应立即停止后续构建或租约工作并按工件漂移 fail-closed。
