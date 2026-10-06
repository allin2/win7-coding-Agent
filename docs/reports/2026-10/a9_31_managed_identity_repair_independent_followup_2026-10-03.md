# A9-31 managed 身份修复独立补充复核

独立复核人：`/root/a9_31_managed_r2_independent_review`（gpt-6-luna/high）；实现方：`/root`。
主代理保存复核人回传结果。仅只读审阅源码、冻结清单和实现方日志，没有执行测试、构建或远端命令。

## 输入和结论

source `d9b5be502c9475e50c54b349a6a12abd27b199f8` 是修复父基线，不包含本次未提交修复。
最终六项文件匹配 `identity-repair-review-inputs-r2.json`，清单SHA-256：
`6a534ea819f763c5ed5b604aa478587c6d494d3425671fb58fb8816bdb58d060`。
最终build.ps1 SHA以该清单完整值为准（`d820a281…a96382a`）。

**P0/P1/P2：0/0/0，仅针对本次静态修复。** 原managed r2的FAIL_NOT_APPROVED保留。
新source未提交、新kit未生成，本补充不批准kit，也不签发Windows/开发机收口/Win7 PASS。

原P1静态闭合：实际helper PID/creation ticks、固定helper/root/child句柄、control前Toolhelp32父子关系、
creation顺序及marker均有检查；verifier拒绝错身份/时间/退出证据，release要求根/子exit0，
cancel根退出码与终态一致。profile、script和consumer的schema2/Toolhelp32/退出合同一致，
检查限定于managed Profile，未发现对A9-30历史Profile的影响。

## P2首轮和最终收尾

首轮冻结清单SHA=`8bbcd047ec51c5dd52b2d86247a62a8f31021a78f58eac6bab06c8467fca23f0`。
复核发现finally只在outputTask当下已结束时Dispose；reader仍运行的失败分支只剩GC回收，分级P2。
该分支本来就拒绝正式返回，不是生命周期假PASS。首轮独立结论与日志留在候选外，不改判。

最终只有build.ps1再变化。DisposePinned使用嵌套finally释放root、child和event；reader已结束时立即释放，
未结束时ReaderFailed=true，并注册ExecuteSynchronously/TaskScheduler.Default continuation，reader完成后释放。
如果reader永不结束，结果保持失败/未知，不声称清理完成；可结束reader有显式延迟收尾，避免仅依赖GC。

## 日志核验和边界

首轮21项定向PASS/71项名称排除、完整release199PASS/2 WindowsPS跳过绑定前一finally版本。
首轮包装109项与最终build-script收尾无调用依赖，可按精确哈希继承，不冒充finally执行证据。

最终 `tests/v26-managed-identity-r2-final.log` 为90PASS/0FAIL/2 WindowsPowerShell检查跳过，总92；
receipt退出0、耗时31.731秒，范围为最终P2收尾后的kit/recorder全组。
复核人最后只读核验最终日志、receipt及六项冻结字节；没有重跑测试。
上述日志是实现方本地证据，不是C# finally真实执行证明。

Toolhelp32/C#在实际WindowsPowerShell5.1、原生双构建、真实Electron和Win7均NOT_PERFORMED。
完整证据在 `.acceptance/a9-31-developer/native-kit-r2/` 与 `.acceptance/a9-31-developer/tests/`。
