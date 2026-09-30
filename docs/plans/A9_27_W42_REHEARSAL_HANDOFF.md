# A9-27 WIN7-42 连续两次预演交接书

Status: DRAFT_PENDING_KIT_REVIEW

授权：[A9-27](../tasks/A9_27_WIN7_42_REISSUE_AND_ACCEPTANCE.md)、ADR-0147。执行方为 W42 执行代理，审核方为主代理。
本文件只有在套件开发机门与审核通过、记录准确构建提交后，才改为 READY_FOR_EXECUTION。
两次预演均为 `REHEARSAL_NOT_ELIGIBLE`，不生成 authority，不计入正式 Win7 结论。

## 1. 身份与边界

- 候选谱系来自 WIN7-41，能力集版本为 `0.3.0-alpha.1`；全部证据使用 W42 新目录和新任务名。
- 构建输入沿用 W41 锁定的 Electron、D-013 v25-r15、A6 SQLite ZIP，分别复算并与 W42 输入锁核对。
- 目标 `192.168.1.3`；严格 SSH 参数沿用 [WIN7-40 §4.1](A9_25_WIN7_40_ACCEPTANCE_HANDOFF.md)，`HostKeyAlias=192.168.1.11`。
- SSH 管理账户只承担传输、哈希、计划任务注册/回读及证据取回。产品只在 `agent` 控制台运行中会话、Medium 非提升令牌下执行。
- 不读取、输出、复制私钥，不安装软件，不切换会话、不改变 DPI 或产品窗口状态。

## 2. 开始前

在干净隔离工作树以准确 W42 套件提交构建一次，两次预演使用同一 ZIP。构建失败即停止。
本机新建 `.acceptance/rehearsals/A9-27-W42/<时间戳>/`，含 build、R1、R2；每次保存 scripts、原始输出和 evidence。
Win7 运行根为 `C:\A9-W42\预演 目录\<时间戳>-R<n>`，ASCII 暂存根为 `C:\A9-W42\stage\<时间戳>-R<n>`。
所有根须事先不存在，历史根、候选和证据保持只读。

## 3. R1 与 R2 各自执行

1. 保存 `ver`、`query user`、`tasklist /v`、WMIC 进程表；按 agent 所在行确认 console 运行中，无 Electron 残留。
2. 上传 ZIP，Win7 `certutil` 复算与本机一致后展开；只在本次运行根授予 agent 所需写权限。
3. 任务 XML 以 CP936 注册，使用已知 agent SID、InteractiveToken、LeastPrivilege；CMD 为 CRLF、ASCII（中文自检例外）。回读逐字段核对任务名、命令、完整参数、工作目录、SID、LogonType、RunLevel；必要时用 Task Scheduler COM 导出，保留 UTF-16LE 原始副本。
4. 自检任务核实 agent 身份、Medium 且非 High 令牌、中文参数原样传递，并核实 Python/Git 版本、SHA-256、可执行性。不可用时停止依赖项，不安装工具。
5. 完整性入口因预演没有 authority 记 `NOT_PERFORMED`，不得造临时 authority。以 agent 调用包内 Electron 的 Node 模式执行 `validation\a9-win7-42-smoke.cjs`，证据根设到本次根下，保存控制台原始字节、退出码和阶段报告。
6. 完成后保存进程表，核对停止用例 PID 和 Electron/helper/测试 Shell 残留；有残留先记录，不能先强杀再报零残留。逐项删除本次计划任务并保存输出，复算 ZIP 哈希。
7. 取回 evidence 与 scripts，Win7 与本机逐文件核对字节数和哈希。归档条目反斜杠归一化，拒绝越界与重复路径。大归档可用严格 sftp reget 续传。

R1 冒烟失败但未触发硬停止时，仍完成 R1 后飞行并执行 R2，观察是否可重复。
主机键、认证、会话、令牌、ZIP 哈希、任务回读门失败时停止后续步骤，含未开始的 R2。

## 4. 判定与交回

W42-01 因预演无 authority 为 NOT_PERFORMED；W42-02～28 必须在两次预演中全部成立。
继承 W41 用例全量执行；验证命令派生差异须记录。新增 W42-23～28 逐项保存产品运行后的观察，不能用配置值或源码存在代替。
W42-26 保存两次实际 Provider 请求字符数与结果；W42-27 保存选择工作区后、首轮前的 queryEvents 调用顺序。
扫描全部证据（含数据库与二进制）的秘密，逐条分类脱敏；零真实秘密才可进入下游。不得打印已知秘密。
每步立即追加 RUN_LOG.md 并记录其哈希；修正自产文件使用新文件名，保留旧文件。
生成 SHA256SUMS 与 REHEARSAL_REPORT.json，记录构建源、ZIP 哈希、两轮全部阶段/断言/用例原值、偏差、后飞行与差异。
审核方依据原始证据确认两次均全部成立后，才起草正式实机交接书并双构建冻结；预演结果不签发正式 PASS。
