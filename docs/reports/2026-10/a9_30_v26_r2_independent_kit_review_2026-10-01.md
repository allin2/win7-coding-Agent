# A9-30 v26 r2 独立套件复核

复核者：独立只读代理 `/root/a9_30_native_kit_review`；实现者：主代理 `/root`。
负责人明确授权独立只读复核及通过后的套件/批准登记本地提交，不推送、不合并。
复核时间：2026-10-01T23:43:13+08:00。以下记录独立代理实际结论，不由实现方替代独立复核。

## 复核对象与结论

| 输入 | 精确身份 |
|---|---|
| Source | `c904ab5256c86ebc7c5991c46643d3cc9b6a8151` |
| Parent | `a3b6a67dbda43c41d27cedccbdf0875e1acc46d9` |
| ZIP | `A9_30_V26_BUILDKIT_r2.zip`，86836 B |
| ZIP SHA-256 | `de0f0e538feea02de4f955d7a3e1e5b94587ddfa6463d025e2aebae1190d48ae` |
| kit input-lock SHA-256 | `a1b5bacdb1bfb707862c8138387ea17c68468799a3905316d1e2e241005222c7` |
| kit manifest SHA-256 | `108b56944f78cf30071926ed7442ea9b79d75860561aa8a9d16390e8f06ecf4b` |

r1 初轮发现 P2 一项：README 将实际已绑定的生成套件描述为未绑定模板。
原 r1 保留；c904ab5 仅修正该 README，未改产品、13 原生源码、构建脚本或 Profile。
独立代理复核修正后，从建立时干净的 r2 绑定 checkout 重新生成套件。

独立复核核对 23 个唯一 ZIP 文件、manifest 22 项及自身、每项尺寸/SHA、13 源码与准确 Git source 字节。
13 个原生源码也全部与 a3b6a67 一致；r1/r2 的构建脚本、Profile 和 manifest 模板未变。
审查范围含 v3 顺序/限额、Base64/字节绑定、writer 背压/取消/清理、Win7 API、确定性参数及返回证据闭包。
README 已明确区分模板、已生成套件、正式批准与产品 helper 锁。原 P2 已解决，未发现新 P0/P1/P2。

```text
Independent Kit Review: PASS
P0: 0
P1: 0
P2: 0
Native Build / PE Execution / Double Build: NOT_PERFORMED
Win7: NOT_PERFORMED
```

独立结论：r2 满足进入原生双构建的 kit 输入闭包条件。仍须满足非提升用户、Job 条件和全新具体目录授权。
负责人随后明确批准 D:\A9-A30-V26-20261001 下 control、build-a、build-b，限权限/Job 探针及两次离线构建。
本报告不代替实际 Windows 执行、独立返回复核、产品输入重锁或 DEVELOPER_VERIFIED。
