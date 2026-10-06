# A9-31 product r1 控制器首失败与 R2 修复事实

截至2026-10-03，分支为 `codex/a9-31-background-tools`，source为 `35a19250ed6589f6a7ba35b940a784325970c111`。

## 直接证据

- Supervisor PID31460及controller PID21724均实测SID1005、Session3、Medium8192、非提升、ordinary、无Host Job。
- r1执行pin SHA-256为 `0368ccc510bd8ea05c0e82c868791946edbd111606f418aa19e6b7bd6ea03199`。
- Boot request `45811e7bb4644f4584c68cb4fed979a4`在原始JSON键数量门被误拒绝。
- controller于 `2026-10-03T08:05:16.2641143Z`写入HALTED，error为 `INTEGRITY_REQUEST_DUPLICATE_OR_EXTRA`；requests=0，runs目录=0。
- supervisor持有controller句柄及观测到的子进程PID18656，真实退出码分别为1/0，均exited=true；没有Electron或工具派发。
- 后飞行无三个PID仅作补查；退出结论来自原持有句柄的supervisor-final，不用列表补签。

## 原因与修复

r1正则 `"[a-z_]+"\s*:` 未识别含数字的 `pin_sha256`，合法九字段因此计为八字段。
这是控制器夹具错误，产品尚未运行；原失败保持HALTED。

R2仅在批准的四源路径内修复：抽出Parse-Request，允许固定字段名中的数字，逐项固定白名单并拒绝重复和错误类型；
保留九字段、固定8phase、hash/SID/Session及生命周期硬门。ready记录明确WAITING，避免初始化HALTED字段造成歧义。
fixture采用UTF8无BOM/LF的ASCII脚本文件，中文按原始字节输出，测试秘密在脚本中由片段组成；
避免整段EncodedCommand带来的Policy分类或秘密投影歧义。包、native及输入锁未改变。

## 检查与保存位置

- 本地Node语法及32项请求正负用例PASS。
- 实际Win10 PowerShell5.1.19041.6456解析三文件PASS；原始JSON检查69项PASS（8正例、61反例）。
- 原.NET捕获访问错误保留；Win32只读TokenUser/TokenGroups捕获API检查已通过，R2未改变其API代码。
- 产品784文件闭包本地及远端PASS；缺失、额外、hash错配、链接和错误manifest反例PASS。
- 首失败原始证据位于 `.acceptance/a9-31-developer/product-r1/controller-r1-request-first-failure/`，index绑定逐文件哈希。
- R2源副本冻结于 `.acceptance/a9-31-developer/product-r1/frozen-control-r2-proposal/`，proposal pin状态为PENDING。
- R2实际解析及请求记录由 `.acceptance/a9-31-developer/product-r1/r2-script-hash-bindings.json`准确指向。

## 尚未取得的证据

实际Electron、Shell、后台、退出、恢复和Win7均为NOT_PERFORMED。
R2未部署或启动，新根未创建；HALTED r1不复活，旧目录、输入和日志保留。
独立P1=1及历史UNKNOWN、managed/A9-30锁不改。无新提交、推送、整合、发布、原生构建或账户/ACL/UAC/Bitvise修改。
