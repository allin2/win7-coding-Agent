# A9-31 Shell永久删除高影响确认：精确本地修复批准材料

```text
Status: APPROVED_FOR_IMPLEMENTATION
Target Branch: codex/a9-31-background-tools
Source Baseline: 898ee9459a9b987840e94ddef336556ea58dd389
Scope: local product Policy repair and necessary tests only
Fourth Path Supplement: APPROVED_FOR_LOCAL_FIXTURE_ONLY (section 6)
Product package / remote retry / commit / independent / Win7: NOT_AUTHORIZED
```

[真实失败报告](../reports/2026-10/a9_31_product_r2_win10_execution_and_policy_failure_2026-10-04.md)已证明：Full Access下start_process的直接Remove-Item删除命令未等待目标确认便派发。当前r2根已停止，保持不可变，不恢复。

## 1. 成功条件和C14准确范围

本材料批准前不编写产品实现。拟在当前A9-31分支仅新增本次三路径实现/测试授权：

- `src/core/src/policy.ts`：只修checkAlwaysConfirmOperation的非Git永久删除分类；复用既有tokenize/审批链，不扩大Runner权限或改Tool/IPC/SQLite格式。
- `src/core/tests/policy.test.ts`：固定实际反例及删除执行形态/纯文本反例的Policy回归。
- `src/core/tests/a9-background-tools.test.ts`：start_process映射shell后确认/拒绝/绑定变化的零native派发回归。

允许治理文档为本材料、A9-31任务/索引、DECISIONS新增ADR、STATUS/STATUS_LOG及本次修复报告。批准后准确登记这三个路径与新增ADR，不改写Accepted ADR正文。其他新增源码路径须另报具体范围。
成功行为：直接Remove-Item及其已支持的明显删除执行形态返回ASK，pendingApproval先持久化，批准绑定完整可见command/目标/参数；拒绝、旧绑定或目标/参数变化零执行。正常读取/输出保持现有行为；Read Only继续拒绝写工具。

## 2. 最小实现与验证

在既有命令词/引号边界上识别PowerShell Remove-Item和删除别名、CMD del/erase/rd/rmdir与明确rm执行；检查实际调用、大小写、中文空格路径、分号/管道或控制流及既有cmd/powershell包裹，不把echo/Write-Output/注释中的文字当成删除执行。无法证明为纯数据的删除执行歧义保守ASK。维持PRD的尽力识别边界，不宣称解析任意Shell程序或形成安全沙箱；不新增解析依赖、系统API、原生改动或通用执行接口。
复用现有目标绑定approval/deny流程；不缩减原确认例，不用仅一个Remove-Item正则掩盖同类直接调用。若既有边界无法可靠承载上述范围，先用最小反例说明缺口，不自行新增模块或弱化规则。

先以实际失败字符串建立红测试，再做最小修复并确认ASK；真实Core调用链用拒绝和错误绑定证明零helper派发。纯文本及正常命令是防误判对照。命令本身只做Policy求值/隔离零执行测试，不运行删除、网络写、系统修改。
锁定Node20.17.0和已有离线依赖，不安装。先编译Core与实际依赖，再运行Policy新增用例及A9-31合同中受影响Core八组、Shell九组；消费当前编译输出，不用旧dist或forceExit。Runner/State/native未变项按精确矩阵分析继承；因新失败或具体影响才补跑。verify:quick/docs:check/diff --check按任务合同完成，生成dist保全后只恢复本轮造成的原字节变更，保护已有dirty文件。

## 3. 交付与授权边界

本地交付为三路径最小diff、准确源/模块哈希、首红/通过原始结果、影响/继承/未执行矩阵和ADR/任务登记；不自签独立或DEVELOPER_VERIFIED。
当前898ee945、r2 ZIP/master、已停止根及所有原始FAIL/UNKNOWN保留。新产品字节形成后另给准确源码提交、开发包和全新Win10合同；本批准不含提交/推送/合并、新打包、远端写入或普通入口重启、原生/锁/账户/系统改变、代理或Win7。

请求负责人仅批准本材料§1–3的本地三路径修复/必要检查和治理登记；未批准前这些产品修改仍NOT_PERFORMED。

## 4. 负责人批准登记（2026-10-04）

负责人回复“审批同意并检查有无类似问题”，批准原§1–3及相邻问题只读核查。原批准正文按SHA256 `ea809dc385650bdd87e861956291e335ec3993d8cdadf6559b77baac890ac054`保存在`.acceptance/a9-31-developer/shell-delete-policy-repair-r1/approved-contract-original.md`，原r2冻结副本不改。仅三路径删除Policy实现与必要检查/治理登记获准；发布/系统分类的范围外问题先报告具体反例，不扩大实现。C14和ADR-0170按本次实际登记；包、远端、提交、独立和Win7继续NOT_AUTHORIZED。

## 5. 必需检查的旧夹具修正：第四路径补批材料（未批准）

Status: DRAFT_NOT_APPROVED_FOR_FOURTH_PATH

本轮三路径修复后，Core合同首次检查302 PASS/1 FAIL；失败是`src/core/tests/a9-verification-evidence.test.ts:115`的R1-03把永久删除`rm file.txt`当作自主变更执行。新Policy正确返回ASK，Turn挂起使旧断言取不到verification。首失败保存，不降低安全门。

拟仅增加该测试文件一条路径，精确改一行：`rm file.txt` → `copy file.txt copied.txt`。仍测试edit→npm test→新的Shell写入后原验证信用失效；不改断言、生产分类器、审批或其他路径。该夹具Runner是jest.fn，无实际Shell执行。当前编译分类器纯求值须为ALLOW且mutating；补丁只做git apply --check，尚未应用。准确补丁：`.acceptance/a9-31-developer/shell-delete-policy-repair-r1/proposed-verification-fixture-r2.patch`。早先echo重定向提案纯分类为neutral，不适用，首草案/诊断保留。

批准后仅登记这一第四测试路径、应用该一行、重新运行Core原九组（Policy加八组）与文档/diff检查；源码/编译输出未变时继承本轮Shell117和七模块静态成功。此补批不批准发布/系统问题实现、新包/提交/远端/原生/独立/Win7。

## 6. 第四路径补批登记（2026-10-04）

负责人在明确§5的一行补丁和C14白名单问题后回复“批准”，批准原§5第四测试路径、copy替换及原Core九组/文档/diff复验。批准时全文及具体patch hash保存在本轮记录根fixture-supplement-r1/owner-approval.json和approved-fourth-path-contract-original.md；§5草案与原首失败正文保留，不改判。仅增加`src/core/tests/a9-verification-evidence.test.ts`，其他发布/系统实现、打包/提交/远端/独立/Win7不在补批内。

## 7. 同类高影响问题检查与修复授权（2026-10-04）

负责人明确要求“检查同类问题，如果确实存在请修复”，授权本地修复已确认的同类缺口。当前仍为898ee945、本工作树/分支、APPROVED_FOR_IMPLEMENTATION；此前四路径改动和原证据保留。16项实际源码纯求值复核再次确认8漏确认/2误确认：自主Git提前返回、Windows包命令后缀/前置参数/逃逸拼写漏识别，以及输出文字触发发布/系统正则。另确认审批UI只显示summary，而Core截断长命令或仅返回Git摘要，完整参数虽已绑定但操作不可完整看见。

C14本轮具体实施范围：`src/core/src/policy.ts`将既有有界删除识别扩展到npm/yarn/pnpm/cargo/twine发布/上传和这些包管理器明确全局安装，以及reg/net user/sc/icacls既有系统操作家族；执行边界、Shell包裹、控制流、引号/注释与纯数据按同一入口判断，位于自主Git返回之前。注册表/服务明确变更动词纳入，普通查询/项目安装保持自主；无法分析的明确执行歧义保守ASK，维持尽力识别合同。`src/core/src/a9-agent-loop.ts`仅补完整原command和显式cwd到审批summary，保留Git绑定信息、原digest算法和一次性审批流程。`src/core/tests/policy.test.ts`、`src/core/tests/a9-background-tools.test.ts`固定反例、数据对照及真实Core等待/拒绝/错误或变化绑定零派发。前一轮`a9-verification-evidence.test.ts`的一行夹具保持，本轮不追加改动。治理路径沿用§1。

影响是Policy和审批可见摘要的产品逻辑；无新模块/依赖/API、Runner/State/native/IPC格式变化。先保存当前源码红测试，编译七模块，再跑Policy加Core合同八组和Shell九组、docs/diff；只在纯Policy或受控端口下求值，不执行发布、删除、系统操作。真实Windows包/UI/SQLite/目标平台验证仍NOT_PERFORMED，本地端口测试不代签实机。ADR-0171登记本决定。当前证据根`.acceptance/a9-31-developer/shell-high-impact-policy-repair-r1/`；原r2/首FAIL/历史和dirty保留，不恢复R10。本指令不含新包、提交/推送/合并、远端写入/重启、系统改变、委派、独立或Win7授权。
