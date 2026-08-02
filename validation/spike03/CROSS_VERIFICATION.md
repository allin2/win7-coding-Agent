# SPIKE_03 双向交叉论证（WorkBuddy vs codex）

## 证据关系

WorkBuddy 的旧报告 [`report_spike03.json`](../../spikes/03-git-adapter/acceptance/evidence/report_spike03.json) 保持不变。它在旧部署上发现 N02 filter 哨兵逃逸，且没有覆盖 N08/N09；因此旧结论不能直接作为当前安全通过。

codex 随后修复 `GitAdapter.prepare()`：仓库 `.gitattributes` 或 `.git/info/attributes` 含 `filter`/`diff` 外部绑定时 fail-closed，并用受控 MinGit 派生包重建独立 harness。Win7 报告 [`MVP-20260802-06`](../../spikes/03-git-adapter/acceptance/evidence/report_spike03_MVP-20260802-06.json) 与最新 [`MVP-20260802-12`](../../spikes/03-git-adapter/acceptance/evidence/report_spike03_MVP-20260802-12.json) 均绑定当前 adapter、isolation、whitelist、harness 与 `git.exe` SHA-256；最新 P01-P04/N01-N10 共 **14/14 PASS**，记录 8 组进程快照，验收监听连接为 0。

## 逐项裁决

| 对照项 | WorkBuddy 旧报告 | codex 当前报告 | 裁决 |
|---|---|---|---|
| P01-P04 | 部分 PASS，部署/哈希闭包不足 | 4/4 PASS，结构化 argv 与隔离变量绑定当前工件 | `CONFIRMED_FOR_MVP` |
| N01、N04、N05、N06、N07、N10 | 旧报告 PASS 或白名单拒绝 | 6/6 PASS，带进程快照 | `CONFIRMED_FOR_MVP` |
| N02 filter | 旧报告 FAIL，哨兵写入 | 当前 adapter 在 prepare 阶段拒绝仓库属性，PASS | `FIXED_AND_RETESTED` |
| N03 textconv | 旧报告触发不足 | 当前确定性属性样本被 fail-closed，PASS | `PARTIALLY_CONFIRMED`（仍需正式闭包） |
| N08/N09 | 未覆盖 | 当前 2/2 PASS，环境变量被清除 | `CONFIRMED_FOR_MVP` |
| 交付闭包 | 官方 MinGit ZIP 含 GCM/SSH/HTTP helper | 受控派生 ZIP 去除这些入口，哈希已绑定 | `PARTIALLY_CONFIRMED`；SBOM/许可证仍待正式归档 |

## MVP 状态

SPIKE_03 在当前受控派生包和当前代码上形成 **MVP PASS（14/14）**；这不是正式发布 SBOM、许可证或抓包闭包，也不替代 SPIKE_02 containment。旧 WorkBuddy 报告仍是有效的回归风险证据，而非被删除或改写的历史记录。
