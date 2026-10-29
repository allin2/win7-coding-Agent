# A9-42 Office Lite 支持范围与实现

状态：本地开发实现及限定Win7开发试用完成。后续本地迭代基线main `300fa178…`。
负责人追加“实现Office Lite”，随后要求当前 Codex/Sol 接手未完成引擎。
所属授权与直接证据：[A9-42](../tasks/A9_42_LIGHTWEIGHT_AGENT_TOOLS.md) §4.4～§4.5。
Win7普通用户产品启动与模块试用见任务书§5.4，结果仅为DEV_CHANNEL。
完整Office Agent GUI旅程、正式验收及视觉保真仍NOT_PERFORMED；前期记录按下列历史日期理解。

## 1. 总经理建议

核心默认不加载办公引擎。已实现按需启用的本地纯 JS DOCX/XLSX 模块；PDF 文本继续保留待办，
不为凑齐工具而使用不兼容产品 Node 16 的新库或未经核查的旧版。
本地路线不要求上传文档，不新增常驻服务；解析必须具备输入与解压后大小、数量、取消和进程退出控制。
Office 解析不能直接阻塞 Electron Main，也不能给 Renderer 文件权限。
如需进程执行，仍经既有受控执行链；具体进程协议和 Runtime Profile 必须先完成 ADR/C15/C16 登记。

## 2. 本版支持矩阵

| 格式 | 读取 | 生成与修改副本 | 明确不保证 |
|---|---|---|---|
| DOCX | 段落、标题、简单表格内容；报告提取警告 | 从结构化内容生成新文件；修改仅限本模块模板/已声明子集，输出新路径 | 原稿分页、字体替代、页眉页脚、文本框、修订、复杂嵌入对象保真 |
| XLSX | 单元格值、类型、简单表格；公式文本和缓存值分别标识 | 新建或修改经检测支持的简单工作簿副本；不覆盖原件 | 公式重算、宏、外链、数据连接、图表、透视表、复杂格式往返不丢失 |
| PDF | 本版不支持，返回 A9_OFFICE_FORMAT_UNSUPPORTED | 不编辑、不生成 | 文本提取、扫描件 OCR、版面渲染、签名保持和加密解锁均未交付 |
| DOC/XLS/PPT/PPTX、宏文档 | 明确拒绝，不伪装成文本读取成功 | 不生成、不改写 | 不以扩展名重命名充当格式转换 |

操作契约：模型工具已注册 `document_inspect`、`document_read`、`document_write_copy`。
inspect 返回版本化格式/能力/警告；read 有位置、数量、字节与续读信息；write_copy 绑定输入哈希、
输出路径与允许操作，复用 Policy/checkpoint/原子写。写前拒绝同源目标、未知格式、加密/宏和不支持结构。
输出注明提取或结构验证层级，不返回“保真成功”。缓存公式值不得标为当前已计算结果。

## 3. 前期候选调查（历史资料，实际锁定见 §4）

2026-10-29 读取 npm 官方注册表指定版本元数据，没有安装、下载执行包或改 lockfile。
原始版本、tarball URL、注册表 SHA-512 integrity、顶层依赖与解包体积已保存到
`outputs/a9-42-tools/office-candidate-metadata.json`。该文件是研究材料，不是完整交付锁。

| 候选 | 顶层声明 | 用途/限制 | 结论 |
|---|---|---|---|
| mammoth 1.11.0 | Node >=12；BSD-2-Clause；包解压 2,161,895 字节 | DOCX 内容提取；忽略部分格式，转换 HTML 不自带净化 | 候选；只输出结构化纯文本，不直接执行或显示来源 HTML |
| docx 9.5.1 | Node >=10；MIT；包解压 3,354,101 字节 | 生成 DOCX；不将生成能力等同任意原稿无损修改 | 候选；先限定模板与结构化新建 |
| exceljs 4.4.0 | Node >=8.3.0；MIT；包解压 21,825,509 字节 | XLSX 读写；公式需要外部提供计算结果 | 候选；体积明显较大，测量闭包后再定 |
| pdfjs-dist 6.4.299 | Node >=22.13.0 或 >=24；Apache-2.0；包解压 34,913,648 字节 | PDF 读取/渲染路线 | 与产品 Node 16 声明不匹配，不直接引入 |

上述体积不是最终包增量、常驻内存或峰值，传递依赖未包含。顶层 engines 满足不代表依赖闭包或 Win7 通过。
完整锁定版本、各工件 SHA-256、传递依赖许可证、漏洞评估、运行前提及 Win7 实测均尚未完成。
必须在允许新增依赖后完成隔离验证，未满足前不得把任何候选登记为产品支持能力。

上游依据：

- [mammoth 官方说明与安全边界](https://github.com/mwilliamson/mammoth.js#security)：默认禁止外部文件读取；生成 HTML 未净化；恶意文档可消耗大量资源。
- [docx 官方 API](https://docx.js.org/api/)：JS/TS 文档生成能力。
- [ExcelJS 4.4.0 声明](https://raw.githubusercontent.com/exceljs/exceljs/v4.4.0/package.json) 与
  [公式说明](https://github.com/exceljs/exceljs#formula-value)：库不自行计算公式结果。
- [Python 3.9 Windows 支持](https://docs.python.org/3.9/using/windows.html) 与
  [当前 pypdf 要求](https://pypdf.readthedocs.io/en/stable/user/installation.html)：Win7 官方路线停在 Python 3.8，而当前 pypdf 要求 3.9+；不能直接采用最新版组合。
- 指定版本元数据：[mammoth](https://registry.npmjs.org/mammoth/1.11.0)、[docx](https://registry.npmjs.org/docx/9.5.1)、
  [exceljs](https://registry.npmjs.org/exceljs/4.4.0)、[pdfjs-dist](https://registry.npmjs.org/pdfjs-dist/6.4.299)。

## 4. 实际依赖与使用方式

实际运行闭包：docx 8.0.0、exceljs 4.4.0、@xmldom/xmldom 0.9.12、jszip 3.10.1；
ExcelJS 的 uuid 固定11.1.1，unzipper固定0.12.3。总99个npm工件，精确传递版本与来源见
`src/shell/office-lite/package-lock.json`；SHA-256、文件哈希及许可证见同目录 `DEPENDENCIES.json`。
不使用 mammoth，不转换或执行来源 HTML。读取 DOCX/XLSX 使用有界 ZIP/XML，不启动 Office、Python 或外部服务。
生成使用锁定库，每操作单个按需 Worker；只有成功退出并完成内容回读后才发布新副本。

开发机依赖准备：`npm ci --prefix src/shell/office-lite --ignore-scripts --registry https://registry.npmjs.org`。
该模块不加入根 workspace，也不在目标机在线安装。未携带时不暴露文档工具，文本工具仍可用。
打包入口校验锁与每个依赖文件哈希，复制可选模块、许可证和 Worker，SBOM保留所有工件。
库升级后须更新依赖证据并重新验证；不能只改版本号或借旧清单打包。

模型可按以下顺序调用：

1. `document_inspect({path:"原稿.docx"})` 获取能力与sha256。
2. `document_read({path:"原稿.docx",start:0,limit:50})` 读取内容；有nextStart则续读。
3. `document_write_copy` 使用新目标路径和完整结构化content，生成新文件。

content为JSON字符串。DOCX示例：`{"schemaVersion":1,"format":"docx","blocks":[{"type":"paragraph","text":"正文"}]}`。
XLSX示例：`{"schemaVersion":1,"format":"xlsx","sheets":[{"name":"数据","rows":[["名称",12]]}]}`。
修改本模块原件时同时提供sourcePath和sourceSha256；将完整替换内容写入新路径，原件字节不变。
普通原稿可读，但canModify=false；需要新稿时以读取结果重新组织内容生成，不能声称原稿无损修改。
本版日期按存储值读取并标记原始格式索引；公式只返回文本和缓存，不提供日期格式化或公式计算。

已执行开发机验证集：中文/空格路径、非 ASCII 段落及表格；XLSX 日期/空值/公式缓存分离；
超限 ZIP、异常 XML、外部关系、宏、加密、损坏包拒绝；取消后输出不冒充完成；原件哈希不变；
副本重新读取并核对结构和内容。视觉保真另需 Office/渲染实证，文本回读不能替代。
资源测量绑定 PERFORMANCE_BUDGET #1/#2/#3/#10；先记录当前基线，再测启用、空闲、连续文档和退出释放。
开发机小样本资源观察保存在 `outputs/a9-42-tools/office/resource-development.json`，不进入正式性能预算状态。
Win7资源增量及产品Electron表现仍为UNKNOWN；其直接运行验证均NOT_PERFORMED。

## 5. 后继运行证据与本地迭代

§4末尾描述的是初始本地实现时点。2026-10-29已补实际Electron22/Node16模块和Win7普通agent开发试用，
准确源码 `94135364fa922261d1f0b281ddb29c34b900c7b7`、ZIP `751c76f2…d72085d`。
Win7中包内DOCX/XLSX真实Worker读写、原件保护、撤销及32次读取已直接执行，34个Worker均退出。
产品portable启动/Read Only/对话持久化/正常关闭也已执行；办公工具与产品窗口的完整Agent旅程仍未证明。
资源为限定样本，不作为长期性能或完整应用预算结论。原始证据见 [A9-42 §5.4](../tasks/A9_42_LIGHTWEIGHT_AGENT_TOOLS.md#54-win7普通用户直接开发试用完成dev_channel)。

负责人随后批准打包优化和界面链路的GPT重置Fast推进，范围见任务书§6。
交付裁剪仅按ADR-0303生成新包子集，不改原始依赖或旧包；真实界面链路只用本地模型夹具，
不得把Runtime替身或模块测试当完整产品链路；新Win7窗口另行批准。
