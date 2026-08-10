# D-013 v17 Win10 smoke 根因报告

> 日期：2026-08-10
> 触发构建包：`WIN7_D013_HELPER_BUILDKIT_20260810-RECOVERY-v17.zip`
> 构建包 SHA-256：`1d2ba2e558772bda16d9a51ab11ed83728346019229ecbdda822025893e0a328`
> v17 实现提交：`3619bc7cb509d5313b86cff2b28c3744cc60294d`
> 分类：`WIN10_SMOKE_FAIL_CLOSED / SOURCE_ROOT_CAUSE_CONFIRMED`

## 1. 现场结果与证据边界

用户在普通 CMD 复跑 v17 构建包时，native smoke 返回 `TOKEN_CREATE_FAILED`。调用链在
`CREATE_SUSPENDED` 子进程创建后、`ResumeThread` 前失败；因此没有执行 smoke 用户代码，
也没有形成可进入 Win7 的候选。当前仓库未收到新的 v17 return ZIP 或机器生成 smoke 日志，
所以本报告把“现场错误文本”标为用户提供证据，把“根因”标为可由 v17 锁定源码直接证明。

这不是 Win7 实机证据，不把 v17 标记为 Win10 或 Win7 PASS。

## 2. 确定性错误链

1. C02 host-in-Job 检查通过。
2. Low Integrity label 与 protected-directory ACL 应用、验证通过。
3. `CreateProcessAsUserW` 成功创建 suspended child。
4. v17 调用 `AuditRestrictedChildToken` 审计实际 child process token。
5. `IsTokenRestricted(hChildToken)` 返回 `FALSE`。
6. `tokenAudit.verified` 因此为 `false`，helper 在 `ResumeThread` 前终止 child 并返回
   `TOKEN_CREATE_FAILED`。

## 3. 根因

v17 的构造侧与审计侧存在互相矛盾的合同：

| 侧 | v17 行为 | 结果 |
|---|---|---|
| `CreateRestrictedProcessToken` | `CreateRestrictedToken` 的 `RestrictedSidCount` 和 `SidsToRestrict` 传入 `0, nullptr` | token 没有 restricting SID 列表 |
| `AuditRestrictedChildToken` | 要求 `IsTokenRestricted(hChildToken) == TRUE` | 对该 token 必然审计失败 |

`DISABLE_MAX_PRIVILEGE`、Administrators deny-only 和 Low Integrity 都是有效减权层，但
`IsTokenRestricted` 的语义是判断 token 是否含 restricting SID 列表。没有向
`CreateRestrictedToken` 传入 `RestrictedSidCount > 0` 时，它不会因为前三层减权而自动返回
`TRUE`。因此 v17 的失败由源码确定，不依赖普通 CMD、管理员 CMD 或 Win7 环境差异。

## 4. v18 修复合同

v18 采用方案 A：

- Administrators 继续只进入 deny-only 列表；
- Everyone/World 继续保留在普通 enabled SID 集合，不进入 deny-only 列表；
- Everyone/World 同时作为唯一的 restricting SID 传入 `CreateRestrictedToken`；
- actual suspended child audit 除 `IsTokenRestricted` 外，还直接读取 `TokenRestrictedSids`，
  精确要求 `restrictedSidCount == 1` 且该 SID 为 World；
- `TokenType == TokenPrimary`、Low Integrity SID `S-1-16-4096`、RID `4096` 仍是硬门槛；
- 任一查询或不匹配仍在 `ResumeThread` 前 fail-closed。

World restricted SID 是第二轮访问检查的最宽基线：对象仍需同时通过原 token 的普通
用户/组访问检查与 World allow ACE 检查。它不会像 v14 把 Everyone 放进 deny-only 列表那样
直接否定 Windows loader、window station 或 desktop 的基础 Everyone 授权。

## 5. 必须通过的 v18 前置验证

- 静态门禁证明 World 只进入 `sidsToRestrict`，不进入 `sidsToDisable`；
- actual child audit 必须证明唯一 World restricting SID；
- 协议逻辑测试覆盖 `worldRestrictedSid=true` 与 `restrictedSidCount=1`；
- D-013 harness 对缺失/错误 World restricting SID fail-closed；
- MinGW Win32 交叉编译和链接通过（仅代理证据）；
- Win10 VS2019/v142 native smoke 返回完整 `tokenAudit` 并 PASS；
- Win10 返回包复核前不得更新 candidate 或申请 Win7 租约。

## 6. 状态

- v17：`WIN10_SMOKE_FAIL_CLOSED`，不得进入 Win7。
- `A4-20260810-000003`：继续 `RECOVERY_REQUIRED`。
- 当前活跃 Win7 租约：0。
- v18：源码修复与新构建包完成后，停在人工 Win10 构建门。
