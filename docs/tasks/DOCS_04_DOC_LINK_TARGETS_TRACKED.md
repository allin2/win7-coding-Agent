# DOCS_04 — 文档链接目标必须属于仓库

```text
Status: COMPLETE
Task Type: DOCUMENTATION_GOVERNANCE
Target Branch: codex/a9-alpha2
Phase-Gate: COMPLETE
Win7-Validation: N/A
```

> 承接 [DOCS_02](DOCS_02_DOC_CHECK_IGNORED_PATHS.md) §8 开放问题 1（裁决为另立任务）。2026-09-24 负责人
> 批准实现，开放问题按起草建议裁决（见 §8）；实现仅限 §4 允许路径（AGENTS.md C14）。

## 1. 问题与证据

`scripts/check_docs.mjs` 的 `checkLinks()` 只用 `fs.existsSync` 判断本地链接目标是否存在，所以以下三类
链接在作者机器上能通过，但在干净克隆、其他开发机或 Linux CI 上会失效：

1. **目标被 Git 忽略**：例如指向 `.acceptance/**`、`outputs/**` 或 `docs/REMOTE_WINDOWS_CONNECTIONS.md`
   （由 `.git/info/exclude` 忽略）的链接。
2. **目标在仓库之外**：例如 `/tmp/...`、`/private/var/folders/...` 的绝对路径。2026-09-24 已在 A9-17
   任务书和两份报告中清理过 9 处这类死链（`17761ab`），当时它们已经失效，所以被检查器报出。但只要目标
   仍然存在，检查器就会放行。
3. **大小写与仓库路径不一致**：开发机 macOS 默认文件系统不区分大小写。实测在本仓库中
   `fs.existsSync("docs/readme.md")` 返回 `true`，而 Git 只跟踪 `docs/README.md`
   （`git ls-files docs/readme.md` 为空）。这类链接在区分大小写的文件系统上会失效。

现状（2026-09-24，`1d524cb`，只读扫描）：检查范围内 138 个文档共 598 个链接，其中 503 个本地链接；
没有一个指向已存在但不属于仓库的目标，也没有大小写不一致的链接。因此启用新规则不需要改任何现有文档。
本任务是预防性门禁，防止以后再出现 `17761ab` 那样的问题。

## 2. 目标

本地链接的目标必须是仓库中的路径，大小写也须与仓库一致：可以是文件，也可以是含有这类文件的目录。
仓库中的路径以 DOCS_02 的枚举口径为准：已跟踪的文件，以及未跟踪但未被忽略的文件。
其余检查的语义保持不变。

## 3. 范围

### 3.1 必须完成

1. **复用 DOCS_02 的枚举结果**：用同一次 `git ls-files -z --cached --others --exclude-standard` 的结果，
   构建仓库路径集合（统一为 `/` 分隔的相对路径）和目录集合（这些路径的全部祖先目录）。不得为每条链接
   另起一次 `git` 调用；枚举失败时沿用 DOCS_02 的 `enumeration` 失败，不再做任何链接判定。
2. **判定顺序与失败原因**：`kind` 仍为 `link`，`file`、`target` 字段不变。按以下顺序判定，命中即报：
   - 目标不存在：沿用现有 `target does not exist`；
   - 解析后的目标在仓库根之外：`target is outside the repository`；
   - 精确路径既不在路径集合也不在目录集合，但存在仅大小写不同的仓库路径：
     `target case differs from repository path <实际路径>`；
   - 目标存在，但不在路径集合或目录集合中（被忽略，或只存在于本地）：`target is not part of the repository`。
3. **链接指向仓库根**（解析结果为仓库根目录本身）视为合法。
4. **回归测试**：在 `scripts/test_check_docs.mjs` 中新增用例（沿用临时 Git 仓库夹具），至少覆盖：
   - 指向被忽略文件的链接：报 `target is not part of the repository`；
   - 指向仓库外、已存在的绝对路径：报 `target is outside the repository`；
   - 大小写不一致且文件系统不区分大小写时：报大小写不一致。在区分大小写的文件系统上，这条链接会
     命中 `target does not exist`，测试按当前文件系统的实际行为断言；
   - 指向未跟踪、未忽略的新文件：放行；
   - 指向仅包含已跟踪文件的目录，以及指向仓库根：放行；
   - DOCS_02 已有的 7 个用例继续通过。
5. **负向对照**：用 `git show HEAD:scripts/check_docs.mjs` 取出旧实现，在同一夹具中运行被忽略目标与
   仓库外目标两个用例，证明旧实现放行；对照结果写入交付说明，不保留对照代码。

### 3.2 不做

- 不把“未跟踪、未忽略”的目标判为失败（见 §8 开放问题 1）。
- 不检查外部 URL，不检查锚点（`#...`）是否存在。
- 不改变任务元数据、任务索引、ADR、`latest-validation.json` 等其他检查。
- 不修改任何现有文档内容（现状扫描为零命中）。

## 4. 允许路径

- `scripts/check_docs.mjs`
- `scripts/test_check_docs.mjs`
- `docs/tasks/DOCS_04_DOC_LINK_TARGETS_TRACKED.md`、`docs/tasks/README.md`、`docs/STATUS_LOG.md`（状态回填）

## 5. 兼容性与依赖

- 检查器是开发机/CI 工具，不进入任何 Win7 候选包，`Win7-Validation: N/A`。
- 仅使用 Node 内置模块与已有的 `git`，不新增依赖，无需 C15/C16 登记；不需要新增 ADR。
- 大小写判定在 Windows、macOS（不区分大小写）和 Linux（区分大小写）上都必须给出可解释的结果：
  前两者报大小写不一致，后者报目标不存在，两种都失败。

## 6. 验收标准

1. 当前仓库运行 `npm run docs:check`：`ok=true`，`checked_files` 与 DOCS_02 口径一致（交付说明给出数值）。
2. `node scripts/test_check_docs.mjs` 全部通过（DOCS_02 的 7 个加本任务新增用例），§3.1 第 5 项负向
   对照有记录。
3. 人工核对：在一个已跟踪文档里临时加入指向 `.acceptance/` 下已存在文件的链接，检查器报
   `target is not part of the repository` 并以退出码 1 结束；撤销后恢复通过。
4. 运行耗时不因逐链接调用 `git` 而明显增加：交付说明给出前后耗时。
5. `git diff --check` 通过；新文件为 UTF-8 无 BOM、LF；除 §4 允许路径外无其他改动。

## 7. 交付与状态回填

- 形成一个本地提交，提交说明写明负向对照结果与耗时对比。
- 回填本任务书 `Status`/`Phase-Gate` 为 `COMPLETE`，同步任务索引，在 `STATUS_LOG.md` 追加时间线条目。
- 是否推送由负责人另行决定。

## 8. 开放问题与裁决（2026-09-24）

1. **未跟踪、未忽略的目标算不算合法**：建议算合法，与 DOCS_02 的文档枚举口径一致；否则同一次改动里
   新增的文档与其链接的新文件，必须先 `git add` 才能通过检查。代价是忘记 `git add` 的目标不会被发现。
   如需更严，可另加 `--tracked-only` 开关供 CI 使用，不作为默认。**裁决：未跟踪、未忽略的目标合法；本任务不加开关。**
2. **大小写不一致的失败原因**：建议在不区分大小写的文件系统上报专门原因，并给出仓库中的实际路径，
   方便直接修正；不建议统一改报“不存在”。**裁决：报专门原因并给出实际路径。**
3. **仓库外目标是否允许白名单**：建议不设白名单。需要引用本机或外部路径时，写成代码格式（反引号），
   不写成链接，与 `17761ab` 的处理方式一致。**裁决：不设白名单。**

## 9. 实施结果（2026-09-24）

- `scripts/check_docs.mjs`：在 DOCS_02 同一次 `git ls-files` 枚举中构建仓库路径、目录与小写索引；本地链接在
  “目标不存在”之后依次判定仓库外、大小写不一致（附实际路径）、不属于仓库。无逐链接 `git` 调用。
- 验收 §6-1：`npm run docs:check` 为 `ok=true`，`checked_files=139`，与 DOCS_02 口径一致（本任务书新增后的数量）。
- 验收 §6-2：`scripts/test_check_docs.mjs` 12/12 PASS（DOCS_02 的 7 个加 5 个新用例）。负向对照：换回旧实现后，
  新增的第一个用例（被忽略目标）返回退出码 0 而非 1；另在一次性仓库中同时放入仓库外、被忽略、大小写
  不一致三条链接，旧实现 `ok=true`、退出码 0，新实现分别报出三种原因。恢复后逐字节一致，对照仓库已删除。
- 验收 §6-3：在 `docs/README.md` 临时加入指向 `.acceptance/evidence/WIN7-35-capacity-repair-dev-raw/MOVED.md`
  的链接，报 `target is not part of the repository`、退出码 1；撤销后恢复通过。
- 验收 §6-4：三次运行耗时，改动前 0.12–0.18 s，改动后 0.13 s，无明显增加。
