# A9-31 r2：Win10 准备、范围纠错与普通桌面入口阻塞

日期：2026-10-04。结论：`PREPARATION_COMPLETE / ORDINARY_ENTRY_BLOCKED`。

负责人批准的四源实施、新根准备、固定捕获编译和准入已完成；修正后的两个不可变 revision 通过目标端冻结校验。普通桌面输入没有响应，新入口没有启动，八个产品 phase 全部 `NOT_PERFORMED`。这些准备结果不构成新包 Windows 产品 PASS、独立收口或 Win7 PASS；A9-31 保持 `IMPLEMENTATION_IN_PROGRESS`。

## 1. 准确授权与产品输入

工作树为 `/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent`，分支 `codex/a9-31-background-tools`，HEAD 仍为 `898ee9459a9b987840e94ddef336556ea58dd389`。负责人本轮回复“批准”，批准 [r2 Win10 合同](../../plans/A9_31_PRODUCT_R2_WIN10_VALIDATION_APPROVAL.md)原 §1–5；原合同及批准在证据根内不可变保存。

| 输入 | SHA-256 / 身份 |
|---|---|
| 原批准合同 | `9c21e3b78811f45f7502a5d3d29179932776d30f5b8401f260454d66e45ca99e` |
| 本轮批准记录 | `a593b05e539ee60bbc4eb27299d40f18adb039f3ddf05a01c9e5e51346bd55f0` |
| r2 ZIP，101324304 bytes | `d7323ac4f6ddb674eb93fdea2cd2007ed62679268afe37a6df8df29115122c47` |
| r2 manifest，150177 bytes | `1c5084a4a8d194e33af48d6c15d3e661f0808931558eacf41b849016816b6225` |
| managed lock | `7593e7584305fd76f8ebb7d99adbdcb302a3272ccd616423c2346bd7ff461d3e` |
| helper | `2036bf697f16db523c297d150661b43be76458eb718ca24781ebed98ab51e4b7` |
| 包内 State | `4e99d27e7b07dff99a7523a57a3baba5e5ca3c6b48f64cea2b546d5057926243` |

包仍为 `A9_31_DEVELOPER_CHECK_NOT_WIN7_CANDIDATE`，784 文件、无 authority、外部正式验收资格 false。[本地装配报告](a9_31_product_r2_local_package_2026-10-04.md)和原本地矩阵保留，不改绑其历史 Windows 未执行状态。

## 2. 本轮目标端准备及实际边界

严格 SSH 实查为 `192.168.1.4 / WIN-2JQ66JE4HTQ / Windows 10 Pro build19045`。Administrator 只执行准备、传输、固定准入和回收；不作为普通产品身份。`qwinsta` 仍显示 a9builder console Session3 Active，但未取得本轮普通 dispatcher/worker/Electron token，不能签 SID/Medium/noHostJob 的普通执行 PASS。

唯一新根：

```text
C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R2-20261004-R1
```

初始不存在、祖先无 reparse，初始空闲 4735713280 bytes；新产品 ZIP 展开 784 文件、锁定 Electron ZIP 展开 73 文件均逐文件核验。最终物理文件总量 670114926 bytes，2026-10-04T05:30:12.6671755Z 空闲 4014809088 bytes，均在合同限额内。未改变 ACL、账户、UAC、Job、服务、Bitvise、系统工具或时钟。

固定既有 C# 源 SHA `dbc85763ce25287adcb4c853e37963755c56d9561f9d06e41f53bfdb78e952cd`，在新 compile run `dbe4aed2d9e04eacb2ac86989e6eb4a6` 编译一次：compiler 实际实例退出 0；DLL 19968 bytes，SHA `4c400959413227375c0ebd58d8b1ebfe686e5c8401d484cb833377b5a1ffeb6b`，MVID `347ee5fd-3777-489d-ac81-015793d512a0`；build 原始字节 SHA `3c0a12efa2ea08e4a68d4d1edc9bf13da73a896b4c4f960111c2f87237d7efa7`，绑定本轮 source/批准。编译器、三参考、kernel32 版本/哈希/Microsoft 签名均符合合同。

Profile 为 `WIN10_PS51_NET4_QUERY_HANDLE_CAPTURE_V4_TEST_ONLY`，API 为 `QUERY_LIMITED_INFORMATION_SYNCHRONIZE_SNAPSHOT_PRECISE_UTC_V4`；`GetSystemTimePreciseAsFileTime` 只用于已登记 Win10 取证，不作为 Win7 产品依赖。旧 source35a19250 的 DLL/build 和原生有限准入边界保持原文，未重建 D-013。

| 准备检查 | 本轮证据 |
|---|---|
| 实际 PS5.1 三源 ParseFile | 0 errors |
| 请求/master/revision/批准 schema | 336 项 PASS |
| 查询/捕获 API | 27 项 PASS |
| 精确 UTC/区间 | 23 项 PASS；16 个实际夹具子实例退出证据保留；206ticks 未来反例仍拒绝 |
| 文件/类型/MVID 门，范围修正后 | 新隔离 run `cd7eb70bd6574f9b9e77e3b39b524c2b`，16 项 PASS |
| 入口/claim/并发 | 22 项 PASS，均为隔离准入，未创建普通入口 |
| 实际新父/只读 cmd-ver 回执探针及 reader | 新实际 run `beff7e40819b4b5d89574d5031a8e5cf`；父实例退出 0；reader 修正后 77 项 PASS |
| 锁定 Electron 22.3.27 / Node16.17.1 | 普通版本与受控 Boot 版本实际 syntax/self73/receipt88 均退出 0；Administrator 准备级 |
| 新 revision / 控制输入 / 产品与宿主闭包 | 修正登记后目标端校验 PASS；产品784、宿主73 |

同步回执探针中的原生87资格输入是明确构造的 validator 输入，不声称制造了实际 kernel 查询失败或证明其清理。旧实际探针 ID 残留导致的 reader 首失败保留，后续使用新实际父/回执/快照证据修复，不放宽时钟、身份、回执或退出规则。

## 3. 四源、范围错误及新冻结登记

四个批准的外部执行源完成新包/新根/批准绑定，Background 放在 Boot 之后，并准备中文空格工作区、starting 审计先落盘、最短 start→读输出→Stop→SQLite 归属查回链路。共享 manager 变量作用域与 ASCII 夹具路径构造为同范围夹具修复。上述产品路径尚未真实运行，不将静态准备写成行为 PASS。

| 固定源 | SHA-256 |
|---|---|
| stage-product-r2.ps1 | `f44c6b836bae40dfba371f84f150904683dd960fa587e289e0bb2d2a503db27d` |
| launch-product-r2-desktop.ps1 | `8b226b679356a5c15237f55fda4147524f519c4fe0d8b451e7f4a16240471e80` |
| serve-product-r2-desktop.ps1 | `6be47f97a0c075a6b73c4e169855f26152648c20d73a4a5ab094d5e8323bd5b5` |
| normal-short driver | `a3de9a964fb6fce96c89ab024ee5bf4bbf07d3090e8ed630ce0799498f0a6eb4` |
| controlled-boot driver | `8d2fa9aa2a2954115c633218c7aae4000f25b00f0a459ac4a7e9d199b5ff557f` |

**本轮发现并保留的范围错误：**初始文件门负例仍执行一次旧 R5 `inputs/scope-approval.json` 读取，将其复制为错误批准夹具。它没有启动或写入旧控制器，16 项门断言本身通过，但违反本次“仅新根”范围，原检查不能算范围合格。原源码、输出和复制字节全部保留。后续在新隔离 run 中构造明确无效的 prior-scope 元数据，去除旧根访问，保持 16 项断言和预期拒绝原因；新实际检查通过。

修正只影响准入夹具输入和检查登记。固定三 PS、两个 driver 执行字节、master、捕获 DLL、九字段请求、全部安全片段与证明判据均未改动。新 revision JSON 使用新序列化字节和新 checks/registration，内容中的执行源绑定与原 revision 相同；不是产品修复。相同执行字节的 Node/PS 准入保留原路径/revision 绑定，按准确字节适用，不伪造新普通执行。

| 当前可用冻结身份 | SHA-256 |
|---|---|
| master | `46441acf952c0ee64ccb21b863c3909f6cc56583f068d88ce3ff0d673ce3b821` |
| normal-short revision | `210ffb9a9745d5ee58e078a6135615c141f27ae0dcb406cef0b312ffbca8cb77` |
| normal-short checks | `a9bcf55ba43f8cfea3c92f040f15844e6ce14b0ff5de97ca21fa1e837d732c69` |
| controlled-boot revision | `82c5a69ae5037318212979535a4d782755921f3767150a3692a82b3a1f4d6c13` |
| controlled-boot checks | `cfa34782a349ec8faa3551fd27a721ce655c9dab51fee1b987f859013e605df3` |

每个新 checks 包含17个原始记录，单记录仍≤1MiB。`frozen-control-r1/`、首矩阵及原628f/0b93 revision保留为历史，**不再派发**；当前使用 `frozen-control-r2/` / `win10-freeze-r2.json`。新登记实际哈希、四文件闭包与两个 SYNC_SAFETY 片段校验通过；成功 stage 原始记录直接保留，未为读取器修正重复成功 stage。

## 4. 普通桌面入口阻塞与八组矩阵

Computer Use 可读取并操作 UU 远控自身菜单，画面及目标 Windows 时钟持续更新；目标 CMD/开始菜单没有响应点击、Escape、单字符、typeText、ctrl+Escape 或 super+r。重新绑定应用、选择实际远控屏幕后仍无新输入。工具还返回 windowNotFoundAtPosition、modifier-only key 错误及 Dock 激活 timeout；它们在本轮观察记录中保存，不签为产品错误。

粘贴曾带出旧 R10 剪贴板命令，**没有发送 Return、没有执行或恢复旧控制器**；该待执行文本未被证实清除，后续不得在旧文本上直接按 Enter。

合同 §4 明确：“由Computer Use在普通A9 Builder桌面启动新入口一次，SSH后续固定派发/取证/回收；不恢复R10、不用计划任务/管理员启动或Job脱离绕过普通门。”因此暂停依赖普通入口的派发，继续完成独立准备纠错、取证和文档。没有新的权限审批请求。

最新 `win10-entry-postflight-r2.json`：claim/start/ready/final 四文件均不存在，正式请求0，未观察到命令行指向新根或旧 R10 的活动控制进程；120分钟窗口尚未开始，普通 token `NOT_OBTAINED`。进程查询只是当前未观察存活，不补签历史 exit。

| 普通产品检查 | 结果 |
|---|---|
| 同 dispatcher 受控 Boot 失败→真实树退出→正常 Boot | NOT_PERFORMED |
| Boot | NOT_PERFORMED |
| Background 最短链路及完整回归 | NOT_PERFORMED |
| Shell | NOT_PERFORMED |
| EncodingSecurity | NOT_PERFORMED |
| FailureBoundaries | NOT_PERFORMED |
| StopExit | NOT_PERFORMED |
| ReleaseExit | NOT_PERFORMED |
| Recovery | NOT_PERFORMED |
| 独立收口 / DEVELOPER_VERIFIED / Win7 | NOT_PERFORMED / 未签发 / NOT_PERFORMED |

旧 R10 三组 PASS、后台审计 FAIL、历史 UNKNOWN 及原生 raw-pipe 边界保持原结论，不能改绑本包。

## 5. 回收、首错与保护

最终新根清单1067个物理文件。208个准备文件 / 4811376 bytes完整返回并逐文件核验：原146个返回和新62个增量返回均保留；859个产品/宿主/两个 ZIP 文件与本地保留输入逐项远端 hash 对比一致。首轮1005个文件的原始字节全部保持。两个 junction 都是明确负例，准确路径/目标作为元数据登记，回收不跟随、不删除。

准备出口按固定合成秘密的UTF8/UTF16LE/Base64扫描；这是准备证据扫描，不能替代未执行产品 EncodingSecurity 出口检查。原始输入/stdout/stderr及失败保留，包括命令长度本地拒绝、reader旧run引用、宽泛盘点误触显式junction、OrderedDictionary汇总错误、回收规划过窄上限、新夹具input-holder误放入要求不存在的run，以及准入读取器子作用域/参数顺序错误。均先保存再修复；未修改产品或证明门。

原工作树其余已有材料、主工作区23项dirty状态及三原始依赖ZIP按准确字节保护；本轮没有源码提交、推送、合并、原生重建、系统配置修改、代理委派或 Win7 执行。文档检查与最终保护记录另存本轮证据根，普通低影响文档不重跑产品全量测试。

## 6. 可恢复入口

本轮证据根：`/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent/.acceptance/a9-31-developer/product-r2`。该目录为忽略证据，不能假定 Git clone 会携带。

当前统一矩阵为 `win10-preparation-evidence-matrix-r2.json`；原 `win10-preparation-evidence-matrix.json` 是范围错误发现前的不可变快照，已由新矩阵明确限定。关键入口：

- `win10-file-gate-scope-audit-r2.json`、`win10-file-gate-scope-repair-r3.json`、`win10-directed-files-scope-r3.json`：范围错误与修正实际16项结果。
- `win10-freeze-r2.json`、`win10-frozen-r2-target-verify-r3.json`、`frozen-control-r2/`：当前可用固定登记与实际校验。
- `win10-final-preparation-inventory-r2.json`、`win10-final-preparation-return-verification-r1.json`、`win10-preparation-return-r2/`、`win10-final-preparation-return-delta-r1/`：全清单与返回字节。
- `win10-cua-entry-observations-r1.json`、`win10-entry-postflight-r2.json`：输入阻塞、零入口/请求及当前 Session。
- `win10-exact-ordinary-launch-command.txt`：准确一次性入口。恢复输入后先重新核对目标、Session、输入和无旧claim，仍须取得普通SID1005/Session3/Medium8192/非提升/noHostJob实际 token。

已批准范围内下一步仍为受控 Boot→同 dispatcher 正常 Boot→Background最短真实链路。最短链路整树退出确认后，再以新不可变driver revision开启完整 Background回归，随后完成剩余phase；不把 shortest-only PASS当成完整Background PASS。入口120分钟/16请求、硬门停止和有界修复规则保持；独立复核、Win7、产品修改及提交/推送仍不在本轮批准内。


## 7. 后续手工协助登记（2026-10-04）

负责人随后表示“如果远控输入不行，我可以手工参与。”据此允许在WIN-2JQ66JE4HTQ的A9 Builder普通桌面由负责人打开全新非管理员CMD，一次执行同一冻结r2入口命令；仅替换§4的输入操作者，不变更源/包/master/revision、SID1005/Session3/Medium/非提升/noHostJob、120分钟/16请求及全部安全门。后续固定派发/取证仍由代理完成。旧窗口残留R10文本不执行，旧控制器不恢复；原批准§1–5和历史输入保留。

最近只读检查UTC 2026-10-04T06:30:43.8945785Z仍无claim/start/ready/final、正式请求0，普通token未取得；手工入口待实际启动，八phase、独立收口及Win7均NOT_PERFORMED。入口启动须先用实际进程实例/token核验，再按受控Boot失败→真实整树退出→同dispatcher正常Boot→Background最短链路的顺序推进。证据为product-r2/manual-assistance-owner-steering-r1.json和manual-entry-watch-063043241315.json。


## 8. 普通入口后续执行（2026-10-04）

负责人一次手工普通入口实际核验通过；同dispatcher受控Boot失败/真实树退出后正常Boot8项PASS，Background最短28项PASS。完整后台首错游标夹具误取历史句柄，修正匹配当前handle后通过相关游标/3-4/Stop项，但永久删除确认场景未批准即真实派发Remove-Item。SQLite+包内Policy证明产品缺口，完整Background FAIL；六个下游phase、独立与Win7 NOT_PERFORMED。固定stop取得dispatcher exit0，112个dispatcher树实例/合并116个持有实例退出与后飞行闭合；479新增文件43568598bytes回收核验，原1067文件不变。当前统一矩阵为product-r2/win10-evidence-matrix-r4.json；raw COMPLETED/Background标记只表示停止/最短范围。r2已停止不可恢复，A9-31仍IMPLEMENTATION_IN_PROGRESS。

实际报告：[r2执行与Policy失败](../../reports/2026-10/a9_31_product_r2_win10_execution_and_policy_failure_2026-10-04.md)。具体三路径本地修复提案：[Shell删除Policy修复](../../plans/A9_31_SHELL_DELETE_POLICY_REPAIR_APPROVAL.md)，DRAFT_NOT_APPROVED；不扩大本轮已执行授权，不改源码/包/native/锁，不提交/推送/委派。
