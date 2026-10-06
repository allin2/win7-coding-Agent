# A9-30 源码提交与 v26 kit 绑定（2026-10-01）

```text
Status: SOURCE_COMMITTED_KIT_READY_FOR_REVIEW
Branch: codex/a9-30-shell-streaming
Source Commit: a3b6a67dbda43c41d27cedccbdf0875e1acc46d9
Source Timestamp: 2026-10-01T14:04:17+08:00
Kit Status: PACKAGE_READY_NOT_APPROVED
Native helper / product input lock: NOT_LOCKED
Independent Reviewer: NOT_ASSIGNED
D-017 Build Host / User / Write Targets: UNKNOWN
Native Build / Real Electron / Win7: NOT_PERFORMED
Overall Developer Gate: NOT_SIGNED
```

负责人在本次对话回复“批准”，据此前一次请求的准确范围追加一次本地源码提交：61 个路径、
44 个实现/测试/模板路径，父提交 c14a96808d048c34f6079cc378ba12b4f60f5c62。
未将该批准解释为推送、合并、Accepted ADR-0153、kit 批准登记提交或构建机写入授权。
批准源差异和提交后的字节完全一致；提交后 A9-30 工作树干净。
记录见工作树 `.acceptance/a9-30-developer/closeout/source-commit-receipt.json`。

## 1. 源码审阅和验证继承

- 批准路径清单：source-review-paths.txt；源 SHA/尺寸清单 SHA-256 `3ed7ff152258bd294991eefeea947c29c4533d2001d739bf88978d5e62ffa931`。
- 批准补丁 SHA-256：`2855a3c322d86e83502a204eb816aa61c1e680e85aeb30971ce5d15b9664819c`。
- 逐文件校验全部 61 个 committed blobs 等于审阅工作区字节，父提交/分支/空暂存清单均核对。
- 本轮没有修改实现逻辑；继承[收口准备报告](a9_30_closeout_readiness_2026-10-01.md)中按精确源码哈希验证的
  v26 38、装配 108、最终 v26 2、Runner 215、跨块负向对照恢复后 57、7 模块 quick。
  不重复产品全量测试；本轮重新完成实际 kit 文件/ZIP 校验与文档/差异检查。
- 主工作区 HEAD、三处已有文件 SHA、两处 ZIP 删除和 24 个 v25/W42 历史文件均未改变。

## 2. 绑定到干净 source 的未批准套件

独立绑定 checkout 为 `/Users/qlyf/.codex/worktrees/a9-30-kit-binding/win7-coding-Agent`；建立时 HEAD 等于 source 且 status 为空。
仅用于 source→kit 构建输入绑定/检查，不承接产品实现。
在 checkout 中写入指定 source SHA 及 Git %cI，执行已提交的 prepare-kit/package-kit 入口。
生成器提取 13 个原生文件（含 stream_writer），kit 内共 23 文件，manifest 绑定其余 22 文件。
使用真实 ZIP 读取器校验唯一清单、逐文件尺寸/SHA、archive bytes 等于 checkout 字节，以及全部 13 源文件等于 source commit。

| 工件 | 字节/身份 | SHA-256 |
|---|---|---|
| A9_30_V26_BUILDKIT_r1.zip | 86745 B / PACKAGE_READY_NOT_APPROVED | `54879a93754b3561922120c6eb680ac6a5f926fbb7cf2f4b106e2bcde040b1fc` |
| kit input-lock.json | 构建输入锁，非产品原生返回锁 | `83907feaf73f06eabe56d037bdb5d898dfc40f73542a4af5f1605f2e5ef0dc4d` |
| kit PACKAGE_MANIFEST.json | 技术 READY_FOR_WIN10_BUILD，非批准 | `0aff15feb8744976a938b9ee3354e693b40097c4db0ad7e0a29babe701ab5a93` |

ZIP 及 .sha256 位于 A9-30 工作树 `.acceptance/a9-30-developer/closeout/kits/`。
详细绑定在 `kit-review-binding.json`；生成/封装日志分别为 kit-prepare.log / kit-package.log。
生成的 17 个白名单文件（2 个 source 元数据、13 个快照、kit 锁和 manifest）已逐字节复制回 A9-30 分支，
**仍未提交**。本报告和推进记录同样未提交，等待具体 kit/登记交付授权，不再自行追加第二个提交。

## 3. 后续门与负责人安排

批准登记仍 kits=[]，没有凭空填写批准项、返回复核人或 helper 哈希。
`release/win7-product-v3/a9-v26-input-lock.json` 仍不存在；上述 kit 输入锁不代表 helper 已构建/产品已锁定。
下一步请负责人指定独立复核人及 D-017 构建机/普通用户。按[交接包](../../plans/A9_30_DEVELOPER_CLOSEOUT_HANDOFF.md)
审阅协议/安全/API及本表三项哈希，另批准 kit/登记提交和准确构建机写入目标，再执行两个全新目录的原生构建。
只读预检为 UNKNOWN/NOT_PERFORMED；未连接或修改任何构建机。安装、系统策略变更和提权未授权。
独立返回复核、重锁和真实 Windows Electron 完成前不登记 DEVELOPER_VERIFIED。
没有 WIN7-43、候选 authority、完整 Alpha 2 或 RC 新结论；A9-31/A9-32 保持草稿。
