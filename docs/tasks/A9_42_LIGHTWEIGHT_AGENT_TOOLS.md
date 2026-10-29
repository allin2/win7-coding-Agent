# A9-42 — Win7 轻量工具与文档能力

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: EXECUTION_CAPABILITY
Target Branch: main
Source Baseline: 6ea0b9af67145603f5991cd441bdc4c9af658d4c
Phase-Gate: A9_42_IMPLEMENTATION_AUTHORIZED
Win7-Validation: NOT_PERFORMED
```

## 1. 授权与交付结果

2026-10-29 America/Los_Angeles，负责人在六项必要性评估后要求：
“下面你作为总经理开始推进，我是投资人；使用平民模式”。
按 ADR-0290 登记本轮本地连续交付范围。调度沿用本线程已确认模型和参数，员工串行。
主会话负责跨层契约、整合与结果；独立工作包可在工具创建的工作树内实施。

| 交付项 | 用户可观察的结果 | 轻量边界 |
|---|---|---|
| 编辑结果反馈 | 模型得到实际改动、首改动行和明确截断信息 | 有界局部 diff；复用编码、原子写、checkpoint 与脱敏 |
| 环境能力信息 | 模型知道系统、Shell、工具位置及可用性证据不足的原因 | 有界 PATH 发现；不启动探测进程；不把存在当作运行成功 |
| ask_user | 工作台呈现问题与选项，等待回答后继续；可取消及恢复 | 复用会话、事件与 Schema IPC；等待时无模型请求或轮询进程 |
| Skills 按需加载 | 仅索引名称与描述，需要时读取正文 | 受控目录和大小上限；不引入插件市场、自动安装或权限授予 |
| read_image 全链路 | 受支持图片经既有权限链传给支持视觉的模型，并显示明确结果 | 本地按需处理；像素、数量、字节有界；历史保存引用及元数据 |
| Office Lite | 明确可读、可生成或修改副本的格式与保真范围 | 可选能力；核心端不默认加载办公引擎；依赖路线单独决定 |

顺序为编辑反馈与环境信息、问询与 Skills、图片与 Office Lite。顺序不是范围缩减。
新功能和重大交互先用真实渲染代码及桩数据展示最小演示，再连接产品链路。
演示和开发诊断放在 `outputs/a9-42-tools/`；不作为目标机验收证据。

## 2. 行为与兼容性边界

2026-10-29 负责人追加“实现Office Lite”，批准本地可选 DOCX/XLSX 方案进入实现及依赖验证。
沿用 main `6ea0b9af…` 加前五项与 A9-41 未提交修改。允许项目内锁定与安装该模块依赖，
不授权系统/全局安装、远端服务、提交推送、目标机操作或发布。
PDF 引擎未定，继续显式返回不支持，不借此启用不兼容 Node 16 的 PDF.js。

沿用 Electron 22.3.27 / Node 16.17.1 产品运行时，开发机 Node 20.17.0。
不新增常驻进程、不全盘扫描、不引入无界缓存、不自动安装工具。
环境探测保留 UNKNOWN；按需执行版本命令须继续通过现有 Runner、Policy、取消与审计。
编辑反馈不改变唯一锚点、基线检查、原子写、编码、BOM、换行及恢复语义。
问询和操作批准分离；等待超时、关闭、取消及重启不能产生同意或授权。
Skills 是任务资料，不能授予权限或覆盖项目与安全规则。
图片必须贯通 Workspace/Core/Gateway/IPC/UI，不能只登记名称或假报视觉支持。
图片及文档内容只走用户配置且被授权的数据通道，不新增远程服务或静默上传。
Office Lite 先评估 DOCX 正文与表格、XLSX 单元格与表格、PDF 文本。
复杂原稿保真、公式重算、OCR、版面渲染分别声明；不能用文本回读冒充视觉保真。

本轮允许本地方案、文档、产品实现、局部修复和必要构建验证。
新增第三方依赖或外部程序先形成具体方案，并按 C15/C16 登记与获得适用决定。
重大权限、安全或产品方向变化停止受影响动作，独立工作继续。
不授权提交、推送、发布、目标机连接、系统修改、删除、正式门 A/B 或真实产品模型请求。
已有归档、治理与 A9-41 工作台修改全部保留；不改判历史候选。

## 3. 契约与必要验证

首批加法契约见 ADR-0298。后续跨层协议在实现前登记；持久化格式须版本化。
性能预算沿用 [PERFORMANCE_BUDGET](../PERFORMANCE_BUDGET.md) 对应指标编号，不另造数值门槛。
本批启动、空闲、峰值、反复操作与释放的新增实测在取得证据前均为 UNKNOWN。
结构上无新进程不等于已证明 Win7 轻量预算。

| 变化 | 必要直接验证 | 能抓住的错误 |
|---|---|---|
| 编辑反馈 | Workspace 成功、拒绝、非 ASCII、BOM/CRLF、大改动与输出截断 | 写入正确却反馈错误；反馈无界；既有写入保护回退 |
| 环境信息 | Win7 路径、不可读/超限、无 PATH、文本边界、实际 Core 注入 | 跨宿主路径拼错；未探测误称缺失或可用；提示注入或无限扫描 |
| ask_user | 真实 main/preload/IPC/state 链、取消、迟到回答、重启与多会话绑定 | 错会话恢复、重复执行、无回答自动同意、等待泄漏 |
| Skills | 有界索引、正文按需、路径逃逸、敏感内容、损坏元数据 | 读取越界、权限提升、全量常驻或静默失败 |
| 图片 | 文件身份、格式/体积拒绝、模型能力门、序列化与释放 | 二进制误入文本历史、模型不支持仍发送、内存无界 |
| Office Lite | 适用闭包、支持/拒绝样例、原件不变及副本回读 | 格式假支持、原件破坏、结构丢失、重算或保真误报 |

先编译依赖，测试当前构建输出和真实消费者。只运行受影响检查、docs:check 与 diff 检查。
同类失败两轮先最小诊断；完整性、安全或生命周期未知停止依赖动作。
开发机、产品 Electron 与 Win7 分开记录。Win7、正式验收及发布当前均为 NOT_PERFORMED。

## 4. 执行记录

- 起点：main `6ea0b9af…` 加既有未提交修改；本轮尚无运行结论。
- 编辑反馈、环境信息进入实现；其余四项保留待交付。
- Office Lite 的本地依赖闭包与可选服务路线尚未裁决，不借本任务引入依赖或服务。

### 4.1 开发阶段记录

主会话完成环境信息及 Skills 目录的开发实现，Skills 正文通过普通 read 按需加载。
开发机 Node 20.17.0：Core 环境与 Skills 整合 14 项 PASS；Shell Provider 与运行时 27 项 PASS。
Shell 使用本地模型夹具，不代表真实产品模型或 Win7。日志暂存 `/tmp/a9-42-skills-integrated.log`、
`/tmp/a9-42-runtime-tests.log`。Skills 首轮测试出现 readSync 重载的断言类型错误，0 项执行；修正后通过。

问询真实组件及最小交互演示已制作并展示，尚未接入产品 IPC/State。
首轮演示内联字符串换行造成语法错误，修正后预览无控制台错误。
材料：`outputs/a9-42-tools/interaction-demo.html`；不作为产品链路证明。

编辑反馈已派给确认的 DeepSeek 员工，独立工作树执行；本阶段派单 1 次。
等待窗口结束时仍 running，无失败证据；完成自动唤醒后整合，不重复派单。
问询全链路、图片全链路与 Office Lite 尚未交付；Win7 实机为 NOT_PERFORMED。

### 4.2 主工作区整合（2026-10-29）

编辑反馈与问询员工交付已合入 main `6ea0b9af…` 加本轮未提交改动；保留原有 A9-41 及归档修改。
编辑反馈原始内容先过敏感检查，Core 再次屏蔽敏感预览；no-op 不建立 checkpoint。
问询已接 Core/State/Runtime/Schema IPC/preload/真实 workbench；复用 SQLite 事件，无新表或迁移。
主会话修复旧答案重复请求清空新问题、恢复前失败缺少生命周期身份两处问题。
已识别凭据的答案在落盘和请求模型前拒绝，沿用现有凭据判定范围，不宣称任意秘密检测。

图片已接 Provider 显式开关、Core 临时输入、Gateway 多模态序列化、main nativeImage 注入、
会话绑定预览 IPC 与真实 workbench。主会话补齐 Gateway 转换丢图片字段问题。
默认关闭，切换模型或地址后重新启用；历史仅含元数据。图片底层员工仍在补边界修复与验证，未整体交付。
图片最小交互演示已展示：`outputs/a9-42-tools/image-demo.html`；是假图数据，不是 Electron 解码证据。

直接证据均为开发机 Node 20.17.0、当前依赖先构建后测试：

| 范围 | 直接结果 | 日志 |
|---|---|---|
| 环境、Skills、Core 问询整合 | 22 项 PASS | `/tmp/a9-42-merged-core.log` |
| 图片 Core 生命周期：请求2张/轮4次、挂起丢弃、取消 | 4 项 PASS | `/tmp/a9-42-image-loop-r2.log` |
| 问询 Runtime/IPC/SQLite/重启、图片组件真实交互 | 12 项 PASS | `/tmp/a9-42-image-question-ui.log` |
| 图片 Runtime→Gateway→本地 HTTP、现有工作台合同 | 51 项 PASS | `/tmp/a9-42-image-ui-r2.log` |
| 编辑反馈及敏感数据真实模型请求投影 | Workspace 16、Shell 29 项 PASS（此前直接结果） | `/tmp/a9-42-edit-integrated.log`、`/tmp/a9-42-edit-product-r2.log` |

问询新增反例已证实：旧答案不能抹掉新问题；等待时不继续请求；答案落盘后 Provider 返回 400，
内存恢复和重启恢复两条路径均显示中断，重启后通过既有继续链传递已答事实，旧队列不重放。
图片真实服务夹具验证下一次请求含像素、再下一次不含、数据库/快照不含 Base64，预览拒绝错会话、变化与过期引用。
解码器为注入夹具；产品 Electron 真解码和 Win7 仍 NOT_PERFORMED。

首失败保留：`/tmp/a9-42-product-integrated.log` 中图片测试漏传已有 Provider 必需 URL；修正测试调用后通过。
`/tmp/a9-42-image-loop.log` 中重复同一路径触发既有循环检测；改用不同路径隔离测试图片限额后通过，未弱化循环保护。

打包闭包只读确认：`scripts/release/build-a9-product-v3.mjs` 复制整个 `src/shell/product`，
新图片服务、图片/问询组件随产品目录纳入；运行时模块仍由当前源码构建。实际打包 NOT_PERFORMED。
Office Lite 的[支持矩阵与候选依赖](../plans/A9_42_OFFICE_LITE_SCOPE.md)已完成；新增依赖验证待投资人决定，
不宣称办公格式已支持。资源预算 #1/#2/#3/#10 本批新增实测 UNKNOWN。

### 4.3 本地开发交付收尾

图片员工交付已按复制前 SHA-256 核对并整合。JPEG 扫描至 EOI，拒绝多 frame、异常边界和尾随数据；
本版仅接受 baseline/progressive JPEG。PNG 允许合法位深与交错标记，仍拒绝动画和越界尺寸。
头部检查不是完整解码证明；最终有效性由 nativeImage 解码再检查尺寸和规范化输出。
主会话修正员工过窄的 PNG 位深判据及 JPEG 截断长度读取，Gateway 保持只接收规范化 PNG。
clear 使用 generation 拒绝进行中的旧 read/preview 发布；引用仍绑定会话与源文件哈希。

主工作区最终直接检查：

- Workspace 图片原语 11 项 PASS：`/tmp/a9-42-final-workspace.log`。
- Gateway 真实 HTTP 多模态序列化 5 项 PASS：`/tmp/a9-42-final-gateway-r2.log`。
- Shell 图片 service 与 Runtime/IPC/Gateway 集成 8 项 PASS：`/tmp/a9-42-final-image-product.log`。
- State 问询落盘与恢复 6 项 PASS：`/tmp/a9-42-state-integrated.log`。
- 以上入口先构建当前依赖；七模块编译与 Shell 静态检查 PASS，开发 Node 20.17.0。
- Gateway 合流首失败是测试仍期待 JPEG URL；改为契约指定的 PNG 期望后通过，原失败日志保留。

前阶段定向结果按 §4.2 保留，不把员工全模块结果作为主工作区直接证据。
所有本轮 `/tmp/a9-42-*.log` 已复制到 `outputs/a9-42-tools/logs/`；
当前修改源码逐文件 SHA-256 见 `outputs/a9-42-tools/source-manifest.json`，绑定 main `6ea0b9af…` 加未提交字节。
未生成正式候选，不改判历史 Win7 结论。

五项工具改动完成本地开发交付。Office Lite 已交付支持/拒绝矩阵、保真声明与具体依赖候选；
依赖安装和办公产品实现 NOT_PERFORMED。六项整体仍不能标为 Win7 产品交付完成。
原生 Electron 真解码、打包运行、Win7 实机、真实模型、正式 Gate、提交推送发布均 NOT_PERFORMED。
不新增常驻服务或第三方运行依赖；不据此宣称内存/启动预算达标。

按 project-artifact-cleanup 技能完成只读盘点，原始观察与保留理由在
`outputs/a9-42-tools/closeout-inventory.json`、`closeout-disposition.json`。
三个员工工作树均含未提交差异或独有交接/构建输出，保持 KEEP；输出与合流副本保持 KEEP。
共享 node_modules 符号链接未跟随扫描；未删除、移除工作树或修改共享缓存。
逻辑字节不是可回收空间，实际可回收与进程占用为 UNKNOWN。

### 4.4 Office Lite 实施（2026-10-29）

负责人明确要求“实现Office Lite”，本地 DOCX/XLSX 可选方案及依赖准备进入实施。
主会话保留当前 Sol/xhigh/default 配置，员工沿用确认的 DeepSeek/xhigh，单名独立工作树。
原 main、前五项与 A9-41 未提交内容保持。协议与资源边界登记 ADR-0302。
办公引擎/ZIP 有界解析由员工实施；主会话负责文件/线程/工具/运行时/打包和整合验证。

依赖位于独立 `src/shell/office-lite`，不改变根依赖或目标机前置。最终可选运行包包含完整锁与许可证。
新增安装均禁用生命周期脚本，来源为 npm 官方注册表；目标机不执行 npm。
docx 固定 8.0.0，避免候选新版本的 nanoid 5 / Node 18 传递要求。
本版直接解析 DOCX XML，无 HTML 转换器。ExcelJS 固定 4.4.0，uuid override 固定11.1.1。
审计首次发现 uuid 旧版本 buffer bounds advisory；ExcelJS 源码只使用 v4，兼容 override 后审计为0项。
另将 unzipper 固定0.12.3，移除含缺失许可证声明的 buffers 0.1.1 闭包；此后重新核对版本和全部消费者。
完整工件 SHA-256、文件哈希与许可证记录为 `src/shell/office-lite/DEPENDENCIES.json`，随依赖变化更新后才能打包。

当前主会话直接证据：七模块编译/静态检查 PASS；文件原子新建、禁止覆盖、路径边界、竞态、checkpoint重启撤销5项PASS；
Worker 真实线程取消、超时、等待退出、shutdown4项PASS。打包闭包复制及哈希篡改拒绝2项PASS（依赖变化后须刷新再复验）。
对应日志为 `/tmp/a9-42-office-build.log`、`office-files-r3.log`、`office-service.log`、`office-package.log`，后三项同属a9-42前缀。
文件测试首失败为 fs namespace 属性不可spy；改为原模块spy后出现回调unknown类型，修正类型后通过，未降低断言。
办公引擎及真实模型夹具链仍待整合，产品Electron、Win7与正式打包为NOT_PERFORMED。

### 4.5 Office 引擎接手与本地完成

负责人要求检查未完成子任务并由当前Codex/Sol接手。
查询结果仍为running，未返回交付；原10分钟等待窗口超时不能写成任务中断。
主会话通过task_cancel发出取消，不再派单。工作树 `t3-700884c3` 当时无产品修改或交接。
主会话在main直接完成 `office-lite-engine.js`、`office-lite-zip.js` 与相关测试，接入既有Worker/Workspace/Core。

已交付：DOCX段落/标题/简单表格、XLSX单元格与分页读取；结构化新稿与受支持子集修改副本。
输入绑定真实工作区文件、哈希与身份，禁止覆盖现有文件；checkpoint重启后可撤销新副本。
原稿不受支持的结构只读提取并给警告，修改资格以本模块标记及全部部件哈希核对。
修改不是任意原稿保真编辑，PDF/旧格式/宏/外链/加密明确拒绝；公式缓存和日期原始值明确标记。
ZIP在第三方生成库前按实际解压长度、CRC、目录/本地头/路径/条目数检查，拒绝实体与外部关系。
Core对超大单元返回有效JSON和截断标记，不破坏nextStart；凭据沿用现有投影脱敏。

依赖闭包已从202项缩至99项。所有声明的Node engines满足16.17.1，未据此签产品兼容。
最终 `DEPENDENCIES.json` 已按最新锁重新生成，包含工件SHA-256、来源、SHA-512 integrity、许可证及安装文件SHA-256。
最终npm官方注册表审计为0项，原始结果 `/tmp/a9-42-office-audit-final.json`；只证明本次审计未发现已知项。
依赖在隔离目录实际安装；根package.json/package-lock.json未改动。可选包缺失时不暴露办公工具。
打包闭包复制实际99项；用复制后的Worker生成XLSX，证明未从源码目录借库。依赖字节篡改会拒绝复制。
多许可证SBOM使用SPDX expression，原始许可证随模块目录保留。

| 开发机直接检查 | 结果 | 日志（均为/tmp/a9-42-前缀） |
|---|---|---|
| 新副本/不可覆盖/路径/文件变化/checkpoint重启撤销 | 5项PASS | office-files-r3.log |
| Core权限及超大单元JSON预算 | 2项PASS | office-core.log |
| 引擎真实文档、Worker取消/超时/恢复、运行时→模型夹具链及脱敏 | 17项PASS | office-verified-runtime.log |
| 可选依赖闭包复制、包布局Worker执行、篡改拒绝 | 2项PASS | office-package-checked.log |

上述26项使用开发Node20.17.0；依赖先构建，最终消费者载入当前dist。七模块编译及Shell静态检查PASS。
已有Provider持久化29项及工作台合同49项，在consumer-regression日志中单独PASS；该轮新测试因断言大小写失败，
不能把整轮记PASS。改为匹配实际小写redacted后，当前办公检查17项全部通过。
首轮引擎缺省TargetMode为null，主会话修正后通过；首个runtime日志在修复前启动，保留失败目录和原日志。
不以测试退出0证明Word/Excel视觉排版，样本副本仅用于内容结构核对。

开发机资源观察：8次小样本文档读取，Main未加载任何office-lite库模块；
RSS起点42,516,480字节、10ms采样峰值67,633,152字节、关闭加GC后55,902,208字节。
原始记录 `outputs/a9-42-tools/office/resource-development.json`，仅macOS arm64/Node20，非Win7预算结论，
采样可能遗漏瞬时峰值，也不能据GC宣称所有内存已归还。Win7性能仍UNKNOWN。
交互演示复用现有工作台结果渲染函数及真实引擎样本，已preview/render；材料位于同目录demo.html。

六项完成本地开发交付。Win7、产品Electron22/Node16运行、真实外部模型、完整产品包、正式门A/B、
提交、推送和发布仍NOT_PERFORMED。无新增系统服务、远端上传或全局运行时。

最终文档检查394文件/64任务PASS，git diff --check与新增产品JS语法检查PASS。
源码身份及本轮日志保存在 `outputs/a9-42-tools/source-manifest-office.json` 和 `office/logs/`，
前五项源码清单保留不覆盖。Office阶段新增的工作树、可选依赖及样本输出已只读盘点，
原始记录为 `outputs/a9-42-tools/office-closeout.json`；全部保留，未删除或移除工作树。

### 4.6 继续推进：实际运行时与打包前置

负责人要求继续推进，主会话执行范围内本地运行验证和同范围修复，不新增员工。
实际基线仍main `6ea0b9af…` 加六项及A9-41未提交差异，已保留源码身份清单。
本机没有可执行的Electron22，已有win32-x64包不能在macOS直接运行。
按WIN7_CONSTRAINTS开发机探针Profile准备官方同版本darwin-arm64包，仅写outputs。
先验证Node16、Office Worker与nativeImage，再按具体失败补最窄回归；不重做未变化原生模块。
这条链可暴露Node20夹具无法发现的API、模块加载或原生解码差异，不重复前阶段绿灯检查。

开发产品打包入口要求干净源码：build-a9-product-v3.mjs检查developmentOnly时，
sourceStatus非空或allowUncommitted均返回A9_V26_CLEAN_SOURCE_REQUIRED。
当前不满足该前置，实际产品打包NOT_PERFORMED；不以旧源码、临时假提交或切换Profile绕过。
已发现原始Runner BuildA/BuildB ZIP现在在.acceptance/deps/a9-v26-managed-r3-original，
历史“Runner输入缺失”的记忆已过时；本轮将只读核对精确输入，不改原候选或历史结论。
目标机连接、正式门A/B、提交推送发布未因“继续推进”自动开放。

开发机Electron模块探针已运行。官方darwin-arm64ZIP按上游SHA-256校验一致，
首次下载在剩余约1.2MB时超时，续传后再次校验全包，通过后才解压和执行。
运行时直接返回Electron22.3.27、Node16.17.1、ABI110、Chromium108。
5个检查均PASS：DOCX真实Worker与副本哈希/撤销，XLSX真实Worker回读，Worker取消/超时/退出，
nativeImage真PNG缩放/预览身份，真实1280×720 JPEG解码并转换PNG。
报告与源码/运行时绑定在 `outputs/a9-42-tools/electron-module-r1/report.json`、`binding.json`。
该探针没有创建产品窗口或加载产品SQLite，不冒充Win32产品、GUI旅程或Win7结论。
复现入口为 `src/shell/tests/product/a9-42-electron-modules.cjs`，只接受新的候选外输出目录。

另按scripts/README运行必需的 `npm run verify:release`。
首轮共350项：294 PASS、51 FAIL、5 skipped，总组FAIL，日志 `/tmp/a9-42-release-required.log`。
40个FAIL共因是打包测试的隔离源码夹具没有链接新增独立Office依赖；
主会话仅修复a9-package和a9-batch2-package两份测试的依赖准备，生产打包的哈希核对未放宽。
最短A9-32开发包用例已PASS；受影响集合继续复验，定向选择外的条目不计通过。
另外4个FAIL是未改动的v25夹具读取当前v26源码，7个FAIL来自未改动测试引用已缺失的历史外部证据。
这些路径与HEAD无差异，错误入口不依赖Office；不改历史脚本或伪造证据来得到总绿灯。
5个skipped保留未执行含义，不计PASS。分类记录见 `outputs/a9-42-tools/release-failure-classification-r1.json`。

修复后的两份打包合同与Office闭包测试共123项全部PASS，0失败、0跳过，
日志 `/tmp/a9-42-package-affected-r2.log`，耗时445.82秒。40个Office夹具缺口相关失败已闭环。
该结果来自合成原生输入的测试包，不是当前Win7产品包或真实目标执行。
完整release组原始FAIL记录保留；未修改的11项历史失败与5项未执行不因定向复验改判。

本轮直接证据源与运行时哈希见 `outputs/a9-42-tools/source-manifest-runtime.json` 和探针binding.json。
可执行ElectronSHA-256 `f30bba8002b233cc96f8998e4357da4165e2345ea4f47ca817e82341c6884fb8`；
探针SHA-256 `3e67a5a4fe730ee91ec213bc3b1ffe97e61b2fdd3e4f85141d6da38a65e181f0`。
新运行时及探针输出只读盘点为 `outputs/a9-42-tools/runtime-closeout.json`，保留原下载与报告，无删除。

完整开发包的下一步需要明确本地提交授权。当前所有未提交差异的审阅材料已准备：
`outputs/a9-42-tools/delivery-review/README.md`、`paths.json`、`workspace-review.patch`。
清单包含A9-42、原有A9-41和原有归档/治理差异，并非只含Office；没有改Git index或提交。
提交准入及实际开发包仍NOT_PERFORMED；本轮不请求或执行推送发布、正式门A/B或目标机操作。

### 4.7 本地提交与开发打包授权（2026-10-29）

负责人针对上述审阅材料回复“批准”，授权保存清单内82项改动为本地提交并构建开发包。
提交前直接核对HEAD为 `6ea0b9af67145603f5991cd441bdc4c9af658d4c`，
82项准确路径、大小和SHA-256均与 `outputs/a9-42-tools/delivery-review/paths.json` 一致，
暂存区为空，无清单外改动。范围包含A9-42、A9-41及既有归档/治理改动。
本节和STATUS的授权状态补记属于同范围交付记录；不改已审阅的产品实现。

使用正常本地提交及真实干净源码，不改写历史、不绕过hooks、不切换打包Profile。
随后使用A9-32开发输入锁及已核对的Electron、Runner、Storage原始ZIP构建新开发输出，
校验新包自身来源、闭包、SBOM和哈希。构建结果另行追加，不提前宣称PASS。
本次批准不包含推送、发布、正式门A/B、目标机连接、删除或系统修改。

### 4.8 已提交源码与实际开发包交付（2026-10-29）

批准范围已保存为main本地提交 `100f8db454f67225a03d33cfd628ade0b20fc4bd`，共82项文件。
暂存检查补获9个新增文件的末尾空行，已仅移除多余空行；无产品语义变更。
最终暂存准确路径及SHA-256保存在 `outputs/a9-42-tools/delivery-review/approved-source.json`。
正常提交后工作区干净，未跳过hooks、改写历史或推送。

使用 `npm run package:win7`、原始A9-32开发输入锁及§4.6核对的三个原始ZIP，
在新目录 `outputs/a9-42-tools/developer-package-r1` 构建成功。
源码、原生来源、输入哈希、manifest及ZIP闭包检查均通过；没有重编原生组件或替换Profile。
开发包为 `Win7CodingAgent-0.3.0-alpha.2-win7-x64.zip`，111022149字节。
ZIP SHA-256：`31482faf030ce58c1bb23236e422a5288db7f9dd96583bbdd6135e3df76bd4c3`。
manifest SHA-256：`7663cf21ef707c79cd6cecf09c74e6233d25073df9d04cbdbfa092038befb4bd`。
包绑定上述产品提交、source_dirty=false、external_acceptance_eligible=false；仅为开发包。
交付记录的后续文档提交不改变该包的源码绑定。

再次校验实际ZIP的4081个manifest文件及包内Office闭包：99项锁定工件、3647个依赖文件
哈希一致，111个许可证/版权文件保留，SBOM版本和许可证声明完整。
Office Worker、图片服务、问询/图片Renderer组件、preload及IPC均与提交源码一致。
结果见 `outputs/a9-42-tools/package-verification-r1.json`。

使用官方darwin-arm64 Electron22.3.27/Node16.17.1，直接加载交付目录resources/app内模块，
DOCX真实Worker读写/源hash拒绝/原件保留/checkpoint撤销、XLSX真实Worker回读、
图片真实解码缩放及会话绑定预览共3项PASS，服务close为PASS。
初次探针继承ELECTRON_RUN_AS_NODE=1，在建立输出前因无法加载electron失败；
仅在探针子进程移除该环境变量后运行成功，首失败日志保留。
报告、脚本/运行时/产品ZIP哈希绑定见 `outputs/a9-42-tools/packaged-module-r1/`；
原始日志见 `outputs/a9-42-tools/package-validation-logs/`。
这仍是macOS开发机包内模块证据，没有运行Win32产品入口、SQLite或产品窗口。

本轮授权记录的docs:check为394文件/64任务PASS，暂存diff检查PASS。
先前受影响打包合同123项PASS保持原证据，不因本次源码提交重复执行。
完整release组原始FAIL及剩余11项历史失败、5项跳过保持§4.6记录，不改判。
真实模型、Win32产品GUI、Win7实机、正式门A/B、推送和发布均NOT_PERFORMED。

新开发包与探针输出只读盘点见 `outputs/a9-42-tools/package-closeout-r1.json`；
工作树状态见 `outputs/a9-42-tools/package-worktrees-r1.json`。
本轮输出、锁定输入和员工工作树均KEEP；忽略文件和进程占用未重新审计，不作可删结论。
没有删除或清理系统内容。

### 4.9 继续推进：问询失败重试与同版本运行时检查（2026-10-29）

负责人继续要求推进，主会话从干净main `c8158d1acdfac8e22954adc959c7a0c3c4f58cab` 开始。
在既有本地连续交付、普通修复、提交和开发打包范围内执行，不启动员工，不连接目标机。

实际发现：问询回调返回 `{ok:false}` 时，卡片只检查Promise是否抛错，误把失败对象当成功清空；
工作台在刷新时仍保留questionReply，导致卡片沿用busy状态，失败后无法重试。
修复仅涉及两个Renderer文件：卡片显式核对ok；工作台在回复结束后按最新快照重推卡片忙碌状态。
没有改变问题持久化、批准语义、IPC、State或依赖。

新增回答/取消两种失败返回回归。原实现2 FAIL/4 PASS，保留
`outputs/a9-42-tools/followup-logs/a9-42-question-retry-baseline.log`。
修复后卡片、真实问询Runtime、工作台合同共65 PASS，依赖闭包先编译，Shell静态门PASS。
日志为同目录 `a9-42-question-retry-fixed.log`。

使用官方macOS arm64 Electron22.3.27/Node16.17.1/Chromium108，
创建真实BrowserWindow，加载当前工作台、产品preload、窗口安全策略和strict IPC；Runtime为显式内存夹具。
6项PASS：纯文本问题、失败后保留回答/重试、忙碌防重复、图片能力开关、
真实CSP下图片解码/关闭/源变化提示、6种视口与设置关闭焦点。
原Renderer在该入口直接复现问题卡片清空；修复报告和源码哈希绑定见
`outputs/a9-42-tools/electron-workbench-fixed-r3/`，截图已检查。
早期取证夹具的问题方法名、缺失会话事实及程序点击前未聚焦均已按真实契约修复，首失败输出保留；
未删减断言。此结果不证明产品main、SQLite或Win7 GUI全链路。

Office在同版本Electron的Node16模式直接加载§4.8交付包内模块。
首次32次读取后RSS未回到基线，因此增加至128次读取观察；实际130个Worker创建后全部退出，
活动Worker为0、峰值并发1，主线程加载办公库模块数为0，关闭后拒绝新读取。
最终采样RSS基线46055424字节、峰值97239040字节、关闭并GC后84983808字节；
最后4批在约85MB，不能据此断言全部原生内存归还、无长期泄漏或Win7预算达标。
报告见 `outputs/a9-42-tools/office-resource-electron-r2/report.json`。
样本为100段DOCX及1000单元XLSX，非最大负载；性能预算#2/#3/#10的Win7状态不变。

旧开发包及其证据保留。当前Renderer修复须绑定新产品提交后另建开发输出，不覆盖§4.8的包。
现有ENGINEERING_03 main例外只覆盖A9-34/A9-40，不自动授权本版本Win7试用；
本地准备具体试用材料后再请求目标动作批准。正式门A/B、真实模型、推送发布及删除仍NOT_PERFORMED。

### 4.10 修复版开发包与试用准备

§4.9修复已保存为本地产品提交 `94135364fa922261d1f0b281ddb29c34b900c7b7`。
从真实干净源码、相同开发锁和原始输入构建新目录 `outputs/a9-42-tools/developer-package-r2`，
旧包及证据保留。新ZIP为111022225字节，SHA-256为
`751c76f2bddc5a505adf4236bac4b29492c9bd9a4a7f88ba0bec03f64d72085d`；
manifest SHA-256为 `c647b01bed4a236811ba6285d6c69f172ed6f96ab57a65b21fdfc01bc3bfef9c`。

新ZIP直接完整性校验PASS，4081个manifest文件、99项Office工件及3647个依赖文件闭包均核对。
与§4.8包相比只变化两个Renderer、SBOM和开发检查身份文件；无文件删除，原生输入未变化。
开发机Electron工作台6项证据按7个源码文件精确哈希引用INHERITED_EVIDENCE；
Office128次观察按26个服务/Worker/Workspace/锁文件字节一致引用INHERITED_EVIDENCE，
其余3647个Office依赖文件也已按锁定清单校验。详情见 `outputs/a9-42-tools/package-verification-r2.json`。
这些继承只对应开发机同字节模块，不替代Win7、完整main或SQLite直接运行。

候选外Win7准备材料位于 `outputs/a9-42-tools/win7-trial-r1/`。
portable-only驱动从已有最短链路副本锁定本包来源、ZIP、manifest、4081文件及驱动哈希，
保留原进程身份、退出、SQLite和锁判据；原历史驱动不改。
本地有效配置与8种无效配置拒绝、Node16语法检查通过。
模板deadline为空，未填入批准窗口，当前配置不能执行；没有连接或上传目标机。
本轮新包、准备材料、工作台和Office观察目录已只读盘点，见
`outputs/a9-42-tools/followup-closeout-r1.json`；全部KEEP，无删除。

## 5. Win7开发试用提案（PROPOSED，未授权）

建议对§4.10准确开发包，从当前main新增一次ENGINEERING_03 r2的工作区例外。
目标仍为DCCS-CHAIZL-PC/Win7 SP1 x64/普通agent交互桌面，沿用原主机键、SID、
严格SSH校验、锁、空间和日额规则，不继承别人的活动锁。
窗口从首次目标动作起最多60分钟，含传输和收尾；最后10分钟不启动新场景，真实模型请求0次。

先执行真实产品portable最短链路：独立副本和工作区、Read Only选择、新建对话、
SQLite事实持久化、正常关闭及锁/进程收尾。通过后按剩余窗口运行包内Office/图片模块、
32次Office读取资源观察和带明确Runtime夹具的工作台交互探针，各层单独记DEV_CHANNEL。
现有main例外仅覆盖A9-34/A9-40，§4.7亦未授权目标机，因此本节须负责人明确批准后执行。

准确路径、脚本/配置哈希、执行顺序和停止条件见上述准备目录README及binding.json。
允许写入仅限本轮C:\A9-DEV包、run/package副本及通道控制记录；正常移除本轮临时任务，
只停止本轮根内进程，保留全部文件和证据，不执行close删根或根外终止。
不读取既有凭据、不改系统或服务、不安装软件、不发真实模型请求、不签正式门A/B、不推送发布。
身份、完整性、审计或生命周期未知立即停止依赖动作。当前目标执行仍NOT_PERFORMED。
