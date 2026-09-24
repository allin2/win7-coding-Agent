# WIN7-36 实机 UI 子集验收收口（2026-09-24）

结论：同一冻结 WIN7-36 候选在 Win7 SP1 x64 普通用户非提权会话中，经候选自带报告器核验
15/15 项为 `PASS`，取得 `A9_16_WIN7_UI_SUBSET_INTEGRATION_PASS`。W36-06/12/13/15 的
`PASS` 均须连同负责人批准的**可达响应式状态等效**解释阅读；未发生的几何条件不写成直接实测。

| 绑定项 | 精确值 |
|---|---|
| 候选 / 源码 | WIN7-36 / `f0e80ecfabaaf8414d2778e4481f7e8d68e54f40` |
| ZIP SHA-256 | `8f730c5ae9ab86d83ecbfe3033a00e32a935dd5217d3ab30e4c75710adbe2a3a` |
| 独立 RELEASE_AUTHORITY SHA-256 | `7d335d76184dc6676680d5b1117a5babbb200b09fbdf6f32985ab37c5cea1708` |
| 实机 run / 目标 | `9d9b5cab-96ec-47e2-b7b3-8102a9ab6909` / `10.233.193.40` |
| 身份 / 物理屏幕 | `dccs-chaizl-pc\agent`，Medium；1366×768，AppliedDPI=120，DPR 1.25；实际内容视口 1079×540 CSS px |
| 正式报告 SHA-256 | `f7463691076491312c80fc83032417eb520bfede22c8be1c0edb4967a9e559e1` |
| 报告器输出 SHA-256 | `05d9d00818e0b094ec18803721aa8bf228e0e929277f775a54867827447c0c4f` |

G1 候选/授权/完整性、G2 打包自动 smoke、G3 正式入口首绘和后续 UI/真实 Provider 用例按本 run 的
候选外证据完成。报告器输出 `status=PASS`、`verified_cases=15`、
`direct_current_candidate_cases=15`、`disposition=A9_16_WIN7_UI_SUBSET_INTEGRATION_PASS`；
`REPORT_STAGE_V5_VERIFY_EXIT=0`，stderr 为空。计数是**同一当前候选的证据绑定**，不是
所有原文布局条件都在物理桌面上直接出现。

物理 1079×540 视口最坏形态有 2 组头、4 条完整 36px 行，Stop 与归档可见；
导航栏开/关 × Inspector 抽屉开/关四个**可达响应式状态**及恢复态均无页面横纵溢出，
会话列表节点与滚动位置保持。Win7 runtime 的 1240×700 四桌面 class 观测超过物理可用桌面，
不冒充目标视口的直接证据。请求 700px 实际钳到 847px；≤799px 分支及真正跨越 800px
保持 `PRODUCT_UNREACHABLE / NOT_VERIFIED`。W36-06 的原文三列同样不在 1079px 出现，
由可用的两列 + Inspector 抽屉功能等效接受。

完整候选外证据留存在本机 `.acceptance/runs/WIN7-36/9d9b5cab-96ec-47e2-b7b3-8102a9ab6909/evidence/`
及 Win7 同 run：`report-stage-v5.json`、`report-stage-v5-verify.json`、
`w36-06-responsive-equivalence-adjudication.md`、
`w36-12-13-15-responsive-equivalence-adjudication.md`、
`w36-12-13-15-physical-responsive-probe.json` 和原始截图/失败式对照。该目录被 Git 忽略，
**推送源码与本报告不会上传这些原始证据或冻结 ZIP**；须按现有保留规则独立保存。

WIN7-35 仍为冻结 FAIL；WIN7-36 ZIP、validation kit、旧报告和 authority 均未重写。
本裁决不签发完整 Alpha 2、Review、Shell streaming、RC 或通用发布 PASS。
