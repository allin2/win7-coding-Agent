# A9-31 managed 独立复核问题修复与源码交接

## 来源与结论

负责人批准r2的51项精确源码提交，已形成 `2ecfc86d22bd7816cb75222db0917b25d32291a1`，
parent `c2b6356f83ef8502a34516010924547c57a3bec2`，逐文件尺寸/SHA/父blob校验通过。
只在 `codex/a9-31-background-tools` 本地提交，未推送、整合、写远端或启动构建。
随后生成23文件managed r1 ZIP，13项源码及6项模板与Git blob一致：

| 输入 | SHA-256 |
|---|---|
| ZIP | `bb74c56c839cb6b44b0cd8e81a91dc1c395c78fb863e0f736f6e6a253c8d4cc1` |
| input-lock | `cd3a96ebb528a7702c43e8eb34b2bd1b78dafb15304433d856e556b33bec306c` |
| PACKAGE_MANIFEST | `f269ceeb91172b9bd255a771ed64b0a7e96b32a5d07b2a1c5d5086d5537545bb` |

r1技术闭包通过，独立评审发现P1证据解释/P2竞态覆盖缺口，**r1不获批准，原ZIP及报告不改判**。
[初次独立报告](a9_31_managed_r1_independent_kit_review_2026-10-03.md)与
[修复独立补充](a9_31_managed_r1_review_fixes_independent_followup_2026-10-03.md)保留各自范围。
原ZIP和23文件冻结在 `.acceptance/a9-31-developer/native-kit-r1/`，不覆盖历史输入。

## P1 根因

历史Jest的rejects.toThrow误判共享原生addon持有的跨VM SqliteError。
库仅在isInitialized=false时设置ctor；实例tag为Object，其他VM的instanceof不匹配。
新增受控复现保留真实SQLite失败trigger，证明旧matcher报did-not-throw时实际audit已拒写：
audit=1、ring/SQLite输出=0、后续Turn被阻断；本realm Error是matcher正向对照，finally恢复ctor。
现有ASCII/中文审计例继续检查实际错误与所有阻断行为，未放宽产品审计。

首轮未强制跨VM的诊断假设失败，`background-audit-root-cause-r1.log`保留；
修正后的8项定向 `background-audit-root-cause-r2.log`通过。
独立人查看库JS/原生ctor持久句柄、测试及日志后确认本地根因闭环。
历史shell-r1/r3不改判，真实Windows审计注入仍NOT_PERFORMED。

## P2 两种次序

Windows managed smoke和返回验证扩为release、cancel、cancel-release、release-cancel四行。
release-first要求绑定回执、固定根/子身份、helper退出后存活及随后自然退出；cancel-first要求树清理。
返回校验拒绝缺行、反序、存活矛盾及错误回执。
transport新增待回执时cancel保持UNKNOWN、确认release后cancel不发控制；
manager新增release处理中Stop拒绝、移交后句柄unknown、Stop先完成不假报移交。

首轮manager两个夹具失败保留在 `release-cancel-race-runner-r1.log`：移交后句柄应unknown，
Stop必须提供完整结构化清理终态，不能只用kind=cancelled标签。
修正后规定Runner五文件166项、Shell九文件114项通过，verify:quick七模块通过。
独立补充关闭本地P1/P2；发布/打包最终结果见下方最终验证，不把synthetic返回当Windows证明。

## 准确修复提交材料

九项已批准实现/测试路径变化：managed build-profile、build.ps1、README_BUILD，
返回verifier、synthetic fixture、kit测试，两份Runner测试及Shell后台测试。
helper/Runner/Core/State产品逻辑未改，无新依赖或历史输入/候选修改。
文档登记独立发现、补充、修复、源码交接及状态；下一份清单是候选外
`.acceptance/a9-31-developer/handoff/source-approval-r3.json`，绑定逐文件尺寸/SHA。
当前修复未提交，无新准确source或kit。具体批准后只暂存清单路径，不包含Runner生成dist、
证据、数据库、node_modules链接或17项旧r1生成文件。
新提交后生成新的未批准ZIP；新kit准确哈希仍需复核/批准，构建目录与动作另行审批。

## 环境及Gate

最近只读预检记录Bitvise试用到期拒绝普通a9builder SSH、管理员管理连接可用；
这是历史预检状态，未在本轮重检，不授权以管理员替代普通/Medium/无Job构建。
旧过期控制器不恢复，不创建账户、不改ACL/UAC/服务或安装组件。
A9-31保持IMPLEMENTATION_IN_PROGRESS，新managed产品锁NOT_LOCKED。
Windows PS/Win32双构建/真实Electron/Win7均NOT_PERFORMED；A9-32/33仍草稿，
候选未冻结，不签完整Alpha2、RC或第二批Win7 PASS。

## 最终本地验证

| 组 | 结果 | 原始日志 |
|---|---|---|
| Runner规定五文件 | 166 PASS | runner-review-fixes-r2-final.log |
| Shell规定九文件 | 114 PASS | shell-review-fixes-r1-final.log |
| 发布/kit/打包全组 | 180 PASS / 2 Windows PS NOT_PERFORMED | release-review-fixes-r1-final.log |
| README最终字节后的kit定向 | 71 PASS / 2 Windows PS NOT_PERFORMED | v26-review-fixes-r2-final.log |
| verify:quick | 七模块PASS | verify-quick-review-fixes-r1.log |

上述日志位于候选外 `.acceptance/a9-31-developer/tests/`；最后kit定向与全组重叠，不重复加总。
直接计数460=166+114+180，未变Core185/State70按准确源码/依赖/配置继承255，总计715。
原native逻辑及四类故障反例未受产品源码变化影响，只继承其原范围，不作为Windows证据。
Runner24项tracked dist在检查后已保存新生成字节再恢复HEAD，不纳入源码修复提交。
本地矩阵见 `.acceptance/a9-31-developer/handoff/local-evidence-matrix-r3.json`；历史矩阵不改绑。
