# A9-31 R10 精确 UTC 捕获冻结与普通桌面交接

日期：2026-10-04。当前结论：`R10_PREPARATION_VERIFIED_DESKTOP_NOT_PERFORMED`。
本报告只登记新 R10 准入和冻结事实，A9-31 仍 `IMPLEMENTATION_IN_PROGRESS`，Win7 `NOT_PERFORMED`；R9 HALTED 及历史 UNKNOWN 不改判。

## 1. 准确绑定和范围

- 分支 `codex/a9-31-background-tools`；产品 source `35a19250ed6589f6a7ba35b940a784325970c111`，产品/native/managed 输入锁未修改。
- 负责人批准 [R10 合同](../../plans/A9_31_PRODUCT_R1_R10_PRECISE_UTC_CAPTURE_APPROVAL.md) §2–4 及 ADR-0168；批准证据 SHA `ef47799d2506546ec7ccee62026a0d677489b7e6b6e0a2adf0414bac15cd30d6`，原合同字节 SHA `c388ae5ea1fc3eb73cb28f4de371f8d76db0243a0986d6cce31b9cd38c1da8d3`。
- Win10 `192.168.1.4` / WIN-2JQ66JE4HTQ / build19045；新根 `C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R1-20261004-R10`，继承目录权限，未改账户/ACL/UAC/Bitvise/Job/任务/服务。
- 复用 R2 锁定产品 784 文件、Electron 宿主 73 文件及四输入，远端两个不可变 revision 的全闭包复查和准确取时入口均通过。
- Master `2096c020df792abef26864ff8bc0ba1a26013ac42078777a05c1cd4069809625`。
- 普通 revision `fcb9501dbb3c8f6d930a049e09f128cc22303e164c3b10f7e5ed5a2cab7f8a48`，受控 Boot revision `7a69cb5b402e82d612e8f52c6036fa554a668f9b191f618f049cd402db1e8dac`；两者仅 Boot 后新增一次明确普通失败断言的差异。
- 新 capture source `dbc85763ce25287adcb4c853e37963755c56d9561f9d06e41f53bfdb78e952cd`；DLL `5450d5bc193330367bac5735e91774cc4404230075634e73b5b4a05904fa9d0f` / 19968 bytes / MVID `92841b0f-d700-42bf-922a-4fe2ce3bb640`；原始编译返回 `6090e5445c598807605b174a0d9459ef78ed5a37ef59a6bcb808e0da5b72760b`。非产品 D-013/D-017 工件。
- 时钟 Profile `LOCKED_KERNEL32_PRECISE_UTC_FILETIME_V1_TEST_ONLY`，准确 kernel32 `4636f65d449b1353100578c6cb139933cf2b134f5e246119d18968873a058bed`，无粗 UTC 回退、时间容差或晚边界修补。

## 2. 直接准入和受控反例

当前 Node20.17.0：语法、73 原自测、88 回执自测、19 完整 Renderer 字面量表达式解析和本地 784 产品闭包通过。ASAR 八项仅在完整函数（含 LF）、fs/path/crypto 依赖、physicalFs 选择、所有调用和产品/config/hash 相同时登记 `INHERITED_EVIDENCE`，不改绑旧记录。
实际 Win10 PS5.1：三解析、336 schema、27 查询 API、23 区间、16 文件、22 入口/并发、77 回执校验通过。原始显示标签中的 R9 为测试模板保留文本；记录 run-id、当前源码/新 DLL/批准/时钟字段均绑定 R10，不能作为 R9 改判。
区间 stress 101 实际 snapshot、16 明确受控子进程、1394 时间边界比较；真实区间内进程 PID9044 取得原句柄保留和第二 snapshot/第二真实查询的同实例证明。16 个实际退出逐项保留。未来 206 ticks、缺失/错时钟 Profile、二次缺失/父/Session/映像/实例错误、关闭失败与访问失败仍拒绝，构造输入明确标注。

## 3. 首轮失败和 UNKNOWN 保留

- Renderer 首次提取器误选 SQLite `.exec(SQL)`，解析失败原由和工具输出保留；改为仅无成员前缀的完整 `exec` 字面量。未改 Renderer 表达式。
- 准入 schema revision 测试 digest 和 file gate descriptor 遗留引用首失败保留；修复测试绑定并重跑。首次 entry 测试引用旧 launch 不能计入 R10，最终使用当前 launch 全字节重跑通过。
- 冻结验证首轮 stage 的调用子 scope 不保留库函数，`Assert-Master` 未识别，原始输入/stdout/stderr保留；R2 验证显式加载同一冻结库，两个完整 stage 和准确取时入口通过，无源/判据变化。
- 首次同步预检 run `76fb26c50ec24f0da4c0635d6b2a0326` 实际 gap 是 SecondSnapshot，构造 OpenQueryHandle87 反例不证明该 gap 可补证，保留 UNKNOWN。
- 第二次隔离预检 `8a77b0a7b68d42d4ab274435c5e938c5` 的真实 PID137256 为 OpenQueryHandle/87，原始唯一实际只读 cmd-ver 回执与 monotonic 关联通过；77 校验实际输入绑定此 run。实际错误 argv/status7/ENOENT 反例另外保留，其其他原始 query UNKNOWN 不用正例例外补签。
- 管理员/Session0 API、编译和 schema 检查不代替普通用户产品证据。

## 4. 普通执行边界和交接

Computer Use 已打开 A9 Builder CMD，键入和粘贴未进入远端，SSH 只读检查尚无 dispatcher-entry-claim/ready/final；不将尝试写成启动。已给负责人一次性普通桌面入口，后续由 SSH 固定请求调度；不得用管理员 Session0 替代或恢复旧 R9。
普通验证当前全部 `NOT_PERFORMED`：受控 Boot 普通失败→同一控制器正常 Boot，以及 Shell、EncodingSecurity、Background、FailureBoundaries、StopExit、ReleaseExit、Recovery。release 丢回执/取消竞态及真实 Core/SQLite/UI 移交仍必跑；生命周期未知继续停止下游。

原始 R10 准备返回 163 文件 / 3177366 bytes 全部核对 SHA-256；本地 `.acceptance/a9-31-developer/product-r1/r10-preparation-return/`，准确 inventory 见 `r10-preparation-return-review.json`。冻结清单 `r10-freeze.json` SHA `b4003c41cc93ae388a120d1bb957da42c622d1be9661467a9aa2b0062416c08b`，成功冻结验证 `r10-frozen-verification-r2.json` SHA `1b735bbf18a28d56ae06c0e6c195cf0d855333fcad8abdb5e94f82cb65d79e6e`。无提交/推送/合并/发布/删除/委派/Win7 候选操作。


## 5. 后续真实桌面启动与普通夹具修复

负责人启动后，真实 R10 dispatcher PID122268 / creation639266767036313449 / master2096c020…9809625，SID1005 / Session3 / Medium8192 / Ordinary / 非提升 / 无HostJob。原“待启动”结论对应较早只读快照，原文保留。
受控 Boot run b007338497094d8b8d09b6e147a33fe7 按预期 ASSERT:CONTROLLED_ORDINARY_FIXTURE_FAILURE；两个层级实际树均结束、退出码已取得，无未知。同一 dispatcher 接受正常 Boot run96f27fe5c0354a97b7979420ea0744fa（8项）与 Shell rund1a3aa48baea47e0ab98d554071ed304（22项），两项直接事实审查通过。
EncodingSecurity 首轮 run3dedee244652435897fc8e7ea5ea97b9 在第65个断言 `slow-native_REAL_NATIVE_DECODE_EXIT` 失败。固定传输源码 child close 对串行 delivery 的等待预算是5000ms，原夹具每回调700ms仍要求完整正常输出；真实返回5974ms/A9_OUTPUT_BACKPRESSURE，树清理证据已确认，无capture/security/audit/identity/未知生命周期硬门失败。
原700ms输入原样保留，修订普通driver把它作为结构化失败/清理负例；新增180ms预算内慢消费者完整双源输出正例。旧失败不会改判。新 driver revision2637f296c7bb2a181643cdc2dad08c34c0db0875a16725e91a168b2c7092e972，73/88/19定向检查及同一精确产品784/宿主73重新装配校验通过。三PS/C#/DLL/build/master/两个回执安全片段字节不变，只使用R10 §4已授权的普通driver不可变版本重试。
原始 driver-final UTF8文件另外通过 SFTP 直接回收，SHA7a200571bdb1db06b4d4cd41456e5fbc29e16203889249fde1dcb6be6301fb62；管理员SSH的默认控制台中文编码观察不代替这个原始文件。失败结果的零raw摘要不冒充完整接收字节计数，原始raw/chunks保留作为部分输出诊断；不据此宣称正常Shell的完整字节合同通过。
本节时点 EncodingSecurity 新 run95c88929c1d04ae3bd840fb378f0c6ef已派发；其余下游以实际完成报告追加，未执行仍NOT_PERFORMED。

## 6. 最终现场结果入口

EncodingSecurity run95c88929c1d04ae3bd840fb378f0c6ef实际70项PASS；随后Background必需归属审计失败，R10已按原合同停止。[最终部分通过及失败报告](a9_31_r10_partial_pass_and_windows_ownership_failure_2026-10-04.md)登记六run、原始返回/矩阵、实际退出和后飞行。较早准备/待启动/已派发时点原文保留，不解释为当前八组PASS。产品/native/锁未修改，三路径修复待具体批准。
