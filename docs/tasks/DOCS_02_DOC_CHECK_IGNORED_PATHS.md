# DOCS_02 — 文档检查器跳过 Git 忽略路径

```text
Status: COMPLETE
Task Type: DOCUMENTATION_GOVERNANCE
Target Branch: codex/a9-alpha2
Phase-Gate: COMPLETE
Win7-Validation: N/A
```

> 2026-09-24 负责人批准实现，开放问题按起草建议裁决（见 §8）；§3.2 可选项未勾选，
> 本任务不修改 `.gitignore`。实现仅限 §4 允许路径（AGENTS.md C14）。`DOCS_01` 虽列有 `scripts/check_docs.mjs`，
> 但其目标分支为 `codex/integrated-robustness`，不授权本分支，不得借用。

## 1. 问题与证据

- 2026-09-24 在 `f634044` 上运行 `npm run docs:check` 返回 `ok=false`，共 73 处失败，全部来自
  `outputs/**`（`.gitignore` 第 5 行忽略）中的独立审查输入快照，例如
  `outputs/a9-18-independent-review-2026-09-13-bqlq3w5m/input-snapshot/docs/tasks/README.md`
  的相对链接在快照目录内无法解析。仓库受版本控制的文档本身零失败。
- 根因：`scripts/check_docs.mjs` 的 `walk()` 遍历整个工作树，只跳过 `.git` 与 `node_modules`，
  不识别 `.gitignore`、`.git/info/exclude` 与全局忽略规则。因此本地生成物、沙箱快照和
  `.acceptance/` 下的文件都会被当作仓库文档检查。
- 后果：检查器长期为红，已在 `STATUS.md` 与多份任务书中被记为“既有噪声”，真实断链会被淹没，
  失去门禁作用。

## 2. 目标

`docs:check` 只检查仓库文档：已跟踪文件，以及未被忽略、未跟踪的新文件（待提交文档仍须受检）。
被 Git 忽略的路径一律不检查。其余全部检查语义保持不变。

## 3. 范围

### 3.1 必须完成

1. **文件枚举**：`docFiles` 改为来自
   `git ls-files -z --cached --others --exclude-standard`（在仓库根执行），再按现有规则过滤：
   `docs/**/*.md|html`，以及任意目录下的 `README.md`、`AGENTS.md`、`CLAUDE.md`。
   - 必须使用 `-z` 按 NUL 分隔解析，保证中文、空格路径不被 `core.quotepath` 转义。
   - `--cached` 会列出已从工作树删除但仍在索引中的文件；枚举结果须过滤掉不存在的路径，
     不得因此报读取错误。
   - `git ls-files` 执行失败时，记录一条 `{ kind: "enumeration", reason }` 失败并以非零退出，
     不得静默退回全树遍历（AGENTS.md §5“禁止静默吞异常”）。
2. **任务书枚举**：`taskFiles` 当前通过 `readdirSync(docs/tasks)` 获取。若保留，须确认
   `docs/tasks/` 下不存在被忽略的 `.md`；若改为同一枚举来源，须保持“索引恰好一次”检查语义不变。
3. **回归测试**：新增 `scripts/test_check_docs.mjs`。它在系统临时目录建立一次性 Git 仓库，
   复制 `scripts/check_docs.mjs` 到其中并构造夹具后执行，不改动当前工作区。至少覆盖：
   - 被 `.gitignore` 忽略的目录中含断链的 `.md`：**不**报错；
   - 未跟踪、未忽略的 `docs/` 新文档含断链：报 `link` 失败；
   - 已跟踪文档含断链：报 `link` 失败；
   - 文件名含中文和空格的已跟踪文档：被检查且链接可正确解析；
   - 已跟踪但已从工作树删除的文档：不报读取错误；
   - `git` 不可用或临时目录不是 Git 仓库：返回 `enumeration` 失败和非零退出码。
4. **负向对照**：用临时恢复旧 `walk()` 的方式，证明第 1 个用例在旧实现下失败、新实现下通过；
   对照结果写入交付说明，不保留对照代码。

### 3.2 可选（负责人批准时一并勾选）

- [ ] 在 `.gitignore` 中忽略 A9-16 几何探针重放生成的原始产物，避免重跑闸门后再出现未跟踪文件：
  `docs/reports/2026-09/a9-16-ui-evidence/win7-35-capacity-repair/*.dom.html` 与
  `docs/reports/2026-09/a9-16-ui-evidence/win7-35-capacity-repair/*.chrome.log`。
  不得忽略该目录下已跟踪的 `verify-*.json`、`REPLAY.md`、`probe/**` 与闸门脚本。

### 3.3 不做

- 不改变链接解析、任务元数据、任务索引、ADR 重复与 Accepted ADR 不可变、`latest-validation.json`
  绑定等现有检查的判定规则与失败格式（`kind`、`file`、`reason` 字段不变）。
- 不新增“链接目标必须已跟踪”规则（见 §8 开放问题 1）。
- 不修改 `package.json` 脚本名、`verify_integration.mjs`、任何产品代码、发布脚本或历史证据；
  不清理 `outputs/` 或 `.acceptance/`。

## 4. 允许路径

- `scripts/check_docs.mjs`
- `scripts/test_check_docs.mjs`（新增）
- `.gitignore`（仅当 §3.2 被勾选，且仅限其中两条规则）
- `docs/tasks/DOCS_02_DOC_CHECK_IGNORED_PATHS.md`、`docs/tasks/README.md`、`docs/STATUS.md`、
  `docs/STATUS_LOG.md`（状态回填）

## 5. 兼容性与依赖

- 本检查器是开发机/CI 工具，不进入任何 Win7 产品候选包（`scripts/release/build-a9-product-v3.mjs`
  不打包它），因此 `Win7-Validation: N/A`，不需要 Win7 实机证据，也不影响任何已冻结候选的哈希。
- 仅使用 Node 内置模块（`node:fs`、`node:path`、`node:child_process`、`node:os`、`node:url`）与
  开发环境已有的 `git`（脚本现已依赖 `git rev-parse` 与 `git show`）；不新增依赖，无需 C15/C16 登记。
- 本变更不影响接口、数据格式、Win7 兼容性或安全模型，不需要新增 ADR。

## 6. 验收标准

1. 在包含现有 `outputs/**` 的工作区运行 `npm run docs:check`：`ok=true`，退出码 0。
2. `node scripts/test_check_docs.mjs` 全部用例通过，且 §3.1 第 4 项负向对照有记录。
3. 人为在已跟踪文档中加入一条断链时 `docs:check` 失败，并精确报告该文件与目标；撤销后恢复通过。
4. 输出中的 `checked_files` 与 `git ls-files --cached --others --exclude-standard` 过滤后的文档数一致，
   交付说明给出两者数值。
5. `git diff --check` 通过；新文件为 UTF-8 无 BOM、LF。
6. 除 §4 允许路径外无其他文件改动。

## 7. 交付与状态回填

- 形成一个本地提交，提交说明写明负向对照结果与 `checked_files` 前后变化。
- 回填本任务书 `Status` 为 `COMPLETE`、`Phase-Gate` 为 `COMPLETE`，同步 `docs/tasks/README.md` 索引行，
  并在 `STATUS.md`“当前阻断与待办”中删除“文档检查”一项，时间线条目追加到 `STATUS_LOG.md`。
- 是否推送由负责人另行决定。

## 8. 开放问题与裁决（2026-09-24）

1. **断链判定是否要求目标已跟踪**：现有实现用 `fs.existsSync` 判定，指向被忽略但本地存在的文件
   （如 `.acceptance/**`）的链接本地通过、干净克隆失败。**裁决：另立任务评估，本任务不改。**
2. **目标分支**：草案定为 `codex/a9-alpha2`，与本轮文档整理同分支；如需与 A9 解耦，可改为从 `main`
   新建 `codex/docs-02-check-ignored-paths`。**裁决：在 `codex/a9-alpha2` 实施。**
3. **重放闸门覆盖已跟踪证据**：`verify-geometry-probe.mjs` 重跑会重写已跟踪的 `verify-*.json` 与
   `verify-geometry-probe-summary.json`（脚本第 85、262 行）。
   这属于 A9-16 证据治理问题，不在本任务范围。**裁决：在 A9-16 任务书中登记（文档修改，不属本任务实现）。**

## 9. 实施结果（2026-09-24）

- `scripts/check_docs.mjs`：`walk()` 全树遍历改为 `git ls-files -z --cached --others --exclude-standard`
  枚举并过滤已删除路径；枚举失败记录 `enumeration` 失败并非零退出。其余检查未改。
- `scripts/test_check_docs.mjs`：在系统临时目录的一次性 Git 仓库中执行真实检查器，7/7 PASS
  （干净基线、忽略目录断链不报、未跟踪未忽略文档受检、已跟踪断链报错、中文/空格路径与
  百分号编码链接、已删除跟踪文件跳过、非 Git 目录报 `enumeration`）。
- 负向对照：临时换回旧实现运行同一测试，“忽略目录断链不报”用例失败，旧实现报出
  `outputs/snapshot/README.md` 与 `outputs/snapshot/docs/README.md` 两条断链；恢复新实现后逐字节
  一致（`cmp`）并 7/7 PASS。对照代码未保留。
- 验收 §6：`npm run docs:check` 为 `ok=true`、退出码 0；`checked_files` 由旧实现枚举的 143 降为 137，
  与 `git ls-files --cached --others --exclude-standard` 过滤后的 137 一致；在已跟踪的
  `docs/README.md` 注入断链时精确报出该文件与目标、退出码 1，撤销后恢复通过；`git diff --check` 通过。
- §3.2 未勾选，`.gitignore` 未改；开放问题 3 已登记到 A9-16 任务书 §19。
