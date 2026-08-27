# A9 Alpha 1 多对话与恢复增量交付追踪

状态：`IMPLEMENTED_DEVELOPER_VERIFIED / WIN7_17_PENDING`
决策：ADR-0098
目标候选：`WIN7-17`
非目标：完整 Review、多窗口、多对话并发、永久删除、搜索/置顶/分支/导出对话。

| ID | 可验收要求 | 当前状态 | 代码表面 | 最小行动 | 确定性验收 |
|---|---|---|---|---|---|
| A9CV-01 | 同一工作区最多 16 个未归档对话；新建、切换、重命名、归档、恢复 | implemented / developer verified | State、Runtime、IPC、Renderer | 已实现版本化对话目录和左侧导航 | CRUD、上限、排序与原子切换测试通过；Win7 待验 |
| A9CV-02 | 对话隔离任务、Turn、Run、审批、checkpoint、草稿和模型文本上下文 | implemented / developer verified | `a9-persistence.ts`、`a9-agent-runtime.js` | 活动对话 ID 已成为隔离身份 | 跨对话审批、checkpoint 与任务负向测试通过；Win7 待验 |
| A9CV-03 | 重启恢复活动工作区、活动对话、完整可见历史，不重放副作用 | implemented / developer verified | Active workspace store、SQLite、Renderer | 已保存活动对话并重建只读历史投影 | 重启恢复、审批 interrupted 与零重放测试通过；Win7 待验 |
| A9CV-04 | Provider 只恢复最近 20 个完整文本轮次且最多 32,000 字符 | implemented / developer verified | Runtime、Agent Loop | 已从持久化用户/助手文本构建有界上下文 | 边界、顺序、整轮和排除工具测试通过；Win7 待验 |
| A9CV-05 | 旧工作区派生 Session 迁移为“历史对话”；备份、SHA-256、事务回滚 | implemented / developer verified | A9 schema v4 | 已实现 v3→v4 事务迁移、备份与哈希核验 | SQLite 迁移、备份头/哈希和失败回滚测试通过；Win7 待验 |
| A9CV-06 | 草稿按对话用 DPAPI 加密；不可用时仅内存 | implemented / developer verified | Runtime、safeStorage、SQLite、Preload | 已实现 D-020 密文存储与内存降级状态 | 密文、重启恢复和失败不覆盖测试通过；Win7 DPAPI 待验 |
| A9CV-07 | 自动/手工标题满足脱敏、长度和控制字符规则 | implemented / developer verified | State、Runtime、Renderer | 已实现本地标题归一化和首次请求自动命名 | 40/80 字符、秘密和空白负向测试通过；Win7 待验 |
| A9UI-CP | 完整 Turn ID 可见、可复制，Diff/撤销绑定完整身份 | implemented / developer verified | Renderer | 已增加复制入口和窄面板换行布局 | DOM 合同与身份绑定测试通过；1366×768 Win7 待验 |
| A9UI-AP | 每对话仅一张有效审批；点击有进度；旧卡/重启卡失效 | implemented / developer verified | Runtime、IPC、Renderer、SQLite | 已实现审批身份投影和 interrupted 决策 | 连续审批、重复点击、切换/重启负向测试通过；Win7 待验 |
| A9UI-ST | Composer 与左栏双入口 Stop；完成以进程树归零为准 | implemented / developer verified | Runtime、Renderer、Main shutdown | 已实现双入口、统一控制状态与退出错误保留 | 生命周期与 UI 合同测试通过；Win7 长期子进程待验 |
| A9PKG-17 | WIN7-17 干净源码、双构建一致、自包含且无秘密 | missing | v3 release builder | 本地检查点后双构建 | ZIP/manifest/778+ 文件、双字节一致、秘密扫描 |

## 继承边界

Full Access、Read Only、Provider tool calling、J1～J5、PowerShell/CMD、编码与路径等已有充分且未受本次
修改影响的证据，按 ADR-0097 记为 `INHERITED_EVIDENCE / OPTIONAL_REGRESSION_NOT_RUN`。每个新候选的
身份、完整性、启动绑定和后飞行不能继承。Review 固定为 `DEFERRED_TO_ALPHA2 / KNOWN_LIMITATION`。
