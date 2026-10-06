# A9-31：DEVELOPER_VERIFIED G2——在准确`ebda911`上一次性运行§5命令清单

日期：2026-10-05。Status: DRAFT_NOT_APPROVED。请求批准§1–5；依据[DEVELOPER_VERIFIED裁决材料r2](A9_31_DEVELOPER_VERIFIED_RULING.md) D1=B、D4。
本材料不授权产品源码修改、依赖安装、联网、提交/推送、远端动作、委派或阶段门登记。未在Win7实机验证。

## 1. 对象与前置核对

- 工作树`/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent`，HEAD须为`ebda91123e62b225c3fd104c9c9b564a4b61c466`；
  `git status --porcelain -- src native scripts release package.json package-lock.json`须为空（当前仅文档有改动）。任一不满足即停。
- 解释器固定为本机Node 20.17.0（`/Users/qlyf/.nvm/versions/node/v20.17.0/bin`，与§5“开发宿主Node 20.17”一致），只用已存在的
  `node_modules`，不执行任何安装。

## 2. 命令（与[任务书](../tasks/A9_31_BACKGROUND_PROCESS_TOOLS.md) §5逐字相同，顺序执行）

1. Core定向8个测试文件；2. Runner定向5个；3. State定向3个；4. Shell定向9个；
5. `node --test scripts/release/test/v26-prepare-kit.test.mjs scripts/release/test/a9-package.test.mjs`；
6. `npm run verify:quick`；7. `npm run docs:check`；8. `git -c core.fsmonitor=false diff --check`。

每条命令的stdout/stderr/退出码/起止时间原样保存。某条失败时**继续运行其余命令**并保留原始输出，不修改任何源码或测试、不重试成PASS；
平台条件跳过的用例记为SKIP，不计为PASS。§5中的“反例红”（临时移除owner/cursor校验等）需要临时改动实现文件，**不在本次范围**，
沿用2026-10-03记录，是否需在最终源码上重做交Codex复核判定。

## 3. 工作树保护

- 运行前：对全部受跟踪文件逐个记录size/SHA256，保存受跟踪的64个`src/runner/dist`文件原字节副本，记录未跟踪文件清单。
- 运行后：构建若改写受跟踪dist，用保存的原字节逐个恢复；再次核对全部受跟踪文件size/SHA256与运行前一致、`git status`除本次新增证据目录外
  与运行前一致；R5–R9冻结5448文件基线0差异。恢复的文件清单与差异逐项记录。

## 4. 证据与C14路径（批准后、创建前在任务书登记）

仅新增：`.acceptance/a9-31-developer/developer-verified-g2-r1/`下的`run-g2.py`（运行与保护脚本）、`before-tracked.json`、
`saved-runner-dist/`（原字节副本）、`cmd-<n>-<name>.{stdout,stderr}`与`cmd-<n>-<name>.json`（退出码与时间）、`after-tracked.json`、
`restored-files.json`、`g2-summary.json`。构建在工作树内生成的未跟踪产物如实列入`g2-summary.json`，不删除。

## 5. 结果的用途与边界

`g2-summary.json`及原始输出作为Codex复核输入之一；本次结果是Mac开发机结果，不冒充Windows原生、Win10桌面或Win7证据。
任何失败均原样上报负责人，不在本授权内修复。批准须按本稿SHA256绑定。
