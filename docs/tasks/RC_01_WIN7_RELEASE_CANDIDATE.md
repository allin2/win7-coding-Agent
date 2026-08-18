# RC_01 — Windows 7 v1 自包含发布候选

## 0. 实现授权（ADR-0011 / C14）

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: RELEASE_CANDIDATE
Target Branch: codex/a7-release-candidate
Phase-Gate: APPROVED_FOR_IMPLEMENTATION
Win7-Compatibility: PROVISIONAL
Win10-Validation: PASS
Win7-Validation: NOT_PERFORMED
Blocking-Reason: WIN7_RC_ACCEPTANCE_NOT_PERFORMED
```

授权依据：项目负责人 2026-08-12 明确批准在 A4/A5/A6 唯一干净收口提交
`793cc4799c81d9dc27d236826a344a39d86137ec` 上启动 A7。该提交记录
`A7_GATE=PASS_FOR_WIN7_V1_RC`，但不构成 RC 构建或 RC 实机验收结论。

### 0.1 允许路径

- `release/win7-rc/**`（RC 目录、安装/升级/回滚/卸载脚本、manifest、SBOM、许可证和证据模板）
- `scripts/release/**`（确定性打包、校验、安装生命周期与残留检查工具）
- `src/shell/product/**`（仅 RC 装配、启动与 fail-closed 能力路由）
- `src/runner/**`（仅接入已验收 D-013 非交互 Profile，不扩大命令面）
- `src/state/**`（仅接入已验收 D-014 本地 SSD Profile）
- `docs/status/**`、本文档及 `docs/tasks/README.md`（RC 状态和证据台账）

禁止修改 D-013/D-014 已验收原始证据，禁止引入交互 winpty、任意 Shell、模型终端输入、
未登记网络目标或新的系统配置能力。任何额外产品能力必须另行授权。

项目负责人于 2026-08-14 明确授权本任务修复 `src/runner/src/output.ts` 的有界输出
多字节截断边界，并在 `src/runner/tests/**` 增加对应 CP936/UTF-8 回归测试。该授权只修复
C11 编码与既有输出上限合同，不增加 Profile、命令、权限、网络或交互能力。

## 1. RC 固定合同

| 项目 | 锁定值 |
|------|--------|
| 交付模式 | `SELF_CONTAINED_OFFLINE_WIN7_X64` |
| 客户端运行时 | Electron `22.3.27` x64；内嵌 Node `16.17.1`；Electron ABI `110` |
| Runner | D-013 v24 低风险非交互 Runner；helper SHA-256 `7f86dac89862b2c61d55fe83ba00bf7cdaa69714d24d0f9d21b62f9040d1c134` |
| Storage | D-014 `better-sqlite3 8.7.0` / SQLite `3.43.1` / FTS5 / WAL；本地 SSD Profile `E22-SQLITE343-LOCAL-SSD` |
| 原生模块 | `.node`、helper 和伴随 DLL 必须在 ASAR 外置，启动前按发布 manifest 校验 SHA-256 |
| 终端 | 不包含 D-011 winpty/node-pty 交互终端；Renderer 不存在输入、粘贴或发送按键能力 |
| 发布材料 | 单一版本 manifest、完整文件哈希、SBOM、第三方许可证、来源与 EOL 风险、安装前置 |
| 生命周期 | 安装、启动、升级、失败回滚、卸载；每轮结束 Electron/Node/helper/SQLite 锁与临时文件零残留 |

SQLite 原生文件继续锁定为
`better_sqlite3.node = 7138aa2365e0027ced9bc8ae356097b31776d084a5a8f91cc2d3677785e915cc`。
任何锁定工件漂移、ASAR 布局漂移或缺失许可证均使 RC 构建 fail-closed。

## 2. 能力边界

- 只开放登记的低风险非交互 Runner Profile，结构化 argv、stdin 关闭、超时、输出上限、合作取消、
  Job 回收和 ACL 回滚全部保持强制；任意 Shell、高风险和未知 Profile 拒绝。
- Job Object、Restricted Token 与 ACL 不提供网络隔离。RC 不宣称本地断网能力，不修改 Win7
  网卡、路由、防火墙、PATH、服务、注册表或系统策略，也不重启目标机。
- 本地持久化只支持已验收的 NTFS 本地 SSD Profile；HDD、网络盘和未知介质不得继承性能结论。
- A4/A5/A6 的单项 Win7 PASS 仅是 RC 输入，不得写成 RC PASS。

## 3. 构建与验证分层

1. **开发机 PASS**：全量 lint/build/test、打包确定性、manifest/SBOM/许可证闭包、路径与敏感文件扫描。
2. **Win10 PASS**：精确 Win10/VS2019/v142/SDK 10.0.19041 工具链生成最终原生闭包；ZIP、PE/API/CRT、
   Electron ABI、ASAR 外置和本机 smoke 均通过；本地 SHA-256 与返回 sidecar 一致。
3. **Win7 PASS**：只能由新的 RC 签名租约和协调器评分产生。上传前后以开发机 SHA-256 与 Win7
   `certutil` 双向核对，执行安装、首次启动、升级、失败回滚、卸载和零残留矩阵。

三个层级必须分别记录，任一层不得冒充另一层。

截至 2026-08-19，唯一候选
`Win7CodingAgent-0.1.0-rc.1-win7-x64.zip`（SHA-256
`39eecb6a683f90dea12e58dbeee070ec0bc4dd1706a08bd4f1967343e28040c9`）已取得完整
`Win10-Validation: PASS`：RC-04/05/06 产品层验证、RC-07/08 v2 生命周期矩阵均通过，RC-03 由候选
内两个 ASAR 外置原生文件与既有 Win10 PE/API/CRT PASS 返回包的逐字节同哈希关系收口。机器可读
证据为 `docs/status/a7-win10-rc-closeout-latest.json`。该结论不改变 Win7 与 RC 的
`NOT_PERFORMED`，也不授权复用旧租约。

## 4. 唯一 Win7 租约

- A7 不复用 A4/A5/A6 的租约、run ID、签名或生命周期状态；必须申请新的 RC 专用 Ed25519 租约。
- 同时只能存在一个 `WIN7_LEASE_GRANTED`。每轮前后必须确认 `BvSshServer=RUNNING`、SSH 22 可用，
  并检查 Electron、Node、helper、安装器与本轮子进程零残留。
- 任何 preflight/postflight、工件哈希、主机身份、残留或回滚失败都进入 fail-closed；恢复完成前不得
  签发新租约。

## 5. RC 验收矩阵

| ID | 验收项 | 通过标准 |
|----|--------|----------|
| RC-01 | 离线闭包 | 干净 Win7 无在线下载即可安装和首次启动；全部前置已声明 |
| RC-02 | 工件完整性 | 外层 ZIP、发布 manifest 与每个运行文件的开发机/Win7 SHA-256 双向一致 |
| RC-03 | ASAR/ABI | 原生模块外置、ABI 110、x64、静态/登记 CRT 与禁用 API 扫描通过 |
| RC-04 | 产品启动 | Electron 主进程、Core、低风险 Runner 与本地 SSD Storage 正常装配；禁用能力明确显示 |
| RC-05 | Runner | 低风险结构化命令、输出、取消和回收通过；交互输入/任意 Shell/高风险负向全部拒绝 |
| RC-06 | Storage | WAL/FTS5、重启恢复、Unicode/空格路径、上限清理和本地 SSD Profile 校验通过 |
| RC-07 | 升级回滚 | 升级成功；故障注入后恢复原版本、数据与 manifest，且无混合版本 |
| RC-08 | 卸载清理 | 产品文件、注册入口（若任务实现）、临时目录、进程和锁零残留；用户数据保留策略明确 |
| RC-09 | 管理通道 | 轮前轮后 Bitvise RUNNING、SSH 22 可用，未修改网络/路由/防火墙/PATH/服务且未重启 |
| RC-10 | 证据评分 | 协调器验证签名租约、全部 required case 和 evidence manifest 后才可给出 `WIN7_PASS` |

## 6. 完成条件

- 形成唯一 RC ZIP、sidecar、发布 manifest、SBOM、许可证闭包和安装生命周期证据包。
- 开发机 PASS、Win10 PASS、Win7 PASS 分别绑定精确提交、工件哈希、环境和日志。
- `git status` 干净，所有跟踪 JSON 可解析，`git diff --check`、路径白名单、依赖、TODO/Mock、私钥、
  `node_modules` 与缓存跟踪检查通过。
- 在完成上述条件前，本任务始终保持 `Win7-Validation: NOT_PERFORMED` 或客观 fail-closed 状态，
  不得标记 RC 完成。
