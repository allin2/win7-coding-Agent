# A9-42 — Win7 轻量工具与文档能力

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: EXECUTION_CAPABILITY
Target Branch: main
Source Baseline: 6ea0b9af67145603f5991cd441bdc4c9af658d4c
Phase-Gate: A9_42_IMPLEMENTATION_AUTHORIZED
Win7-Validation: DEV_CHANNEL
```

Win7字段仅表示已有范围限定的开发级实机证据，准确直接/继承/未执行范围见§7.13；不签发正式通过。

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

### 5.1 负责人批准与开始前核对（2026-10-29）

负责人针对§5及准确准备材料回复“批准”，随后要求继续执行。
允许从当前main进行本次60分钟Win7开发试用，真实模型请求上限0次；
该批准新增本版本的main工作区例外，其他r2身份、锁、预算与停止边界不变。
批准包仍为§4.10的 `751c76f2…d72085d`，产品源码 `94135364…`，不重建或覆盖。
本地执行起点HEAD为 `fa1a14ad5cb667df3bfde407f12f3d2ca2c5693c`，起始工作区干净。
ZIP、驱动、配置模板、启动脚本及3个补充探针的实际SHA-256与批准材料一致。
本机当前IPv4为10.45.40.145，历史目标192.168.1.9的路由经过utun5；
这只说明本地网络事实，不证明目标可达或身份。先用既有严格主机键执行一次只读status。
首次目标动作时间和60分钟deadline记录在候选外窗口文件；目标身份不明前不上传或执行。

### 5.2 网络恢复、非活动锁转交与短路径准入

首次status于2026-10-29T14:22:04.542Z开始，窗口截止15:22:04.542Z；
最后10分钟不开始新场景的界线为15:12:04.542Z，不因重连重新计时。
初次SSH返回连接关闭，未建立目标身份；随后负责人确认Mac已换网段并要求检查继续。
Mac当前192.168.1.16，原192.168.1.9路由已回到en0；不扫描其他设备、不改路由或SSH信任。
严格主机键下status确认DCCS-CHAIZL-PC/build7601、agent会话2，
开发根8919186941字节、C盘空闲884995092480字节，根内进程和任务为空，无未知解包状态。

通道留有holder `a93440-8508b507bb` 的非活动锁。
负责人明确批准把该非活动锁转交本轮 `a942-751c-7f41ca1c`；
转交前再次核对holder、active=false、零进程/任务及无未知解包标记，随后通过既有--steal入口完成。
未冒用旧holder；批准和窗口文件见 `outputs/a9-42-tools/win7-trial-r1/`。

标准cand入口在任何传输或锁操作前因路径上限拒绝：该深层staging目录使12个文件达到240字符，
其中5个达到Win32 MAX_PATH；原始拒绝保留为candidate-transfer.json。
没有放宽路径或完整性守卫。对同一已批准ZIP，在已授权work根内使用较短input目录解开ZIP顶层的内容，
最长输入路径235字符、package副本237字符，逐项通过原remotePath守卫。
实际配置、解包脚本、逐文件预期SHA-256和绑定见config-short-path.json、extract-short-root.ps1、
expected-files.tsv及actual-input-binding.json；原包、产品源码和原始批准模板均保留。
解包沿用Shell.Application、有界等待、独占读取、生命周期标记和完整文件计数，另逐文件核对SHA-256。
当前写入、复制和解包仍仅位于本轮已批准work根，不改变系统或其他候选。

### 5.3 解包中断恢复与实际输入验证

111022225字节ZIP已上传，远端SHA-256与§4.10一致；驱动、实际配置、启动脚本和预期清单均通过上传哈希核对。
交互中断使本地控制进程结束，原解包action未形成完整结束记录，不能把缺失退出码记0。
恢复时先status：本轮锁active=true、解包标记仍在，产品进程和临时任务均为空。
随后只读查询确认4082个文件已经存在，且只剩该次查询自身PowerShell，原解包PowerShell已结束。

按同一holder及原action token恢复本轮事务，不重新--steal、不冒用其他锁。
逐文件复核4082个文件的大小、SHA-256及独占读取，确认原解包写入已结束，
再写本轮ready、清本轮解包标记并释放原token。结果为files_verified=4082，original_powershell_ended=true。
首个中断action的原始空stdout/stderr和未完成状态继续保留；恢复检查有独立完整审计记录。
本地窗口与远端配置deadline未延长。记录见interrupted-extraction-readonly.json、reconcile-own-extraction.json、
reconcile-own-release.json及对应 `outputs/win7-dev/actions/` 原始字节。

### 5.4 Win7普通用户直接开发试用完成（DEV_CHANNEL）

准确身份为§4.10源码与ZIP；真实运行在DCCS-CHAIZL-PC、Win7 SP1 x64 build7601、
普通agent SID `S-1-5-21-1708701742-428676696-1831205153-1001`、会话2、Medium完整性。
实际Electron22.3.27/Node16.17.1。四次临时计划任务均正常退出0并移除任务。
没有安装、重编原生、重建产品包或发真实模型请求。

| 直接证据层 | 实际结果 | 限制 |
|---|---|---|
| 产品main/preload/strict IPC/State/Renderer | portable窗口实际可见；真实鼠标选择Read Only、新建对话；7项检查通过；正常will-quit已观察 | 未提交Turn、未配置Provider；非完整办公Agent旅程 |
| SQLite与退出 | 两个对话持久化、权限read_only、Turn数0、工作区锁为空；原包及运行副本前后核验一致 | 不据此重签历史候选或正式Gate |
| 包内Office/图片模块 | DOCX真实Worker读写、源hash拒绝、原件保留及checkpoint撤销；XLSX回读；nativeImage缩放/预览会话绑定，3项PASS | 模块探针，无产品窗口/模型联动 |
| 真Electron工作台与preload/strict IPC | 问询失败保留/可重试、忙碌防重复、图片能力开关、CSP下图片解码/关闭/源变化、6视口焦点，6项PASS | Runtime为明确内存夹具，不冒充真实State端到端问询 |
| Node16包内Office资源观察 | 32次读取，34个Worker创建且全部退出，活动0、峰值并发1；主线程加载办公库数0；close后拒绝新读取 | 100段DOCX/1000单元XLSX，非最重负载/长期观测 |

资源观察RSS基线42917888字节、采样峰值80187392字节、close并GC后45015040字节。
产品Main另有单次采样126349312字节。不同进程及场景不相加、不作为整个应用常驻峰值。
PERFORMANCE_BUDGET #2/#3/#10的正式状态不变；没有10分钟空闲、多并发或最重负载直接证据。

原始补充探针模板仍含macOS限制文字及win7=NOT_PERFORMED等静态说明，原报告不改写。
本轮绑定层明确纠正其适用环境：四个wrapper身份、实际win32/x64/runtime及目标身份均有直接证据；
只提升本次实际执行项为Win7 DEV_CHANNEL，不提升未执行的真实产品全链路或正式验收。
报告/截图逐文件SHA-256、任务身份、脚本来源、包来源见 `outputs/win7-dev/a9-42-trial-r1/binding.json`。
总结果与原始链路分别为该目录SUMMARY.json、portable/RESULT.json、modules-r1、office-resource-r1、workbench-r1。
两张真实Win7截图已检查，文字与控件可见；字体表现只绑定本次实际截图，不继承macOS字体推断。

产品退出后的SGTool PID12076、创建时间20261029230302.813000+480、会话2及准确映像路径
符合ADR-0297环境实例；保留且未终止。其余blocking_instances及unexpected_root_instances为空。
15:10:01.453Z已完成本轮最后写动作的释放；随后只读status确认根内进程/临时任务为空、
锁holder为本轮且active=false、无未知解包标记，开发根9823224356字节，C盘空闲883782221824字节。
全部目标动作于窗口截止前完成，窗口不再启动新动作；原包、副本、用户数据和全部证据保留，无文件删除或close删根。

正式门A/B、完整Alpha/RC、真实模型、完整Office Agent GUI旅程、长期资源预算、负责人使用验收、推送发布均NOT_PERFORMED。
完整release组剩余11项历史FAIL及5项未执行保持原记录，本次开发试用不改判。

交付限制：当前包含深层Office依赖，最长包内相对路径189字符。按通道原239字符限制，
产品根目录须不长于49字符；本轮使用的短根已直接通过。不要解到深层Downloads或旧cand嵌套目录，
不启用长路径系统配置或放宽守卫。后续精简非运行时依赖文件须另绑新包和复核，当前包不改字节。
本轮本地准备及下载证据的只读盘点见 `outputs/a9-42-tools/win7-trial-closeout-r1.json`，全部KEEP。
窗口准确最终只读动作结束时间15:10:25.726Z，见closed-window.json及SUMMARY.json；此后没有目标动作。

## 6. GPT重置模式后续本地迭代（APPROVED_FOR_IMPLEMENTATION）

负责人要求“用gpt重置模式推进后续”，在两工作包提案后明确要求“打包优化和界面链路都开启Fast”。
本轮main基线 `300fa1786577630d65b02350a5c926ac57e4c3ba`，起始工作区干净。
模式仅调整员工，主对话保留实际Sol/max/default；两项员工分别Terra/Sol、xhigh、priority，串行执行。
重置时间未提供，已另行询问；用户明确Fast要求按本次指令执行，不推测额度时间或收益。

1. 打包优化：去除造成Win7路径超限的已确认非运行时Office依赖源码/类型文件。
   不升级、更换或新增依赖，不改原始安装工件；源锁和全文件验证保留，交付子集用版本化清单精确绑定。
   保留运行JS、资源、元数据及许可证/SBOM；不以减少校验、放宽路径或系统长路径设置通过。
   新包须直接通过标准cand目录的本地路径准入，运行真实复制后Worker并覆盖篡改/漏件拒绝。
2. 界面链路：补真实产品Office Agent新稿/问询/读取/修改副本/原件不变/撤销与退出的最短本地链路。
   只使用明确的本地HTTP模型夹具，不请求真实模型服务；保留产品main/preload/IPC/State/Worker及权限。
   目标机驱动可本地准备，不能用Runtime内存替身冒充完整链路；实际运行时不可用时明确未执行部分。

允许上述范围内本地实现、普通修复、针对性构建验证、既有授权的本地提交及新开发包；
员工不得提交、安装、推送、删除或连接目标机。主会话负责文档、ADR、整合、证据与交付。
§5窗口已结束；新Win7窗口、正式门A/B、真实外部模型、系统修改、推送发布及文件删除仍须相应明确授权。

### 6.1 Office交付子集整合

Terra/xhigh/priority员工在独立worktree完成打包优化两文件及3项定向检查；父工作区保持共享源依赖只读。
主会话复核后整合，仅省略docx8.0.0的src/**/*.ts及build/**/*.d.ts，原main=build/index.js及版本必须匹配。
完整源树哈希/缺失/符号链接验证仍在复制前执行，含被省略的源码；许可证声明与源证据必须一致。
99项工件保留，原package-lock、DEPENDENCIES及安装树均未修改。

新 `office-lite/DELIVERY_MANIFEST.json` 为schemaVersion1，绑定lockSha256和dependenciesSha256，
copied/omitted逐文件列出SHA-256；omitted有明确理由。
主会话补按实际路径去重，避免上游完整工件包含嵌套依赖时交付清单重复记录；不削减源树核对。
实际交付2455个唯一依赖文件，省略826个非运行时TS文件。
父直接执行3项定向检查PASS，覆盖复制后DOCX/XLSX Worker、源码和运行文件篡改、漏件、
许可证声明缺失、符号链接及未知docx入口拒绝；源字节不匹配不能因文件被省略而绕过。

真实macOS arm64 Electron22.3.27/Node16.17.1直接加载该复制闭包，
DOCX源hash保护/原件保留/撤销、XLSX回读、nativeImage预览共3项PASS。
报告及源码哈希绑定在 `outputs/a9-42-tools/package-optimization/`。
该结果没有产品main/SQLite GUI，也不是新包Win7证据。
受影响a9-package/a9-batch2-package合同已启动，结果另行补记；不预先宣称通过。
完整产品ZIP将由正常本地提交后的干净源码构建，再使用原zipManifest路径守卫检查。

### 6.2 完整裁剪开发包与已完成检查

打包优化产品提交 `c9e295459344ea45301a2da24272d847257ade89` 已在真实干净main源码上构建。
新目录 `outputs/a9-42-tools/developer-package-r3`，ZIP为110534770字节，
SHA-256 `1d2a1289313f6ea483c68451e765e251380f2dadd859f11c41d44cdaa7320f42`；
manifest SHA-256 `6551cc4a92a00dd467a60467b51d8c2a74f85debbb6314b7dd20a845c0835582`。
新ZIP完整校验PASS，3257个实际文件含3256项manifest文件，标准cand目录最长路径201字符，
已直接使用原zipManifest/remotePath守卫检查完整产品ZIP，无需上一轮的短路径解包例外。
此结论只消除本包引入的额外短根要求，不宣称Win7任意长度路径支持。

与r2相比，仅移除826个明确非运行时docx文件，新增DELIVERY_MANIFEST；
既有变化文件仅SBOM和开发身份记录，全部运行JS、资源及原生输入保持字节一致。
完整源工件唯一文件集合与copied/omitted无重叠且覆盖一致，99项工件及许可证/SBOM身份已核对。
直接检查见 `outputs/a9-42-tools/package-optimization/full-package-r3-verification.json`。

父主会话完成受影响a9-package/a9-batch2-package合同121项PASS、0跳过，加闭包3项共124项。
命令 `node --test scripts/release/test/a9-package.test.mjs scripts/release/test/a9-batch2-package.test.mjs`，
耗时443052.99毫秒，原始日志 `/tmp/a9-42-trim-package-contracts.log` 并保存到上述输出目录。
没有复跑或改判完整release组中11项历史FAIL与5项未执行。

中间复制目录Workspace dist带source-map注释及声明，正式产品编译关闭这些输出；
两次身份核对分别发现声明缺失和JS字节不一致，故未按中间目录继承运行结果，也未归一化后冒充同字节。
改为直接对r3最终包执行实际Electron22/Node16模块探针，DOCX/源保护/撤销、XLSX、图片共3项PASS。
报告及包/脚本/运行时哈希在 `package-optimization/final-package-electron-r1/`；
身份差异诊断保留为runtime-inheritance-attempt.json。新包Win7及完整产品GUI均NOT_PERFORMED。

Sol/xhigh/priority的实际Office界面工作包仍运行。10分钟工具等待结束，返回running而非failed，
按next等待自动完成通知，不轮询、不重复派单。父已准备完整打包交付，收到员工结果后继续整合其真实链路。

### 6.3 实际Office界面驱动整合与本地证据

Sol/xhigh/priority员工已完成，没有活跃员工。交付office-journey候选外驱动、本地prepare绑定器、
函数/HTTP反例及新增真实Runtime+SQLite组合测试；未改产品实现或依赖。
主会话整合4个明确文件，排除员工本机office-lite/node_modules符号链接。
员工交接及原始首失败日志保留在 `outputs/a9-42-tools/office-journey/inherited-worker/`。

父复核修复3个取证问题：任务名改为既有通道的A9-DEV前缀；SQLite工作区断言按产品Windows
canonical全小写路径比较；prepare改为使用产品相同编译参数在新的候选外目录重编当前提交，
逐字节匹配包内JS，不再把带source-map的开发dist误当产品dist。不改变产品Runtime或State行为。
源工件/源码/编译产物及包身份继续绑定，拒绝旧包冒充当前源、未知配置、路径逃逸、注入额外文件和凭据日志。
本地完整驱动函数/HTTP检查9项PASS；真实Runtime/Core/Gateway/SQLite/Workspace/Worker组合套件5项PASS，
其中覆盖未答重启不重发、回答落盘与重复幂等、DOCX/XLSX生成/inspect/read、源hash副本、经产品IPC撤销。
实际Electron22/Node16对两个CJS语法检查PASS；Mac缺少对应SQLite ABI110，完整产品GUI仍NOT_PERFORMED。

驱动先观察真实问题卡、回答后生成，再验证新副本、原件不变和产品5秒撤销流程，最后取消问询/拒绝迟到回答。
计划使用127.0.0.1随机端口的严格状态机夹具，最多16次夹具请求、真实模型请求0次，不执行Shell工具。
产品正常退出必须观察will-quit；控制器不把自己所在临时任务未结束报成零任务。
既有通道移除准确启动任务后，以第二个普通用户入口执行只读postflight，另写POSTFLIGHT，不改原RESULT。
取证超时、身份、完整性、审计或进程生命周期未知均HALTED，不以app.exit冒充正常关闭。

驱动/测试属于候选外取证与开发测试，产品JS及原生工件不变。保存本地提交后绑定新包，
再完成本地prepare正向检查；不再重复已有124项打包测试。新包、驱动正向绑定和Win7执行结果另记，不能提前宣称通过。

### 6.4 两项本地交付完成与准确包绑定

新增驱动/组合测试提交为 `5143b9cf50f6ef598eda0d0b4e2fae17347f08d9`，正常干净源码开发包在
`outputs/a9-42-tools/developer-package-r4`，ZIP110534772字节，SHA-256为
`845853613765327ccb41786fb1763a2ef4aed531c32bc1c426668e41911dc063`；
manifest SHA-256为 `316a97129a92e2d00c5e6b12eecb69dd56cbd5d44981d1486d42d55778ef1a2c`。
包完整性及原标准cand路径准入PASS，最长201字符。与r3相比所有运行文件字节相同，
仅两份身份记录变化，r3实际Electron模块3项按完整发布清单精确哈希引用INHERITED_EVIDENCE。
原生工件、99项Office版本/源锁、2455个交付依赖文件与省略826个TS文件的边界不变。
报告见 `outputs/a9-42-tools/office-journey/package-r4-verification.json`。

后续绑定工具修复保存为 `30eedc6…`、界面就绪等待保存为 `1763756…`，没有改变产品src源树。
prepare允许包源与当前工具提交不同，但须src树哈希完全相同、无跟踪或未跟踪src改动，
产品文件仍逐项匹配包源git blob；7模块以产品参数重新编译后逐字节匹配，不把去注释视为同字节。
新增错误注入抓住旧任务名前缀、证据提交与源变化混淆、未跟踪源码漏检；最终10项检查PASS。
真实Runtime套件5项PASS及两个CJS产品Node16语法PASS保持直接证据；没有重跑不受影响打包合同。

正向prepare已直接对r4执行成功，绑定39个产品文件和117个编译文件，覆盖含Shell的7模块。
最终材料位于 `outputs/a9-42-tools/office-journey/prepared-r4-final/`，
driver SHA-256 `ce6c6fe8e5147d6c90373b5a0622106b0445081a2bb0023058de5535d115397f`，
source-binding SHA-256 `1c0add16bce1d6a52db52a1b0e41f3a16619f13353e48d70c87ba0f932c1657e`。
config-template严格绑定准确source/ZIP/manifest/driver，deadline=null且直接验证当前不能执行。
launch-template使用真实CRLF，实际任务名为A9-DEV-a942o-9d503e71，与通道agent-run同前缀。
更早准备副本及其编译目录保留，不复用或覆盖。正向报告local-checks.json及日志均在候选外。

本轮共2次员工派单，实际Terra/Sol均xhigh+priority；主对话保持Sol/max/default。
已完成本地打包优化和完整办公旅程驱动/组合验证的准备，完整GUI直接执行及r4 Win7仍NOT_PERFORMED。
重置时间未提供，没有推测；没有新增员工、目标机动作、安装、真实外部模型、推送发布或删除。
新包r3/r4、两工作包输出及绑定编译目录只读盘点见 `outputs/a9-42-tools/gpt-reset-closeout-r1.json`，
工作树状态见 `office-journey/worktree-closeout.json`；全部KEEP，无删除。旧prepared副本不作为最终执行输入。
收尾docs:check为394文档/64任务PASS；新增工具按既有verify:tools三条入口完成PASS，耗时4702毫秒，
含29项文档工具反例、构建/失败屏障与真实CLI检查。日志保存在office-journey输出中，暂存diff检查PASS。

## 7. r4实际办公界面Win7试用提案（PROPOSED，未授权）

仅针对§6.4的准确source `5143b9cf…`、ZIP `84585361…1dc063`、最终driver/source-binding，
建议从当前main沿用ENGINEERING_03 r2新增一次开发窗口，首次目标动作起最多60分钟，
含传输/准备/执行/下载/收尾；最后10分钟不开新场景。真实模型请求0次，127.0.0.1夹具最多16次。
本轮新增本地HTTP模型夹具，区别于§5完全无夹具请求；该差异须在批准时明确，不能复用已关闭窗口。

目标仍DCCS-CHAIZL-PC/Win7 SP1 x64/普通agent Medium、会话按当前实查；准备模板暂记会话2，
执行前身份或会话不符即停并重新绑定材料，不把UNKNOWN写成已验证。
主机键/TLS/SSH、SID、空间与账本沿用r2。拟续用本会话自有holder `a942-751c-7f41ca1c`，
仅在仍属本会话且inactive、零未知生命周期时继续；其他holder不接管。

允许路径为标准 `C:\A9-DEV\cand\845853613765327c\`、
独立 `C:\A9-DEV\work\a942o-9d503e71\` 及通道必要控制记录；不触碰已有用户数据或模型配置。
经普通agent计划任务加载准确包内真实main/preload/strict IPC/Runtime/State/Core/Worker和Renderer。
只将目录选择器绑定独立工作区；输入本地随机端口Provider且不记住密钥，禁止外部模型或Shell工具。
操作为真实问题卡回答、DOCX/XLSX新稿和读取、按原稿hash生成新副本、原件保持、界面5秒撤销副本、
取消第二问题及拒绝迟到回答、正常窗口关闭、SQLite事实与锁复核。
本轮临时文档的界面撤销是产品功能检查，明确允许移除本轮新建副本；不授权其他文件或旧数据删除。
原启动临时任务由既有通道正常移除，第二个普通用户入口只读postflight核对原任务不存在和零根内残留。
保留原RESULT与独立POSTFLIGHT，不能把自任务仍运行报成已清理；无app.exit成功替身。

身份、完整性、审计、未知进程生命周期失败停止依赖动作，先保存首失败；
只允许窗口内同范围普通取证修复及有界新run重试，不延长窗口、不覆盖包或旧run。
只停止本轮根内进程，SGTool继续按ADR-0297准确实例保留，不扩大根外权限。
不安装依赖、不改系统/服务/账户、不发真实模型请求、不执行close删根、不签正式门A/B、不推送发布。
当前r4目标动作和完整产品Office GUI均NOT_PERFORMED，待负责人批准准确材料后执行。

### 7.1 负责人批准与本轮准入

负责人针对§7准确包、最终驱动及60分钟/0真实模型/最多16次loopback夹具提案回复“批准”。
本轮允许从main执行该准确开发试用，不扩大至其他版本、真实模型、系统修改、正式门A/B或发布。
起点main `613c58ff08e2f6c34b7fd6751b4b0e3060351ede`，工作区干净，产品src树与包源保持一致。
ZIP、driver和source-binding实际SHA-256均与§6.4相符，不重建包或替换组件。
本机当前192.168.1.16，目标历史地址192.168.1.9直连en0；随后使用既有严格主机键执行只读status，
首次目标动作时间/原始60分钟deadline另记候选外window.json，不从本地开始准备时间推断目标准入通过。
当前无员工任务，目标步骤由主会话串行完成。所有运行证据放在
`outputs/a9-42-tools/office-journey/win7-r4-trial-r1/`及既有 `outputs/win7-dev/`。

启动前复核发现驱动直接点击检查器内页签，未保证检查器已展开。按本轮普通取证修复授权，
改为先检查工具栏的展开状态，必要时用真实鼠标打开检查器，再等待展开并点击“变更”；保留原有命中测试。
产品包和src树未变。原批准材料完整保留，本轮实际材料另存 `driver-revision-1/`，
driver SHA-256 `880aef17e29b0f92dddbc0e0c8cddc12df86a6e81212c17b8d3ef40948fa3e55`，
source-binding SHA-256 `d93dacd515e0d8d86b174a410fb8c59e65559dbb65f857560cc5fa6af34ac268`。
开发机驱动10项检查及Electron22/Node16语法检查PASS；此结果不证明Win7界面旅程。
窗口从UTC `16:04:58.813`开始，`16:54:58.813`后不开新场景，`17:04:58.813`截止；不因修复重置预算。

### 7.2 传输首失败与同窗口恢复

首次标准cand上传在600秒后返回 `TRANSPORT_FAILED / exit_code=124`，保留
`win7-r4-trial-r1/candidate-transfer.json`及通道原始字节日志。此时产品尚未启动，Win7夹具请求0次。
UTC `16:18`只读status直接确认原holder inactive、零根内进程/任务、无未知解包标记。
暂存文件已关闭且为85262336字节；其SHA-256与本地ZIP同长度前缀一致。
随后使用同一严格SSH通道续传剩余25272436字节，完整110534772字节的远端SHA-256与批准ZIP完全一致，
再走既有immutable commit-put与标准cand解包，不改包字节、不延长传输等待或窗口。
恢复结果及前缀/完整hash见 `win7-r4-trial-r1/transfer-resume.json`；首次失败不改判。
本地恢复脚本首个导入路径多写一级父目录，发生 `ERR_MODULE_NOT_FOUND`且未执行目标动作；
修正后继续，原错误另存 `resume-bootstrap-first-failure.json`。

### 7.3 首轮启动拦截与新run绑定

普通agent首轮 `a942o-9d503e71` 在产品加载前返回 `PREEXISTING_TRIAL_PROCESS`，
原RESULT绑定SID、会话2、Medium和Electron22/Node16。产品/HTTP夹具未启动，请求0次。
启动脚本含两层同字节根内cmd，而原取证检查只排除直接父cmd；不以忽略全部cmd作为修复。
新驱动最多收录两层真实祖先，逐层核对父PID、创建时间先后、会话和准确cmd路径，
拒绝循环、额外同路径进程、错误会话/路径和未知创建时间，并保留实际祖先及异常根内实例。
新增反例首轮抓住循环识别遗漏，补齐后开发机11项PASS，Electron22/Node16语法PASS；原测试失败保留。
首轮收尾status直接确认零根内进程/任务、holder inactive、无解包标记。

按§7已批准的有界新run重试，保留首轮目录，使用新的独立根
`C:\A9-DEV\work\a942o-4e6c9a21\`，通道run名同前缀，不覆盖任何旧输出。
产品源和ZIP不变；新driver SHA-256 `8afccedfd3ff944459dd912ef8df3d8b87d5a79d7bdbcdda7b267a838ab37e8b`，
source-binding SHA-256 `a374bbc7e44f3506f36d81eeb41685aa765a2cefdc0e478382bd1a289e0259f6`。
新材料/结果在 `outputs/a9-42-tools/office-journey/win7-r4-trial-r2/`，
沿用原 `17:04:58.813Z`截止、最后10分钟不开新场景及全窗口最多16次Win7夹具请求，不重置预算。

### 7.4 第二轮任务查询诊断与第三轮材料

第二轮RESULT直接记录两层准确cmd祖先、零异常根内实例，前一启动问题已闭环；
随后 `TASK_QUERY_FAILED`停止，仍在产品/夹具加载之前，请求0次。
同一普通agent的最小探针确认目标 `schtasks /query /fo csv /nh`拒绝格式组合，
精确任务名及大写CSV探针均返回同一格式错误；停止该路线，保留原始stdout/stderr。
随后本机Schedule.Service只读探针直接读取自己的准确任务，原已删除任务明确返回HRESULT
`-2147024894`（文件不存在）。不提升权限、不改任务ACL或系统配置。

驱动改为通过既有PowerShell只读本机调度器的准确任务名；仅该明确错误码可记不存在，
其他错误fail-closed，存在时必须绑定准确任务路径和agent SID。开发机12项检查及Electron22/Node16语法PASS。
按同窗口有界重试使用 `C:\A9-DEV\work\a942o-6c83d1f7\`，源/包不变，
driver SHA-256 `524fc6d88e9cf4d05d62d70d105e39e874eceac779d3ef912bbc7cfe278f9910`，
source-binding SHA-256 `ce4e9f4cf34b011d229e221df9896d0b4fa5955ebb55f8f5d81005ec9b697796`。
候选外材料在 `outputs/a9-42-tools/office-journey/win7-r4-trial-r3/`。
通过既有ps通道一次部署5个新文件，各文件使用CreateNew且逐个核对SHA-256；
创建前检查全开发根零进程/任务、无未知解包标记和容量，不覆盖前两轮结果。
截至第三轮准备，真实模型及Win7夹具请求均为0，继续沿用原窗口和16次总上限。

### 7.5 任务身份表示差异与第四轮材料

第三轮在 `TASK_QUERY_IDENTITY`停止，仍未加载产品/夹具。普通agent最小探针直接记录：
同一任务的COM Principal.UserId返回账户名 `agent`，任务XML的UserId返回已批准SID，准确路径一致。
驱动改读该任务XML中的SID，继续要求准确路径和完整SID匹配，不放宽到账户名称比较。
开发机12项及Electron22/Node16语法PASS；此前三轮RESULT与探针原始日志全部保留。

本窗口第四轮独立根 `C:\A9-DEV\work\a942o-7f36b2a9\`，源与r4包仍不变；
driver SHA-256 `5c6fb6207605dab9a7de3c45d45defe9c236f0d91c14b5807d1c581d099703d8`，
source-binding SHA-256 `2a075b893957eff291da25be2597596ee6ffb57853cc85c0ee65f3ecc36c90f5`。
材料与执行结果位于 `outputs/a9-42-tools/office-journey/win7-r4-trial-r4/`。
部署仍使用CreateNew/逐文件hash核对，并先核对全开发根无活动进程/任务。
前三轮均在产品加载前停止，Win7夹具累计0次；第四轮继续沿用原截止和16次总上限。

### 7.6 本窗口实机结果与收尾

本轮准确包源 `5143b9cf…`、ZIP `84585361…1dc063`未改变。第四轮普通agent/Medium/会话2直接完成
真实main/preload/IPC/Runtime/State/Core/Office Worker/Renderer链路：
未回答时不重发或写文件、问题卡回答、DOCX/XLSX新稿与inspect/read、按原稿SHA生成副本、原件和工作簿保持。
原ui-result中已执行的检查均为true，真实外部模型0次，Win7 loopback夹具累计13次。
在展开工具记录阶段发生 `DRIVER_OPERATION_FAILED`，controller保留 `UI_INCOMPLETE / HALTED`。
细化点击错误在旧驱动中被通用诊断掩盖，具体Win7原因UNKNOWN；不将其断言为已修复。
工具记录完整显示断言、界面撤销、第二问题取消及迟到回答、完整GUI完成后postflight均NOT_PERFORMED。
原首失败及前三轮启动失败保留，不改判，不重置剩余3次请求预算。

`outputs/win7-dev/office-journey/a942o-7f36b2a9/`保留原RESULT、ui-result、问询截图和三份实际Office文件。
独立普通agent只读诊断通过11项：原启动任务不存在、真实runtime/身份、正常UI关闭、workspace锁为空、
两轮已完成、原件/工作簿hash不变、副本存在且改变、所观察产品树已结束。
两轮实际状态均为 `completed_with_warnings`，按产品已有完成分类记录，不改为无警告完成。
输入包和运行副本各3256个manifest文件重新逐字节校验一致；完整GUI仍HALTED。
诊断报告见 `win7-r4-trial-r4/diagnostic-postflight-result.json`，正常收尾不代替未执行的界面步骤。

收尾诊断首个内联入口超出CMD命令行上限，改为新文件入口；第二版误将已合法声明的
`completed_with_warnings`排除在完成状态外，按既有产品判据修正后另建版本执行。
原字节日志和失败不覆盖；没有放宽完整GUI、权限、审计或生命周期判据。
最终只读status于UTC `17:02:10.662`结束：开发根零进程、零临时任务、holder inactive、无解包标记，
root_bytes=10720016374、free_bytes=882851516416。原窗口提前收尾，之后仅做Mac本地工作。
窗口与预算记录见 `win7-r4-trial-r4/window-closeout.json`。正式门A/B、真实模型、长期资源预算和发布NOT_PERFORMED。

### 7.7 本地取证改进与证据边界

候选外驱动改为在原生点击前后等待布局/默认动作，继续保留命中测试；记录最后selector和阶段，
保留脱敏的 `UI_ACTION_OCCLUDED / UI_ACTION_UNAVAILABLE / UI_ACTION_FAILED`，失败时另存截图。
此改动不改产品或包。开发机Node20驱动13项PASS，Electron22/Node16语法PASS。
Mac实际Electron22/Node16的原生点击夹具3项PASS，包含8次details连续展开（24个原生输入事件）、
禁用及被遮挡目标在输入前拒绝。夹具使用产品CSS，产品main/Office/SQLite及Win7均NOT_PERFORMED。
日志见 `outputs/a9-42-tools/office-journey/native-input-local-r1/RESULT.json`。
这些检查证明新的交互契约，尚未复现或证明消除本次Win7具体中断；后继实机须验证。

### 7.8 新20分钟复验提案（PROPOSED，未授权）

本轮取证代码与记录已保存为本地提交 `3c43199acd616ec5e261a3656e8f62bb067d12c5`，未推送。
新材料位于 `outputs/a9-42-tools/office-journey/prepared-r4-native-retry/`，产品源、r4 ZIP及manifest不变。
39产品/117编译文件已重新逐字节对照，src树不变；编译/原生来源按准确hash引用INHERITED_EVIDENCE，
不重复构建。driver SHA-256 `6fd76b5e5412d04207354041cf64b5fa79642f27a87eb0901a1eadc4477e7615`，
source-binding SHA-256 `3574a73d6333c48445ff1e6bbb5a4cce1b92c09d129a38fcf4230bf4e07b8603`，
材料manifest SHA-256 `902172003831419adef1f394b9e4e1f04197a70950af25cbd519440bcf5b4834`。
模板deadline=null，实际执行已验证拒绝；目标执行NOT_PERFORMED。

建议新20分钟DEV_CHANNEL窗口，含准入/部署/执行/取证/收尾，最后10分钟不开新场景。
真实模型0次，Win7本机随机端口夹具累计最多16次，最多2个新run；预算不足不重跑完整链。
继续同一目标、严格主机键、普通agent Medium及会话2；目标写入前重新确认身份、空间、
自有holder inactive及零未知生命周期，其他holder不接管。输入包根仍 `cand\845853613765327c`，
首个新独立工作根 `C:\A9-DEV\work\a942o-b12c6d8e\`，实际任务名 `A9-DEV-a942o-b12c6d8e`。
只加载该准确包的真实产品全链；只替代目录选择器，不替代Runtime/Worker/State或产品操作。
重跑问询回答、Office新稿/读取/副本、工具记录、检查器撤销、第二问询取消/迟到拒绝及独立postflight。
允许本轮新副本经产品撤销移除、临时任务正常移除和同范围有界取证修复；不覆盖旧包/run，
不删除其他文件、不安装/改系统、不根外终止、不签正式Gate或推送发布。
原窗口已结束，新材料和本地改进不构成新的目标执行授权；待负责人对该准确提案决定。

本阶段已只读盘点四轮材料、原生点击夹具、复验材料、通道动作日志及Git worktree入口，
记录见 `outputs/a9-42-tools/office-journey/r4-window-artifact-inventory.json`。
原始失败、准确输入和恢复材料全部保留；本地/目标文件删除、推送均NOT_PERFORMED。

### 7.9 20分钟复验批准与执行入口

负责人对§7.8及准确复验材料回复“批准”。本次从main `4ad4f6a0d274ecad74b2a7ff6daa2d7c25a34865`
执行该20分钟DEV_CHANNEL窗口，真实模型0次、夹具累计最多16次、最多2个新run，最后10分钟不开新场景。
产品源/r4 ZIP、driver/source-binding及材料manifest哈希与§7.8相符，src树保持不变。
首个run为 `a942o-b12c6d8e`，候选外证据位于 `outputs/a9-42-tools/office-journey/win7-r4-native-retry-r1/`。
首次目标动作时固定起点、20分钟deadline及10分钟收尾线，不从上轮窗口续时或重置本轮请求预算。
主机键、普通agent身份、会话2、自有inactive holder、容量和零未知生命周期通过后才部署。
旧包/旧run/原失败全部保留；普通同范围取证修复不重复请批，不扩大系统权限、删除或发布范围。

首个run已直接完成Office生成/读取、原稿hash副本、工具记录显示及界面撤销，原件/工作簿保持。
随后 `UI_ACTION_OCCLUDED`精确定位到 `#task-prompt`：失败截图直接显示窄窗检查器抽屉及遮罩未关闭。
首个run正常UI关闭，原HALTED不改判，夹具13次。完整旅程未在该run闭环。
在本轮最多2个新run与剩余3次请求内，第二个run `a942o-f1a5c9d2`只独立覆盖取消问询/迟到回复拒绝，
保留真实产品main/preload/IPC/Runtime/State/Core/Renderer，沿用同源r4包；不伪造Office前序事实。
候选外第二场景材料位于 `win7-r4-native-retry-r2/`，驱动SHA-256
`5fedb0205b5b1ddc45ddddf0862234883785abdd7c61ae3691a09a7d7d921446`，绑定SHA-256
`ce2ddd02969fff4f692a66fd2fbde1b884eb5452249965d359da3e3aca1bb803`。
该场景自身强制最多3次夹具请求，预计probe/ask共2次；不把两个独立run合写成一次完整旅程PASS。
第二场景已通过开发机HTTP probe/ask序列及真实Electron22/Node16语法检查，再部署新独立工作根，未覆盖首轮文件。

### 7.10 20分钟窗口结果与本地修复

本轮首个run直接新增证明 `UI_OFFICE_TOOL_RECORDS`、`UI_REAL_TOOL_FACTS`和
`UNDO_ORIGINAL_AND_BOOK_PRESERVED`：真实工具记录可见，界面撤销移除新副本，原件及工作簿保持。
随后输入框被仍打开的窄窗检查器抽屉遮挡，首失败精确为 `UI_ACTION_OCCLUDED / #task-prompt`；
失败截图已直接复核。该run继续保留HALTED，不重写为完整旅程PASS。

第二run于UTC `23:11:03.488`进入controller，完成包校验及驱动运行时准备后，
在 `23:11:29.719`触发 `WINDOW_NO_NEW_SCENARIO`，距已批准收尾线超过0.623秒，未启动UI或模型夹具。
原RESULT保留；取消/迟到回复仍NOT_PERFORMED，不延长收尾线或重置run/请求预算。
本窗口合计真实模型0次、Win7 loopback夹具13次，两个场景run均保留原结论。

独立普通agent收尾直接确认原启动任务已删除、正常UI退出、SQLite锁为空、两轮completed_with_warnings、
副本已撤销且原件/工作簿hash不变、所观察产品树已结束；原包/两个运行副本的manifest文件各3256项hash一致。
诊断原 `NO_RAW_SENTINEL_IN_EVENTS`检查只扫描主库原始字节；另以真实SQLite只读查询全部54条事件payload补证，
未发现本轮原始sentinel，含适用WAL投影，不将主库字节扫描冒充完整SQL事件查询。
原报告及补充结果分别在 `win7-r4-native-retry-r1/postflight-result.json`和 `event-secret-check-result.json`。
最终status于UTC `23:20:15.834`结束：根内零进程/任务、holder inactive、无解包标记；
root_bytes=11736329591，free_bytes=881766809600。原20分钟窗口提前收尾，此后无目标动作。

本地普通修复已在驱动submit前检查检查器遮罩，经真实关闭按钮收起抽屉并等遮罩消失，再点击输入框。
Mac Electron22/Node16原生夹具新增“关闭遮罩后输入框可点击”，4项PASS；Node20驱动13项及Node16语法PASS。
该源修改不改产品字节，Win7单次修正后完整旅程尚未执行；不得以Mac夹具补成该结论。
完整单次Office GUI、取消/迟到回复、正式Gate、真实模型、发布仍NOT_PERFORMED或保留原HALTED。

### 7.11 剩余取消链路的限定复验提案（PROPOSED，未授权）

建议按增量证据只补剩余取消/迟到回复，Office生成/读取/副本/记录/撤销按同源r4 ZIP及准确组件hash
引用a942o-b12c6d8e直接证据并标INHERITED_EVIDENCE；不再重复消耗其13次请求。
两次独立场景不会改写为一次完整GUI旅程PASS，完整单次旅程继续保留原HALTED/NOT_PERFORMED。

准确材料位于 `outputs/a9-42-tools/office-journey/prepared-r4-question-cancel/`。
场景驱动沿用已通过本地HTTP序列和Electron22/Node16语法的准确派生字节，driver SHA-256
`5fedb0205b5b1ddc45ddddf0862234883785abdd7c61ae3691a09a7d7d921446`，source-binding SHA-256
`ce2ddd02969fff4f692a66fd2fbde1b884eb5452249965d359da3e3aca1bb803`，材料manifest SHA-256
`d6a8492538ea768a5c407791b3686ece5898cccfbc4c74239129bab77e2f1827`。
产品源/ZIP/runtime/依赖均不变；该候选外场景不属于产品src修改。模板deadline=null且执行拒绝已验证。

提案为新15分钟DEV_CHANNEL窗口，最后10分钟不开新场景，真实模型0次，Win7夹具累计最多3次，
最多2个场景run；预计probe与ask各1次，预算不足不重试。新首个工作根 `C:\A9-DEV\work\a942o-2e94bc71\`。
严格原主机键、DCCS-CHAIZL-PC/7601/SP1/x64、普通agent Medium/会话2、自有inactive holder及容量/零未知生命周期
按既有流程重新确认，其他holder不接管。只使用该准确包的真实main/preload/IPC/Runtime/State/Core/Renderer，
仅目录选择器绑定独立工作区，Provider为本机夹具且不记住密钥。
直接核对未回答时无重发/写入、点击取消、pending清除、真实IPC拒绝迟到旧身份/版本回答且不重发、
原同批文档写入未落盘、SQL事件无原始sentinel、question pending/resolved各1与turn cancelled、正常关闭及独立postflight。
保留全部旧包/旧run/首失败；不生成新Office文档，不删除旧文件、不安装/改系统、不根外终止、不签正式Gate或发布。
该提案尚未授权目标执行，已关闭窗口不自动延长。

本阶段只读盘点见 `outputs/a9-42-tools/office-journey/native-retry-artifact-inventory.json`；
两轮原始结果、运行字节日志、失败/问询/副本截图及所有准备材料保留，未删除本地或目标文件。

### 7.12 限定取消场景批准与执行

负责人对§7.11准确材料回复“批准”。本轮从main `9b2e963a62b800b22bb991b808e6c200970f6937`
开启新15分钟DEV_CHANNEL窗口，最后10分钟不开新场景，真实模型0次、Win7夹具累计最多3次，最多2个场景run。
材料manifest、driver/source-binding与§7.11准确SHA相符，产品src树、源和r4包不变。
首个run `a942o-2e94bc71`，候选外证据位于 `outputs/a9-42-tools/office-journey/win7-r4-question-cancel-r1/`。
首次目标动作固定原窗口起止及收尾线；准入确认通过后立即部署并启动限定场景，不借用已关闭窗口剩余预算。
Office已完成场景只按准确hash继承，不改写为本次直接执行或一次完整Office GUI旅程PASS。

### 7.13 限定取消场景完成与增量证据汇总

本次窗口起点为2026-10-29 UTC `23:47:27.952`，收尾线 `23:52:27.952`，
截止2026-10-30 UTC `00:02:27.952`。准入直接确认DCCS-CHAIZL-PC/7601/SP1/x64、普通agent Medium/会话2，
自有holder inactive、根内无进程/任务、无未知解包状态；材料SHA及产品src树与§7.11一致。
只使用1个场景run、2次本机夹具请求（probe与ask）、真实模型0次。

真实产品main/preload/strict IPC/Runtime/State/Core/Renderer直接完成：

- 未回答期间不自动重发或写文档；问题卡可见，不记住密钥。
- 点击取消后pending清除；迟到的旧questionId/revision回答被真实IPC拒绝，模型请求数保持2，原同批文档工具未执行。
- Renderer无Node/进程权限，SQLite事件无本轮原始sentinel，正常窗口关闭。
- SQL问题pending/resolved事件各1，唯一turn为cancelled，工作区锁为空；输入包及运行副本完整性重新核对。
- 原启动任务正常移除后，独立普通用户postflight直接确认无阻断产品实例及异常根内实例。

Controller结论为 `QUESTION_CANCEL_CHECKS_COMPLETE_POSTFLIGHT_REQUIRED`，独立POSTFLIGHT为
`QUESTION_CANCEL_DEV_CHANNEL_COMPLETE`，两入口均0退出。本结论仅覆盖取消限定场景。
证据摘要见 `outputs/a9-42-tools/office-journey/win7-r4-question-cancel-r1/RESULT.md`，
原RESULT/ui-result/POSTFLIGHT及截图保留在 `outputs/win7-dev/office-journey/a942o-2e94bc71/`。
取消后截图沿用原驱动文件名undo-and-cancel.png，本场景没有执行Office撤销。

最终status于UTC `23:55:33.270`结束，提前收尾：根内零进程/临时任务、holder inactive、无解包标记，
root_bytes=12248077913、free_bytes=881235542016。搜狗环境实例PID10900/创建时间
`20261030074925.243000+480`按ADR-0297准确分类保留，未终止根外进程，不声称该实例同步退出。
此后无目标动作，本次窗口及请求预算不再开放。

| 当前范围 | 证据等级及绑定 |
|---|---|
| 取消、迟到拒绝、同批不执行、取消落盘及退出 | 本窗口直接DEV_CHANNEL，run a942o-2e94bc71 |
| 问询回答、DOCX/XLSX新稿/读取、原稿hash副本、工具记录、界面撤销及原件保持 | INHERITED_EVIDENCE，准确同包run a942o-b12c6d8e，限定继承已通过断言 |
| 单次完整Office GUI旅程 | NOT_PERFORMED；所有原HALTED不改判 |
| 真实模型、正式Gate A/B、长期资源预算、负责人实际使用验收与发布 | NOT_PERFORMED |

两场景产品源均为 `5143b9cf50f6ef598eda0d0b4e2fae17347f08d9`、ZIP SHA-256
`845853613765327ccb41786fb1763a2ef4aed531c32bc1c426668e41911dc063`、manifest SHA-256
`316a97129a92e2d00c5e6b12eecb69dd56cbd5d44981d1486d42d55778ef1a2c`，
未重建产品/原生或更换依赖；当前取消限定增量范围已覆盖完成，不改签整个产品或历史候选。

本阶段已只读盘点准确材料、本次run、通道原始文件及Git worktree入口，
记录见 `outputs/a9-42-tools/office-journey/question-cancel-artifact-inventory.json`。
全部材料保留，未清理本地/目标文件。后续仅修改状态文档，完成docs:check与diff检查；
未对已通过且输入不变的产品代码重复全量构建/测试。
docs:check首轮发现索引已更新但任务书头部仍为NOT_PERFORMED的元数据不一致；
统一为范围限定DEV_CHANNEL后，394文件/64任务检查PASS，git diff --check PASS，原失败日志保留。

## 8. 真实模型小规模试用与轻量资源测量（PROPOSED，未授权）

2026-10-29 负责人要求“使用gpt重置模式推进”，并以“开始吧”确认员工配置。
本节登记已获准的开发机准备。中继历史记录见§8.3；负责人后继要求“走直连”，当前范围见§8.4。
新Win7窗口、真实DeepSeek请求和费用预算仍待负责人单独批准；直连先复用已保存密钥，不要求重新交付。

### 8.1 本地交付（开发机）

候选外取证工具已本地提交为 `674ee54e7c8b3d0e16c382d7b2cb083003c9b4cd`，产品src、依赖与打包不变。
执行代理1（Codex Sol/xhigh/default）实现真实模型试用驱动、计数中继、样本与prepare；
执行代理2（Codex Terra/xhigh/default）实现Win7 WMIC资源采样器。主对话复核、整合并修复：

- 密钥形态扫描改为带边界及长度，避免 `disk-cache`、`task-stream` 等普通词使付费试用中止。
- 场景等待改为每秒只读回合状态；驱动与产品同进程，原每250毫秒全事件扫描会抬高被测CPU。
- Win7 WMIC空计数或空SessionId只记空值，不再丢弃整次采样；身份列仍严格。
- 采样与进程树观察共用每拍一次WMIC查询，失败计数且不复用旧结果；接入逻辑可单独测试。

| 内容 | 结果 |
|---|---|
| 场景 | S1读取DOCX标记；S2按XLSX生成DOCX报告；S3修改DOCX另存副本；S4问询后回答；S5问询后取消及迟到回复拒绝 |
| 判定 | 逐场景核对实际文件、原件hash、SQLite事实与问询事件；模型不按要求调用工具或提问记FAIL，不自动重试，不合成完整旅程PASS |
| 中继 | 产品Base URL为本机随机端口；固定上游 `https://api.deepseek.com`；含probe硬上限1～40；只记序号、状态码、耗时、字节与usage token数 |
| 密钥 | 运行根 `secret` 下文件读后即删，经匿名管道交给界面进程；DPAPI记住保持关闭；全部证据扫描原文及密钥形态 |
| 资源 | 阶段为启动、空闲60秒、各场景、关闭至进程树结束；记录工作集、私有字节、CPU%、句柄、进程数与查询开销 |
| 开发机检查 | 真实模型驱动19、原Office驱动13、采样器5项PASS；Electron22.3.27/Node16.17.1加载PASS |

员工1另报告Electron22运行时下真实Office引擎读取与副本回读PASS、Mac原生点击夹具4项PASS，
作为员工证据保留，日志未入库。完整产品GUI/SQLite场景、Win7与真实DeepSeek均NOT_PERFORMED。

已知限制：中继增加本机HTTP与Node HTTPS一跳，不覆盖产品直连公网的TLS与代理行为。
产品请求为流式，DeepSeek流式响应是否附usage为UNKNOWN；无usage时token数记UNKNOWN。
驱动运行在产品主进程内，其轮询开销计入主进程CPU。采样间隔约1.5秒，短命进程和采样间峰值可能遗漏。
WMIC查询自身开销在Win7的实测值为UNKNOWN；关闭后无残留仍以postflight为准。

### 8.2 试用材料与提案

材料位于 `outputs/a9-42-tools/real-model-trial/prepared-r1/`，清单
`materials-manifest-r1.json` SHA-256 `50ff1b1cf5426b968e6504af4f48175b108eab023bb19d5e350100098d80c739`。
产品源 `5143b9cf…`、r4 ZIP `84585361…1dc063` 与§7.13相同，driver SHA-256
`6a9f660a84175eb7cf7f6abdc4e8bbea0750c9880f59568d680ed367046fa7e0`，source-binding SHA-256
`516cf98bdff957e70278d6d67f8074e37ab2a8c9d41ecdb96c309a4c11cac438`；39个产品文件与117个编译文件正向绑定。
config-template deadline=null，已直接验证驱动以 `CONFIG_DEADLINE` 拒绝执行。

| 待批准参数 | 提案 |
|---|---|
| Win7窗口 | 60分钟DEV_CHANNEL，最后10分钟不开新场景；1个场景run，当前材料改用§8.3的 `a942r-e903d647` |
| 模型 | `deepseek-v4-flash`，固定上游，不经代理 |
| 真实模型请求 | 含probe最多30次，中继硬拒绝第31次；不重试已FAIL场景 |
| 费用上限 | 由负责人给出金额；本节不推测单价 |
| 密钥 | 窗口内由主对话经T3密钥请求取得，写入运行根 `secret` 后由驱动读后删除；不用DPAPI |
| 准入 | 原主机键、DCCS-CHAIZL-PC/7601/SP1/x64、普通agent会话2、自有holder inactive；复用已在目标机的r4候选目录，hash不符即HALTED |
| 网络前置 | 中继路线已选；获准窗口内先做1次无密钥 `/models` 检查，PASS后才交付密钥；具体门禁见§8.3 |

完成标准：五个场景逐项有结论；原件hash不变；S5取消后无新请求及写入；正常关闭；
postflight零根内进程/任务、holder inactive；资源阶段数据完整或明确UNKNOWN；证据无密钥原文。
结果只作DEV_CHANNEL，不签正式Gate A/B、负责人使用验收或发布。保留全部旧包、旧run与首失败；
不删除本地或目标文件，不安装、不改系统、不根外终止进程。

### 8.3 中继路线已选与无密钥前置检查（开发机）

负责人回复“那就走中继，继续推进”。执行代理按已选路线完成开发机准备。
该选择不补填费用金额，也不延长已关闭的Win7窗口。目标执行继续以§8.2待批参数为界。

执行代理已本地提交工具 `5579a4e7…`。改动只涉及候选外中继、驱动与测试，产品源和r4 ZIP不变。
新增检查能在密钥上传前识别目标机的DNS、TLS与固定上游连通失败；原本机HTTP夹具无法证明这些环境条件。

| 改动 | 确切行为与开发机证据 |
|---|---|
| 无密钥检查 | `--network-preflight` 固定GET `https://api.deepseek.com/models`；不发Authorization，不保存正文，不跟随重定向 |
| 网络栈与边界 | 复用中继的Node HTTPS，agent:false、不经代理；保留TLS默认校验；连接≤15秒、总时长≤30秒、响应≤64 KiB |
| 通过条件 | TLS验证成功且响应401；其他状态、截断、超时、DNS或证书错误记FAIL并保存结构化诊断 |
| 密钥前置门 | 运行检查时密钥文件必须不存在；控制器要求同run、driver SHA与固定上游的PASS记录，才继续读取密钥 |
| 开发机定向检查 | 试用驱动21项、资源采样5项PASS；覆盖无Authorization、401/200、总超时、拒绝连接、禁止复用及错误run/driver |
| 开发机运行时 | Electron22.3.27/Node16.17.1实际执行本机HTTP预检PASS；未连接外部上游 |

首轮新增测试为20 PASS/1 FAIL。夹具将状态值0经 `|| 401` 改成401，未制造超时。
执行代理修正该表达式后取得上述结果；首失败日志 `/tmp/a942r-trial3.log` 保留，不改判。
本轮日志位于 `outputs/a9-42-tools/real-model-trial/`。
Node22初次结果为 `preflight-tests-r2.log`，项目指定Node20.17.0复核为 `preflight-tests-node20-r2.log`，均26项PASS。
Electron/Node16直接结果为 `node16-preflight-r2.log`。docs:check为394文件/64任务PASS，verify:tools为PASS。

r2当前材料为 `outputs/a9-42-tools/real-model-trial/prepared-r2/`，run为 `a942r-e903d647`。
r1保持原字节，后续提案使用r2。完整哈希以 `materials-manifest-r2.json` 为准，其SHA-256为
`80d788c850024c9691d24017265dde52e64d09d5364b4efced223d15a21e14a9`。
driver SHA-256为 `4b55ae186ad3363c985c7b2d835d949fc15e2e20b1cf7c5acb92ff45f0c5003d`，
source-binding SHA-256为 `f1ebba1b7b0061672ec8ac1e2620057950ee2ecf3ed13976ef9eb37c9585e829`。
执行代理重新核对39份产品文件与117份编译文件；模板deadline=null以CONFIG_DEADLINE拒绝执行。

获准后的执行顺序见材料内 `EXECUTION_ORDER.md`：先查网络，再交付密钥，再运行控制器。
普通agent会话2仍是准备值，执行前须重新核对。网络检查FAIL即停止密钥交付和真实模型请求。

请求数上限不等于金额硬上限。流式usage缺失时，token数及费用保持UNKNOWN。
网络检查不证明密钥有效、模型工具能力或产品直连公网能力。Win7实机、外部无密钥检查和真实模型均NOT_PERFORMED。

### 8.4 产品直连与已保存密钥恢复（开发机，目标试用仍PROPOSED）

负责人明确“走直连”，取代§8.2～§8.3的中继线路与其专用前置步骤。
本轮起点为main `a484c1a…`、工作区干净。仅修改候选外试用工具、定向验证与文档；
产品src、99项办公依赖、原生工件和r4 ZIP均不变，不重建产品包。
主对话由环境切换为Codex Sol/max/default，保留该配置；已确认GPT重置员工配置不变，本轮未新增派单。

| 变化 | 精确行为 |
|---|---|
| 直连路径 | 产品Gateway仍调用原Node HTTPS，目的地固定 `https://api.deepseek.com`；无本机监听端口、无代理或请求改写 |
| 发送前限额 | 候选外驱动在加载产品前包装http/https.request，仅放行当前Provider的POST chat/completions；含probe与重试，最多30次，超额在原方法调用前拒绝 |
| TLS | 保留产品rejectUnauthorized=true及默认主机名/信任校验；拒绝自定义CA、代理连接入口、替代目的地与关闭TLS验证；目标握手尚未执行 |
| 凭据来源 | 同普通agent账户的 `%LOCALAPPDATA%\\Win7CodingAgent`；只读配置、API Key密文、Local State；只向新portable目录写非秘密配置、原密文和os_crypt.encrypted_key，不复制会话、数据库、Cookies或其他Local State字段 |
| 恢复入口 | 产品真实main/Runtime/safeStorage负责解密；驱动不自行调用解密、不输入或传递明文密钥、不改原地址。恢复失败即HALTED，不自动索取新密钥或切换线路 |
| 原数据保护 | 源文件有界读取、文件身份/变化/链接拒绝；写入前、产品退出后及postflight核对三份原文件hash；目标DPAPI恢复与原件保护仍需直接证明 |
| 取证 | 产品请求原样流式传输；仅保留计数、耗时、字节、usage与TLS元数据。请求内存中观察到的密钥只用于UI/SQL/截图文字的精确泄漏检查，不写出 |
| 进程日志 | 控制器不接收明文密钥，stdout/stderr仅保存原始字节数与SHA-256；正文不落盘，原生错误诊断深度因此受限 |
| 取消与退出 | 复用五场景、同批不执行、SQLite事实、原件hash、迟到回复拒绝与独立postflight；S5取消后连被拒绝的请求尝试也不得增加 |

Electron22上游源码确认safeStorage通过OSCrypt加/解密，Windows初始化读取Local State；
本轮只投影os_crypt.encrypted_key，实际能否恢复原Win7密钥仍UNKNOWN。
依据为[Electron22 safeStorage源码](https://github.com/electron/electron/blob/v22.3.27/shell/browser/api/electron_api_safe_storage.cc)、
[Local State读取](https://github.com/electron/electron/blob/v22.3.27/shell/browser/browser_process_impl.cc#L88-L109)与
[Windows OSCrypt初始化](https://github.com/electron/electron/blob/v22.3.27/shell/browser/electron_browser_main_parts.cc#L601-L613)。
本地加密材料只是合成夹具；Runtime恢复测试使用fake safeStorage，不将其写成Windows DPAPI通过。

开发机七模块编译/静态门PASS；直连7项、既有驱动20项、资源采样5项合计32项PASS。
直接覆盖真实Gateway流式请求、取消断开、重试不突破上限、并发拒绝、TLS参数拒绝、精确密钥扫描、
加密材料白名单、源变化/链接/损坏拒绝，以及真实Runtime+SQLite恢复成功/解密失败。
实际Electron22.3.27/Node16.17.1运行当前Gateway到本机HTTP夹具的3项检查PASS。
日志见 `outputs/a9-42-tools/real-model-trial/direct-*.log` 和 `node16-direct-r3/RESULT.json`。
首轮29PASS/3FAIL来自Mac临时目录祖先链接，修正夹具使用真实目录后6PASS/1FAIL来自快照方法名；
改用真实getSnapshot入口后通过。原日志保留，不放宽产品链接或恢复判据。

工具本地保存为 `f90d6a2…`，无推送。准确材料为 `outputs/a9-42-tools/real-model-trial/prepared-r3-direct/`，
run `a942r-8226e8de`；12份材料逐hash匹配，重新编译后39份产品/117份编译文件正向匹配原r4包。
driver SHA-256 `4bb0a7fa74d403faaa4686068c87cebb9830dc78d8849a07317aa992f957480b`，
source-binding SHA-256 `b97369a6f4ce4574ebe7c14e08c481df6f12f315faf72a732326b91ba126181d`；
完整清单 `materials-manifest-r3-direct.json` SHA-256
`b1ba27280893b6354bebb4be85611e59c47ef0faa5dea826b145a85ca0b00d47`。
模板deadline=null已直接取得CONFIG_DEADLINE拒绝；原r1/r2与全部失败保留。

| 待批准参数 | 直连具体提案 |
|---|---|
| 目标窗口 | 新60分钟DEV_CHANNEL，最后10分钟不开新场景；1个场景run，失败场景不重试 |
| 模型/请求 | deepseek-v4-flash直连api.deepseek.com；含probe和重试最多30次，超额发送前拒绝 |
| 金额 | 投资人给出可接受金额；现有工具仅硬限制请求数，无供应商侧结算/余额接口证据，不能保证金额封顶 |
| 加密数据访问 | 同普通agent默认userData三份文件只读，必要加密投影写新portable；原件不写、hash复核，恢复失败停止 |
| 目标准入 | 复核原主机键、Win7 SP1 x64、普通agent的活动会话/Medium、自己的inactive锁与无未知生命周期；会话2仅准备值 |
| 收尾 | 正常产品退出、独立postflight、原文件hash、根内零任务/进程及锁inactive；不执行close删根、不改系统或安装 |

具体顺序见材料内EXECUTION_ORDER.md。目标执行前模板deadline必须非空，不得借用§7已关闭的窗口。
Win7实机、真DPAPI恢复、公网TLS、真实模型与费用均NOT_PERFORMED或UNKNOWN。
请求次数上限不是金额硬上限；usage缺失时不推算结算值。
资源采样含驱动观察开销，空闲60秒和单次启动只构成开发基线，不签PERFORMANCE_BUDGET #1/#2/#3/#10达标。

本轮docs:check为394文件/64任务PASS，verify:tools与git diff --check通过。
只读收尾清单为 `outputs/a9-42-tools/real-model-trial/closeout-inventory-r3-direct.json`：
本轮材料、编译输出、合成夹具与两份原员工工作树均KEEP，无删除；工作树仍有未提交交付文件，进程占用UNKNOWN。
没有连接Win7、读取真实密钥、执行外部预检、发真实模型请求、安装依赖、修改系统、推送或发布。

### 8.5 直连实机试用批准（2026-10-30 UTC）

负责人针对§8.4具体材料回复“批准，可以适当延长窗口和使用次数”。
本轮从main `6427ef3…`执行原r4包和prepared-r3-direct准确输入。
以60分钟、30次发送请求起跑，必要时最多90分钟、40次累计发送请求；最后10分钟只收尾。
不因新run重置总请求数或时间；失败场景不重跑，普通取证修复保留首失败。
负责人已批准在这个有界请求范围内使用真实模型，未指定金额硬上限；不再以缺少金额阻止已批准动作，
实际usage或结算不可得仍记UNKNOWN，不宣称30/40次等于金额封顶。
普通agent产品进程获准读取默认userData的三份必要加密材料、向新portable写最小投影，原件只读且核对hash。
控制器/管理员通道不解密、不下载加密原件，不扩大到整套用户数据或其他秘密；恢复失败停止依赖场景。
沿用主机键、身份、锁、空间、安全停止与正常移除本轮临时计划任务；无根外终止、安装、系统修改、删除、正式Gate或发布。
实际起止、host/session和request总账在本轮候选外window.json及结果补录。

### 8.6 首次直连结果与Schema根因（原r4，2026-10-30 UTC）

窗口从UTC `03:27:28.282`开始；常规截止 `04:27:28.282`，最后10分钟收尾，
已批准的可用上界为 `04:57:28.282`及累计40次，当前输入仍60分钟/30次。
初始status直接确认原主机7601、agent会话2、自有holder inactive、根内零进程/任务、无解包标记。
原r4包/ZIP/39产品文件及driver绑定通过，run `a942r-8226e8de`真实产品恢复DPAPI，
key source=dpapi、available/remembered=true；原userData三文件hash在产品退出后及独立postflight均相同。
共6次真实HTTPS请求，TLS1.3及证书授权均为true；1次probe返回200/tool_calling，随后5场景均返回400。
S1/S2/S3原判FAIL/TURN_NOT_COMPLETED、S4/S5原判FAIL/MODEL_DID_NOT_ASK保留，不因正常退出改判。
SQLite只读诊断直接得到服务错误：ask_user的Schema items字符串不是合法schema；全部任务在执行工具前失败。

共同根因为Core内部ToolInputProperty使用type='string[]'、items='string'，Gateway原来只补根type=object，
没有把内部数组合同转换为标准JSON Schema；ask_user常驻工具表，所有场景都被同一缺陷阻断。
这是产品序列化bug，不改Core工具入参、权限、问询事实或保真语义。
最小修复在Gateway现有normalizeFunctionParameters：内部string[]转type=array、items={type:string}，
每项maxLength移到items内，maxItems保留；显式供应商JSON Schema保持原样。
依据为[JSON Schema数组规则](https://json-schema.org/understanding-json-schema/reference/array#items)。
新增真实Core工具表→Gateway→严格本机HTTP服务反例：旧实现直接400；修复后通过，覆盖200字符/6项边界、
源对象不变及显式vendor schema不改写。首轮反例测试自身ToolCall字段误写已修正，未把0项执行当作复现证据。
产品复现日志为schema-repro-before-r2.log；修复定向及受影响回归为schema-fixed-affected.log；
Electron22/Node16真实Gateway+实际ask_user工具表的4项检查见node16-direct-schema-fixed/RESULT.json。

本次控制器状态TRIAL_OBSERVATION_COMPLETE_POSTFLIGHT_REQUIRED仅表示取证完成，
独立postflight为TRIAL_DEV_CHANNEL_POSTFLIGHT_COMPLETE，仅证明原件hash和退出/任务链。
准确SGTool PID312/creation20261030113030.613000+480按ADR-0297保留，不根外终止。
资源取得50拍；空闲60秒观察树工作集均值279582105.6字节，CPU均值0.1384%（4逻辑核归一），
包含驱动及环境进程，不能分离为正式Shell/Main预算，也不能代表成功办公任务峰值。
原始证据在outputs/win7-dev/real-model/a942r-8226e8de；本轮准备/诊断在real-model-trial/win7-r3-direct-r1。
不重跑旧包失败场景。普通产品修复先完成本地验证、新源码与不可变开发包，再判定后继目标输入。

### 8.7 Schema修复包准备（新目标输入待确认）

产品修复本地提交 `08e41400bd24e54de12d9933553a9d742850d43d`。
Gateway定向与受影响回归21项PASS，实际Electron22/Node16工具Schema及传输4项PASS。
新开发包 `outputs/a9-42-tools/developer-package-r5-schema/`，ZIP SHA-256
`cd4a428baeeb0f6fd46d9f65d62deff75f787045d17b160d731927df03987da9`，
manifest SHA-256 `547fc9624a5af372f2f6d0cf13d12c4bdc14cae150496aa1c7cf95df7c1e4f20`。
与原r4仅3文件不同：Gateway编译JS、SBOM和开发检查元数据；3253文件同字节，无原生变化或删除。
原生工件不重编；新包完整性门直接通过，不把旧包整体通过继承给新包。

准确材料 `outputs/a9-42-tools/real-model-trial/prepared-r5-schema/`，run `a942r-f6440f58`；
source-binding SHA-256 `27c819309f7384c9e4dccd49aa986fea6fadcc7d5d4290ef6b72fb3ac767025e`，
39产品与117编译文件重新匹配，实际匹配包内Gateway字节通过Electron22/Node16本机HTTP4项。
新目标包字节已改变，尚未部署；具体提案见材料内EXECUTION_ORDER.md。
拟沿用本轮剩余窗口、新run最多24次，连同原6次累计最多30次，不增加已批准90分钟/40次上界。
原5场景FAIL、原r4和所有证据不覆盖。新包Win7/真实模型行为NOT_PERFORMED。

### 8.8 修复包在剩余窗口复验批准

负责人对§8.7准确材料选择“批准在当前窗口复验新包”。
允许新包cd4a428b…3987da9通过原r2通道部署至新SHA目录，run a942r-f6440f58；
窗口仍从03:27:28.282Z累计，当前截止04:27:28.282Z、新run最多24次，连同原6次最多30次。
必要延长仍以负责人先前允许的04:57:28.282Z/40次为硬上界；不重置日额或覆盖旧输入。
只复验已修复Schema的相同五场景，普通目标/身份/TLS/DPAPI/原件/收尾边界全部保持。

### 8.9 修复包首次启动HALTED与有界最小诊断

新r5已标准cand上传110535024字节、3257文件解包并复算hash，材料逐项匹配。
run a942r-f6440f58在空闲60秒结束、发模型请求前退出：子进程SIGTERM，deadline尚未到，
控制器原判UI_EXIT_UNEXPECTED/HALTED，ui-result仍IN_PROGRESS，direct-requests为0/0/0。
因此累计真实请求仍6次，未取得r5功能结论。原HALTED与零请求事实保留。
事后status直接确认自身锁inactive、根内零进程/任务、无解包标记；不等于补签异常退出为正常关闭。

旧取证控制器的进程观察异常会终止准确子进程，但只存通用标记且在退出检查后检查它，
首异常和相关WMI行丢失；本轮具体触发原因仍UNKNOWN，不能凭SIGTERM臆断产品或系统原因。
普通取证修复仅在候选外：先持久化首异常代码/类型及至多64行相关进程身份，再终止同一子进程；
先报观察异常，再判UI退出。所有身份/路径/会话硬门与终止边界不变，不忽略短命进程或放宽未知身份。
新增反例直接证明缺失image/session仍拒绝，诊断保留空值，非相关进程不入报告，任意异常文字不泄漏。
Node20定向21项及Electron22/Node16语法检查PASS。
下一步只做0模型请求的启动/选择工作区最小诊断，独立run与driver绑定；产品源和r5包不变，
沿用既有剩余窗口和累计预算，不整批重试未知原因，不以诊断通过改判旧HALTED。
