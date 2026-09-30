# A9-27 / WIN7-42 验证套件

状态：开发机套件检查中；Win7 预演、候选冻结、门 A、正式验收与门 B 均未完成。结论上限为 `A9_27_WIN7_42_A9_26_PASS`，不能从源码或开发机测试签发。

授权依据为 A9-27、A9-28、A9-29（ADR-0147/0148/0149）。W42-01～22 从已冻结的 W41 继承判据，W41 的源码、文件与证据保持不可变。新增 W42-23～30。

## 登记的派生差异

- W41 身份替换为 W42，A9-25 替换为 A9-27；谱系明确保留 WIN7-41 已签结论。
- 首轮及最新成功轮的纯输出命令改为 `C:\acceptance\python38_mvp\python.exe check.py`。脚本只有检测到 calc.ts 的 `return a + b` 才退出 0；按实际内容输出 smoke/projection 标记。输入、执行路径、版本及哈希在目标机核实。
- 继承 M4 热身与历史断言不改；W42-27 独立覆盖无热身加载。其种子补齐十个已结束轮次的 checkpoint，使请求事实与 2,500 条过程事件按真实持久化格式关联；不在选择后提交热身轮。
- W42 实时输出通过新增 `w42RunLiveProcess` 调用继承旅程，仅将模型说明节点与真实持久化 `model_note` 内容配对，排除 A9-26 新增的 AGENTS.md 提示。继承函数、断言 ID、0～1,500 ms 上限和完成前可见要求均不改。
- 新增 `w42-product-probes.cjs`：使用包内 Runtime/Core/Gateway/Workspace、真实 SQLite、manifest 绑定的 D-013 helper 和隔离 loopback 模型夹具。观察写在候选外并记录 SHA-256，Electron 驱动重新核对观察、主机身份及对应 UI。模型夹具不自报产品结论。
- 新阶段独立工作区与数据根均含中文空格。W42-28 复用同一轮继承 Stop/Review 的直接观察，另打开 Stop 历史核对“已停止”。所有阶段结束后保留进程残留检查。

## 新增合同和证据

| 用例 | 直接观察与严格判据 | 证据 |
|---|---|---|
| W42-23 | Git init 后真实编辑/Shell；gitignore 字节 2a0a；status、add dry-run、clean dry-run 不含恢复目录；旧目录补写后重开哈希/mtime 不变 | w42-23-recovery-dir.json |
| W42-24 | 四轮编辑：纯输出 unverified；验证成功 verified 且有依据；分号组合 unverified；成功后 20,000 字符失败输出撤销旧依据；Electron 最新轮为 unverified | w42-24-verification.json |
| W42-25 | 两轮请求各一份项目说明与环境事实、真实 Win7/PowerShell 版本；已知夹具秘密说明拒绝；请求、审计、全部数据文件零秘密命中；UI 同时显示已加载和拒绝原因 | w42-25-context.json |
| W42-26 | HTTP 400 后真实请求由 ≤16000 缩至 ≤8000 字符；重复 400 失败；不可压缩项目说明零请求；真实 Runtime 持久化重复超限失败并由 UI 显示准确文案 | w42-26-context-budget.json |
| W42-27 | 2500 条种子，真实选择 IPC 后查询、零提交、历史行和“加载更早记录”立即可用；IPC 接缝只观察，不注入历史 | w42-27-cold-history.json |
| W42-28 | 真实 SQLite turn_completed 的 outcome=cancelled；真实 Review 过大文件文字含完整中文原因且无英文码；重开 Stop 历史 UI 显示已停止 | w42-28-cancel-output.json |
| W42-29 | 实际 Runtime + SQLite 触发器：tool_start 零编辑；tool_end/最终故障准确保留副作用并停止；控制组可编辑 | w42-29-audit.json |
| W42-30 | 正常 tool_calls/EOF 可编辑；无结束、length、content_filter、stop 矛盾、空流、非法 JSON 均零编辑和 failed | w42-30-provider.json |

每项有可执行负向对照，覆盖恢复目录被暂存、旧验证依据未撤销、秘密进入数据、不可压缩请求发送、热身提交、错误终态、故障后编辑和未完整响应编辑。开发机还以 `6acbb14` 的实际 Core/Renderer 运行相同验收断言，确认旧行为被拒绝；端口桩与 DOM 模型证据不冒充 Win7 实跑。

## 执行和 Gate

按 `docs/plans/A9_27_W42_REHEARSAL_HANDOFF.md` 执行两次独立预演，W42-01 无 authority 时 NOT_PERFORMED，其余 29 项必须全部成立。预演标记 REHEARSAL_NOT_ELIGIBLE。通过后同一源码双独立干净构建，逐字节一致，负责人门 A 签发 authority 与独立 pin 后才能正式验收。

正式报告器要求准确 30 项 case 集、当前候选身份、run ID、ordinary-user / not-elevated Win7 环境与候选外证据哈希。秘密扫描、后飞行、报告复核与门 B 完成后才按用户授权合入 main。历史候选证据只能按合同继承并标记 INHERITED_EVIDENCE。
