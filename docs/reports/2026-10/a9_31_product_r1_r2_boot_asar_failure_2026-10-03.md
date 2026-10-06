# A9-31 product r1：R2 Boot 首失败与物理视图修复

## 直接执行事实

- source `35a19250ed6589f6a7ba35b940a784325970c111`，产品 ZIP `aae71bb0…d2f10c0`、managed 锁 `7593e758…461d3e` 保持原字节。
- R2 执行 pin 为 `d178d5cce87a8e66ea9748d48d53f5fb39fcfe7c7061cc474493bd7d74c416f5`。
- 监督器 PID14800、controller PID34624、实际 Electron PID18792，均直接实测 SID1005 / Session3 / Medium8192 / 非提升 / ordinary / no Host Job。
- Boot request `b8e7fb02155f4f72b3b77d787e6c8685` 于 `2026-10-03T08:43:13.0780248Z` 开始，Electron 22.3.27 / Node16.17.1 / ABI110 已实际启动。
- 原始错误为读取 `package\resources\default_app.asar` 时 ENOENT；堆栈指向外部 driver 的 manifestCheck。driver cases=0、helpers=0、Provider requests=0，没有加载产品 main 或执行工具。
- controller 持有 Electron 实例，creation ticks `639266137931104651`、parent PID34624、真实 exit1、exited=true；本请求为 `FIXTURE_FAILED_TREE_CONFIRMED`，driver.halt=false。这不代表产品功能 PASS，也不代表监督器已退出。

## 原始证据

`.acceptance/a9-31-developer/product-r1/controller-r2-boot-first-failure/` 保存九份远端原始文件，包括 request、controller start/final、driver final/journal、安全 stdout/stderr、Electron 身份 pin 以及监督器/controller ready。
`index.json` SHA-256 为 `1166e30ca7f3fa3db618a206c6faff4b65c099f96ab332227e76887e562d8499`，逐文件绑定路径、尺寸和哈希。原 run 不覆盖、不改判。

## 原因与本地修复

夹具误用 Electron 的 ASAR 感知 fs 读取物理归档，违反已 Accepted 的 ADR-0088。本地 Node 物理闭包检查不能覆盖实际 Electron 虚拟视图，首失败保留。
仅修改已批准的 `product-r1-driver.cjs` 源路径：Electron 下选用内建 original-fs，检查四项必要接口；不可用时结构化拒绝，不回退。普通 Node 使用原 fs。
本地 Node 语法、32 请求检查和 8 物理接口选择/缺失负例通过；准确 verifier 的八项物理 ASAR、缺失、错哈希、额外、链接、缺接口、错 manifest、虚拟视图负向对照通过。
上述选择检查采用受控运行时/fs 视图，明确不冒充修复后真实 Electron PASS；物理包未修改。源/冻结 R2/检查记录的准确字节见 `.acceptance/a9-31-developer/product-r1/r2-physical-fs-repair-checkpoint.json`。

## 当前边界与下一步

R2 普通失败后可等待同冻结版本的新请求，但当前冻结 driver 会重复该错误。批准合同禁止覆盖不可变执行副本，故没有向运行中的 R2 替换 driver 或 pin。
修复后真实 Electron、Shell、后台、退出、恢复和 Win7 仍 `NOT_PERFORMED`；A9-31 保持 `IMPLEMENTATION_IN_PROGRESS`。
下一执行合同见 [R3 有限可复用桌面调度窗口](../../plans/A9_31_PRODUCT_R1_R3_REUSABLE_DESKTOP_APPROVAL.md)。不提交、推送、整合、发布，不改产品/native、账户/ACL/UAC/Bitvise 或历史证据。
