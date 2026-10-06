# A9-31 managed r1 问题修复独立补充复核

独立复核人：`/root/a9_31_managed_r1_independent_review`，`gpt-6-luna/high`；实现人：`/root`。
用户授权的同一只读复核继续核对已发现两项问题。本报告由主代理保存独立回复；复核人未编辑或运行测试。

## 绑定与结论

绑定基线 `2ecfc86d22bd7816cb75222db0917b25d32291a1` 及该基线之上的八项实现/测试修复差异：
managed build-profile、build.ps1、return verifier、synthetic fixture、kit测试、两份Runner测试、Shell后台测试。
修复尚未提交，无新 source SHA 或新 kit ZIP；不批准旧 r1。
后续 README/登记文档是主代理对结果的记录，不作为此八项独立源码复核范围。

**原 P1、P2 的本地根因/证据缺口已闭环；未发现新的 P0/P1/P2 阻断代码问题。**
新提交及新套件准确字节尚未形成，故套件批准前置仍未满足。
原 [r1 独立报告](a9_31_managed_r1_independent_kit_review_2026-10-03.md) 保留原结论，不改判。

## P1：跨 Jest VM 的错误构造器

better-sqlite3 database.js 仅在 addon 未初始化时设置 SqliteError constructor，原生 addon 保存持久句柄。
SqliteError 为 Object 标签且继承创建它的 realm 的 Error.prototype；Jest 的另一 VM 会将其判为非 Error，
使 rejects.toThrow 错报 Received function did not throw。
新增测试在另一个VM创建实际库的SqliteError ctor，注入共享 addon，再用真实SQLite trigger拒写。
它复现旧 matcher 的失败，同时核对 message/name、audit=1、ring/SQLite事件=0、后续派发阻断，
并以本 realm Error 作为 matcher 正向对照；finally还原原 ctor，未放宽产品审计。

首轮未强制跨realm的诊断在 instanceof 预期失败，原log保留；修正后整组8项PASS。
证据：`.acceptance/a9-31-developer/tests/background-audit-root-cause-r1.log`、`background-audit-root-cause-r2.log`。
解释历史两次 Jest 断言失败，不把历史FAIL重签，不替代真实Windows审计故障注入。

## P2：两种控制次序

managed smoke、返回校验器及synthetic fixture补齐四种控制组合，反例覆盖缺项、反序、被清理及错回执。
manager新增release处理中Stop拒绝、释放后句柄unknown，以及Stop先完成后不移交；
transport新增待回执时cancel保持UNKNOWN、确认release后cancel不发送控制。
首轮manager夹具两项失败保留；最终5个规定Runner测试文件166/166 PASS，独立复核已核对。
证据：`release-cancel-race-runner-r1.log`、`runner-review-fixes-r2-final.log`、`release-cancel-race-evidence-r1.log`。
七模块编译/静态检查PASS：`verify-quick-review-fixes-r1.log`。

独立回复形成时Shell/release整组仍在运行，本报告不替独立人签这两组PASS；主代理最终结果另记。
Windows PS、真实managed helper烟测/生命周期、独立双构建、返回审核、Electron与Win7仍NOT_PERFORMED。

## 最终只读证据核验追加

独立人随后核对候选外 review-fix-inputs-r1.json 的8项源码/测试及单列README尺寸/SHA，全部MATCH。
最终HEAD仍2ecfc86，24项Runner dist已恢复HEAD；Shell114/114、release180/0 FAIL及kit71/0 FAIL日志匹配。
两组Node日志各有2项Windows PS未执行，kit与release重叠不累加。
独立人确认本报告及原r1报告准确保留各自历史结论；最终无新的P0/P1/P2阻断代码问题。
仍未批准套件：修复未提交，新kit未形成；旧r1不改判，Windows/Win7未执行边界保持。
