# A9-31 managed r3 独立返回复核存档

Reviewer: /root/a9_31_native_return_independent_review
Model: gpt-6-luna / high（按实际工具创建记录）
Implementation author: /root
Technical result: PASS_TECHNICAL_RETURN_EVIDENCE
Input-lock gate: NOT_APPROVED_FOR_INPUT_LOCK
Findings: P0=0 / P1=1 / P2=0（控制器生命周期证据缺口）

主代理按独立代理最终回复存档，未代签其结论。原回复作者泛称Codex / GPT-6；上方精确身份取实际工具记录。
下方报告保留原结论、时间、计数、边界及行号文字；点击链接仅规范化为仓库相对路径，原回复字节另存。UTC 06:53对应北京时间2026-10-03 14:53。
原回复存于 `.acceptance/a9-31-developer/native-kit-r3/independent-return-review-response-original-20261003.md`，
SHA-256 `dd214da5c8222e1a6dff9c701601a223e0f53ed00590f640853015e2c757d785`。

## A9-31 managed r3 原生双构建返回独立复核

**作者：** Codex / GPT-6，独立只读复核
**时间：** 2026-10-03 06:53 UTC
**范围：** branch `codex/a9-31-background-tools`，HEAD `a4ec353721af6e905e199d9859fa3d80f098e78e`。核验原始双构建返回、批准 kit 与登记绑定、记录器修正和相关生命周期证据；未生成产品锁、修改 tracked 文件或重新构建。

**结论：** 原生返回证据 **PASS_TECHNICAL_RETURN_EVIDENCE**；新输入锁 **NOT_APPROVED_FOR_INPUT_LOCK**。后者是控制器 PID 24088 的实际退出码及完整进程树清理仍为 `UNKNOWN`，触发 ADR-0157 下游停止门；这不构成原生 helper 或其 managed 根/子进程的失败判定。

**发现等级：** P0=0，P1=1，P2=0。唯一 P1 是阻止重锁的生命周期证据缺口，不是已证实的产品缺陷。

原始归档复核结果如下：

- source `10114503a1e79706131ea4a11a5b96bd2958807a` 与 kit ZIP SHA-256 `0191f61db2719eb42e0cbf822cbed6f6f07eeed69a7c5f0b04a9e19d54a367c1` 匹配。kit 的 source 文件逐项与该 commit 中的 `native/helper` 字节相同；input-lock SHA-256 为 `5d3159712d77ccd89e0a38e7e89379562685c98cc208d0b48c4d9f34912a68b4`，package manifest SHA-256 为 `82ae5dd5539a85facade3b8aea6659e15bcede90e0601fd6cca075912ca248de`。
- 批准登记 HEAD `a4ec353721af6e905e199d9859fa3d80f098e78e` 的 registry SHA-256 为 `9dffe8e85a2cb83a580f74cf449626ecfa1b2ac06f5d76ee2ea63cf83f018d8c`；工作树登记文件字节与该 HEAD 相同。登记 revision `A9-31-D013-V26-MANAGED-r3` 与 kit manifest 的原生 revision `a9-31-managed-r1` 不同，且各自绑定边界明确。
- BuildA run-id `3abe9a16-449b-4900-956e-6d0fb4c40fe2` 的 ZIP SHA-256 为 `251674103e519b4e642c46b38d2b8af29929732a209613cfc5d3721daba47a40`；BuildB run-id `33514a91-c5e8-4bb0-9176-135782175c88` 的 ZIP SHA-256 为 `ce8679187e120d8c0c9896fd201f37dfb1187e87d58702c3529f24b73737ff44`。每包有 71 个唯一条目；返回 manifest 的 70 个文件逐项 size/SHA 均匹配，清单集合与归档内容相符。两份 ZIP 的 helper 都是 361472 bytes、SHA-256 `2036bf697f16db523c297d150661b43be76458eb718ca24781ebed98ab51e4b7`。由工具文件哈希重新计算出的 tool identity SHA-256 是 `18fb8e85331d9a6c6c21064d29235b5c29d28007599b4de5457873216ad6bd65`。
- 原始 BuildA/B 记录显示同一 Win10 主机 `WIN-2JQ66JE4HTQ`、SID1005、Session 3、Medium integrity 8192、非提升、无 Host Job。Build transcript 记录 PowerShell 5.1、VS2019/v142/SDK 10.0.19041.0；PE/API/CRT 证据报告 x64、无 forbidden imports、无动态 CRT 依赖，Profile 指定静态 `/MT`。这不构成 Win7 实机兼容性证明。
- 两包的 `evidence/v26-managed.json` 均有四种 release/cancel 顺序。实测 helper/root/child PID、父 PID、启动时间、真实退出码和自然生命周期字段闭合。Win10 构建结果为 PASS；Win7 仍是 `NOT_PERFORMED`。
- backpressure 原始流以 sequence 12 的 `output_chunk` 结束，没有终态；streaming 汇总记录有界结果 exit code 10、已发 cancel。该行为符合既有约定的有界失败/终态缺失边界，保留其不确定性，不写成清理 PASS。

两处未提交记录器改动经只读 diff 检查，未发现源或哈希门被削弱。[record-a9-v26-helper-input.mjs:116](../../../scripts/release/record-a9-v26-helper-input.mjs) 保留登记项形状检查；[同文件:126](../../../scripts/release/record-a9-v26-helper-input.mjs) 仍精确校验批准的 input-lock 与 package-manifest 哈希；[同文件:132](../../../scripts/release/record-a9-v26-helper-input.mjs) 将登记 revision 与固定的原生 manifest revision 分开验证，并保留 source 绑定和归档闭包检查。对应负例在 [v26-prepare-kit.test.mjs:181](../../../scripts/release/test/v26-prepare-kit.test.mjs)：即使测试登记 revision 使用真实 r3 标签，错误的 native revision 仍须被拒绝且不生成锁。

我使用绝对 Node 20.17.0 运行了定向测试：`v26-prepare-kit.test.mjs` 为 93 项，91 PASS、0 FAIL、2 skipped（Windows PowerShell 平台项）。临时输出只写入新建且被 `.gitignore:41` 忽略的 `.acceptance/a9-31-developer/native-kit-r3/independent-review-tmp-20261003/`。200 PASS/0 FAIL/2 NOT_PERFORMED 的更广记录是实现方既有证据，本次没有重跑。

**重锁准入：** 当前仍不准入。BuildB final 将 PID 24088 的退出码和完整树清理标为 `UNKNOWN`；只读后飞行检查及 `managed-r3-controller-security-events-readonly-20261003T064537Z.json` 的 Security 4688/4689 查询结果 `NO_MATCHING_EVENTS_NOT_EXIT_PROOF`，都不足以回填证明。[ADR-0157:2508](../../DECISIONS.md) 的“未知或失败停止”规则和 [ADR-0157:2510](../../DECISIONS.md) 的生命周期停止规则继续生效；[任务书:183](../../tasks/A9_31_BACKGROUND_PROCESS_TOOLS.md) 也明确要求该 UNKNOWN 暂停下游。不能把进程不在表改写为清理 PASS，也不应重编已验证且未变化的 helper。

**最小后续路径：** 由负责人审议并批准新增的有限裁决（当前 ADR-0158 仍为 Proposed）。若批准，应将裁决严格限定到上列两份不可变返回、run-id、source、kit、registry 与相应证据哈希；独立报告和后续锁 provenance 均明确记录 controller exit/tree `UNKNOWN`、开发用途及背压边界，不改判既有失败、超时或清理状态。若负责人不接受该未知风险，历史 PID 生命周期已无法由现有补查证明；后续只能另行授权一项从启动时持有进程句柄并记录实际退出码及完整后代清理证据的新执行。ADR-0158 草案的边界见 [DECISIONS.md:2514](../../DECISIONS.md)–[2518](../../DECISIONS.md)。本次未登记 `return_review`、未生成锁；真实 Electron、Win7、候选验收均仍未执行。
