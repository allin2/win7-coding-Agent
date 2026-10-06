# A9-31：G2修订r2——Shell组超时后的重跑方式

日期：2026-10-05。Status: DRAFT_NOT_APPROVED。请求批准对[G2执行材料](A9_31_DEVELOPER_VERIFIED_G2_TEST_RUN_APPROVAL.md)
（已批准，SHA256 `56fd54e66fa1345bc994a3657b4c0bab09df610ad9bd186a83d90317004e9f4e`）的有限修订；其余条款不变。未在Win7实机验证。

## 1. 首次运行事实（`developer-verified-g2-r1/`）

- Core 200/200、Runner 166/166、State 82/82，退出码均0。
- 第4条Shell组在3600秒后被我方脚本超时终止；脚本未捕获该异常而退出，第5–8条未运行，未写`cmd-4-*`、恢复记录与汇总，**Shell组原始输出丢失**。
- 遗留进程：孤儿jest（PID 8369，父进程1，CPU 0）及其子进程`node -e "setInterval(() => {}, 1000)"`（PID 9428），后者与
  `a9-lifecycle.test.ts`中的测试夹具命令相同，提示该文件中某个测试未结束。哪一个测试挂住**未知**（输出丢失）。
- 工作树：1813个受跟踪文件与运行前逐SHA一致，无运行产生的新未跟踪文件；R5–R8冻结5448文件基线0差异。
- 对照：2026-10-04同一Shell命令（另加`--json --outputFile`）4秒结束、117项通过；本次我方脚本额外设置了`CI=1`且未关闭stdin，
  二者是否相关**未验证**。

## 2. 修订（仅此）

1. 先结束上述两个由G2运行派生的本机进程（8369、9428），结束前记录其命令行与运行时长；不涉及任何其他进程。
2. 新证据目录`.acceptance/a9-31-developer/developer-verified-g2-r2/`，r1目录原样保留。
3. 运行方式：不设`CI`、stdin接`/dev/null`；每条命令单独超时900秒，超时时保存已产生的部分输出并继续后续命令；脚本以finally保证
   恢复核对与汇总一定落盘。
4. Shell组命令与§5逐字相同，仅追加`--json --outputFile=<证据目录>/cmd-4-shell.jest.json`（2026-10-04先例），以取得逐用例结果。
5. 若Shell组再次超时：对9个Shell测试文件逐个以同样参数各运行一次（每个300秒），只用于定位挂住的文件与用例，记为诊断，不替代第4条结论。
6. C14（批准后、创建前登记）：`developer-verified-g2-r2/`下的`run-g2.py`及与r1同名的记录文件、`cmd-4-shell.jest.json`、
   诊断时的`diag-shell-<文件名>.{stdout,stderr,json,jest.json}`、`killed-processes.json`。

## 3. 边界

不修改源码或测试、不安装、不联网；任何失败或再次超时原样上报，不在本授权内修复。批准须按本稿SHA256绑定。
