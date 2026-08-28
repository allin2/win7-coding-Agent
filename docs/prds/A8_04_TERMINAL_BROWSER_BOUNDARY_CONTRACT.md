# A8-04 Terminal / Browser / Runner / Settings / Diagnostics 合同

Status: `FROZEN_FOR_A8_04_IMPLEMENTATION`

Stage: `A8-04`

Gate: `A8_04_RUNNER_TERMINAL_BROWSER_SETTINGS_DIAGNOSTICS_PASS`

Source: `docs/tasks/A8_AGENT_FIRST_PRODUCT_EXPERIENCE.md` §2、§3、§4

## 1. 目的与范围

A8-04 只把已冻结的能力边界呈现为可验证的产品状态，并补齐 Runner、Terminal、Browser、Settings 和
Diagnostics 的真实 Renderer/IPC 证据。它不新增任意 Shell、交互 winpty、模型控制用户终端、任意公网
浏览、Git 写操作、新网络目标或未登记 Runner Profile。

## 2. 能力合同

| ID | 能力 | 允许行为 | 必须拒绝 |
|---|---|---|---|
| A8T-01 | Terminal | 页面明确显示 disabled/fail-closed；诊断说明需要新 Runtime Profile | 输入、按键、粘贴、控制序列注入；任意 stdin；复用旧 winpty |
| A8B-01 | Browser | 页面明确显示 disabled；只保留可信本地/登记内网设计说明 | 任意 URL 导航、远程网页、用户浏览器接管、未登记网络 IPC |
| A8R-08 | Runner | 只展示 Host 注入的已登记低风险结果；stdin closed、超时、输出上限、终止与审计事实可见 | Renderer/模型拼接命令、任意 Shell、未登记 Profile、把模型文字当 PASS |
| A8D-01 | Settings | Gateway/CA/model/API key 通过精确 IPC；API key 输入为 password，保存状态只显示布尔元数据 | 回显凭据、写入普通事件/报告、隐式建立网络连接 |
| A8D-02 | Diagnostics | 能力、System Prompt 版本哈希、错误、原始事件和边界状态可按需查看 | 把验收术语放回日常任务；输出敏感值或可逆凭据 |
| A8C-03 | C17/C19 | Preload 最小 API、CSP、导航/窗口/权限/出站 deny-by-default；终端输出按不可信数据处理 | Renderer 文件/进程/凭据/任意网络能力；模型注入用户 Terminal |

## 3. 验证矩阵

1. 静态 Renderer：Terminal/Browser disabled 文案、Settings password 输入、Diagnostics 按需抽屉、无
   未登记 Preload 方法。
2. IPC 负向：`terminal.input` 返回 `CAPABILITY_UNAVAILABLE`；未知 A8 action、额外字段、错误 session
   全部结构化拒绝；无工作区/进程/网络副作用。
3. Runner：Runner manifest/helper/profile 哈希绑定；RunnerLog 清除 OSC/CSI、危险链接和控制字符，
   超出 64 KiB 保留上限并标记 truncation；Host 结果通过事件进入卡片。
4. Settings/Diagnostics：配置 fake key 后 Renderer 不回显，状态与诊断不含原值；Replay 默认不出站；
   System Prompt 版本/hash 可见。
5. 真实 Electron：生产 BrowserWindow + Preload + IPC + Host + Renderer 生成 JSON/PNG；8 项 A8-04
   case 必须全部 PASS：Terminal disabled、Browser disabled、Runner presentation、RunnerLog boundary、
   Settings redaction、Diagnostics/System Prompt、terminal.input fail-closed、CSP/Preload boundary。

## 4. Gate 边界

A8-04 开发机通过只解除 A8-05 实现。Terminal 在新 Profile 和 Win7 证据缺失时必须继续 disabled；
Browser 仍不得扩展到任意网页。Electron 22.3.27 x64、Win10、Win7 和 A8-06 三层产品验收不由本合同
单独宣称 PASS。
