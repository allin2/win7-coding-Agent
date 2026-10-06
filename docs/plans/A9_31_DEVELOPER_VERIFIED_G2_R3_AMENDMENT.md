# A9-31：G2修订r3——先构建再跑Shell组

日期：2026-10-05。Status: DRAFT_NOT_APPROVED。请求批准对[G2执行材料](A9_31_DEVELOPER_VERIFIED_G2_TEST_RUN_APPROVAL.md)
（56fd54e6…）及[修订r2](A9_31_DEVELOPER_VERIFIED_G2_R2_AMENDMENT.md)（dd778914…）的有限修订；其余条款不变。未在Win7实机验证。

## 1. r2运行事实（`developer-verified-g2-r2/`）

- Core 200/200、Runner 166/166、State 82/82、release `node --test` 200通过/2平台SKIP/0失败、`verify:quick`、`docs:check`、
  `diff --check`均退出码0。
- Shell组：117项中115通过、**2项失败**，随后jest无法退出、900秒超时。逐文件诊断：其余8个文件全部通过（11/2/5/5/7/37/7/16），
  `a9-lifecycle.test.ts` 27项中2项失败且超时。失败用例：“persists a managed background process and keeps Stop available after the
  turn completes”（期望1个`running`受管进程，实得0）与“does not resolve shutdown until managed background processes are reaped”
  （同因取不到`running`进程）。失败后测试夹具子进程未被停止，jest因此不退出——这就是r1“挂住”的原因。
- 工作树：构建改写的24个受跟踪Runner dist已按原字节恢复，1813个受跟踪文件与运行前一致，无新增未跟踪文件；5448基线0差异。
- 遗留：两个失败用例的夹具子进程`node -e "setInterval(() => {}, 1000)"`（PID 53273、60808，父进程1）仍在运行，未结束。

## 2. 原因（直接比对，结论待r3验证）

- 受跟踪的`src/runner/dist`最后一次提交为2026-09-07（`199e957`），早于A9-31全部Runner源码改动（2026-10-03起）；与2026-10-04
  “先构建后测试”时保存的编译清单（`win10-policy-readiness-r1/compiled-current-manifest.json`）相比，恰有24个文件不同，即本次
  构建改写的那24个。
- Shell产品测试加载各模块编译产物。§5清单把`verify:quick`（构建）排在Shell组之后，r1/r2的Shell组因此加载了A9-31之前的旧Runner
  编译产物；2026-10-04同一命令在构建之后运行、117项全部通过。
- 推断：两项失败源于测试顺序导致的旧编译产物，而非`ebda911`产品源码；r3以“先构建”验证该推断。产品包与Win10证据由源码重新编译，
  不受影响。另：仓库中提交的Runner dist落后于源码，作为发现交Codex评估，本授权不改它。

## 3. 修订（仅此）

1. 先结束PID 53273、60808两个由G2 r2派生的本机夹具进程，记录命令行与时长。
2. 新证据目录`.acceptance/a9-31-developer/developer-verified-g2-r3/`，r1、r2原样保留。
3. 在§5第1条之前先运行一次`npm run verify:quick`（记为`cmd-0-prebuild`，即2026-10-04“先构建后消费”的做法），再按§5原顺序运行
   全部8条（含其中的`verify:quick`）；其余运行方式同r2（无CI、stdin为/dev/null、每条900秒、进程组终止、finally恢复与汇总、Shell组
   `--json`输出、Shell超时则逐文件诊断）。
4. 运行后照常把受跟踪Runner dist恢复为原字节并核对。
5. C14（批准后、创建前登记）：`developer-verified-g2-r3/`下与r2同名的记录文件，另加`cmd-0-prebuild.{stdout,stderr,json}`与
   `killed-processes.json`。

## 4. 判读

若r3中Shell组117项全部通过：G2记为通过，r1/r2的失败作为“测试顺序导致旧编译产物”保留并写入Codex复核请求。若仍有失败：原样上报，
按产品缺陷候选处理，不在本授权内修复。批准须按本稿SHA256绑定。
