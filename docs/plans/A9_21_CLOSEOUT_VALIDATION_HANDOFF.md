# A9-21 收口验证交接书：真实 Electron 回归与 gateway 偶发失败

> 执行方：新会话。授权依据：[A9-21](../tasks/A9_21_A9_18_SALVAGE_PORT.md) §5 第 5、6 项与 §6。
> M0～M5 已全部完成并并回 `codex/a9-alpha2`（见任务书 §8）；本交接书只收口 §5 剩余两项，完成后按 §6 更新 `Phase-Gate`。

## 1. 当前状态

- 代码：`codex/a9-alpha2` 已含 M1～M4 全部改动；主工作区各包已构建，state 305、workspace 213、gateway 263、core 371、shell 447 项通过
  （2026-09-26，开发机 macOS arm64、Node 20.17）。
- 任务书头部 `Phase-Gate: A9_21_IMPLEMENTATION_AUTHORIZED`、`Win7-Validation: NOT_PERFORMED`。
- 仍开放的 §5 项：
  - **第 5 项**：A9-18 移植试验中 gateway 测试 10 次中 1 次失败，未捕获用例名。M2 期间执行方与验收方共连续运行 60 次（每次 263～266 项）未复现，原因未定位。
  - **第 6 项**：真实 Electron 启动与一次完整任务回归，未执行。
- 已知遗留（不在本交接书处理）：`main.js` 的 `deniedPermissions` 无上限；快照中 `listConversationFacts` 随 checkpoint 总数增长。

## 2. 第 6 项：真实 Electron 回归

### 2.1 环境现状（2026-09-26 核实）

- 仓库根 `node_modules/.bin/electron` 是断链：`electron` 包已不在任何 `node_modules` 中（疑为 2026-09-11/14 磁盘清理所致），本机也没有 Electron 下载缓存。
- `~/.electron-gyp/22.3.27` 头文件仍在，可离线把现有 `better-sqlite3` 8.7.0 编译为 Electron ABI 版本。
- 仓库已提交 `spikes/04-storage-index/build-win10/kit/inputs/electron-v22.3.27-SHASUMS256.txt`（与 `spikes/02-…` 下同名文件一致），其中
  `electron-v22.3.27-darwin-arm64.zip` 的 SHA-256 为 `2b87e9f766692caaa16d7750bfab2f609c0eab906f55996c7d438d8e18ac8867`。
- 冒烟入口 `src/shell/tests/product/run-a9-06-electron-smoke.mjs`：参数 `--electron=<可执行文件>`、`--electron-sqlite=<含 node_modules/better-sqlite3 的目录>`、
  `--out=<报告 JSON>`、`--keep-root=1`；产品入口 `main.js` 依赖 `src/shell/dist`，须先构建。

### 2.2 步骤

1. **准备 Electron（需负责人明确同意下载）**：下载 `https://github.com/electron/electron/releases/download/v22.3.27/electron-v22.3.27-darwin-arm64.zip`
   （约 90 MB）到会话临时目录，先核对 SHA-256 与上面的值一致，不一致即删除并停止。解压后可执行文件为
   `Electron.app/Contents/MacOS/Electron`。不得安装进任何 `node_modules`，不得修改 `package.json` 或锁文件。
2. **编译 Electron ABI SQLite（离线）**：在会话临时目录建 `<dir>/node_modules/`，从仓库根 `node_modules` 复制 `better-sqlite3`、`bindings`、
   `file-uri-to-path`，删除副本中的 `build/`，用 npm 自带 node-gyp 编译：
   `node "$(dirname $(dirname $(which node)))/lib/node_modules/npm/node_modules/node-gyp/bin/node-gyp.js" rebuild --target=22.3.27 --arch=arm64 --dist-url=https://electronjs.org/headers --devdir=$HOME/.electron-gyp --release`
   （头文件已缓存，不应联网；如 node-gyp 试图下载，停止并报告）。不得改动仓库自己的 `better-sqlite3`。
3. **构建**：在主工作区按 state → workspace → gateway → git-adapter → core → shell 的顺序 `npx tsc`。
4. **运行**：`node src/shell/tests/product/run-a9-06-electron-smoke.mjs --electron=<Electron 可执行文件> --electron-sqlite=<第 2 步目录> --keep-root=1 --out=<会话临时目录>/a9-21-electron-smoke.json`。
5. **判读**：报告 `status` 为 `PASS` 且全部用例 `passed: true` 为通过。记录用例总数、失败项（如有）、报告 SHA-256、Electron 与 SQLite 模块的 SHA-256、HEAD 提交。
   重点确认 A9-21 相关行为在真实进程中成立：启动恢复（M1）、脱敏（M1b）、checkpoint 列表首屏与“加载更早”（M3）、过程记录显示（M4）、
   一次含 read/edit/Shell、Diff、审批、停止与重启恢复的完整任务。

### 2.3 失败处理

- 失败先定位原因，区分 A9-21 引入的回归、既有问题、环境问题（例如 macOS 与 Win7 差异、驱动断言过时）。
- 只在 A9-21 §4 允许路径内修复 A9-21 引入的回归，并补对应测试；驱动断言因界面合法变化而过时的，可在 `src/shell/tests/product/**` 内修正并说明依据，
  不得为通过而删除断言。其他问题记录并停止，报告负责人。
- 冒烟结果只代表开发机 macOS arm64，不代表 Win7。

## 3. 第 5 项：gateway 偶发失败

1. 在主工作区 `src/gateway` 用 `npx jest --json --outputFile=<临时目录>/run-N.json` 连续运行，至少 200 次：其中 100 次空载，100 次在人为 CPU 负载下
   （例如同时运行若干个 `node -e "for(;;){}"` 并在结束后全部终止，或用 `--maxWorkers` 变化制造并发差异）。每次记录通过数与失败用例名。
2. 若复现：按失败用例定位根因（时序、端口、超时、共享状态等），在 A9-21 §4 允许的 `src/gateway/tests/**` 或 M2 允许的 gateway 源文件内修复，
   修复后同样条件下再连续运行不少于 200 次无失败；负向对照证明修复前可复现。
3. 若 200 次仍不复现：如实记录运行条件、次数与结果，结论写“未复现、原因未定位”，不得写成“已排除”。此时由负责人决定是否以该结论关闭第 5 项。
4. 负载进程与 jest 进程在结束前必须全部终止（确认 `pgrep -fl jest` 与负载进程为空）；不要与其他包的全量 jest 并行。

## 4. 记录与 Phase-Gate

- 结果写入任务书 §8（新小节“收口验证”）、`docs/STATUS.md`、`docs/STATUS_LOG.md`；证据文件在会话临时目录，文档中记录路径与 SHA-256，
  并注明临时目录可能被系统清理。
- 第 6 项 PASS 且第 5 项已复现并修复、或负责人书面接受“未复现”结论后，把任务书头部 `Phase-Gate` 改为 `A9_21_DEVELOPER_VERIFIED`；
  `Win7-Validation` 保持 `NOT_PERFORMED`。任一条件不满足则保持原值并写明原因。
- 本地提交，不推送；提交只包含本次相关路径。

## 5. 约束

- 先读 `AGENTS.md`、`CLAUDE.md`、`docs/WIN7_CONSTRAINTS.md` 与 A9-21 任务书；文档之间或与仓库现状矛盾时停止并列出矛盾清单。
- 使用 Node 20.17（`export PATH="$HOME/.nvm/versions/node/v20.17.0/bin:$PATH"`）。
- 不下载、不安装第 2.2 节以外的任何东西；除 Electron zip 外不联网。
- 不删除 `outputs/`、其他分支或工作树中的内容。
- 开发机结果不得写成 Win7 通过。
