# D-013 v18 构建前阻断审计

- 审计日期：2026-08-10
- 构建包：`WIN7_D013_HELPER_BUILDKIT_20260810-RECOVERY-v18.zip`
- ZIP SHA-256：`9aad29ba2c7b01903accd102297f747a21a33ce212a92e24439f2f15e714f9c6`
- input lock SHA-256：`ec5ae7d1b9e1c88f06b558e116e9ffdf718b1e12a9fb0bbf33004db74ef31617`
- package manifest SHA-256：`371b790d166c969d1ed624acc21c9dfd18bbe6774f8d26a50f6ce2c608f856a1`
- 最终裁决：`NO_GO_PREBUILD_REVIEW / WIN10_NOT_PERFORMED`

## 阻断项

1. v18 仅把 World/Everyone 放入 `SidsToRestrict`。Restricted Token 的第二次访问检查
   因此只认可对象 DACL 中对 World 的授权；Windows loader、window station、desktop
   或其他目标对象并不保证存在 World allow ACE，存在再次以 `STATUS_ACCESS_DENIED`
   阻断子进程的兼容风险。
2. `build.ps1` 的异常路径可在统一 return-package finalizer 前退出，`TOKEN_CREATE_FAILED`
   等确定性失败可能不生成机器可复核的返回包。
3. `logic_tests.cpp` 未进入 v18 `src/`、input lock 与 package manifest，构建输入闭包不能
   在 Win10 v142 上重放平台无关逻辑测试。

## 处置

v18 未交付人工 Win10 构建，Win10 与 Win7 均为 `NOT_PERFORMED`。其 ZIP、sidecar 与本审计
结论归档到 Git 外目录 `A4-D013-archive/2026-08-10-v18-prebuild-blocked/`；v19 取代它，
但不改变 `A4-20260810-000003` 的 `RECOVERY_REQUIRED` 历史状态。
