# A9-30 v26 r6 独立套件及控制入口复核

最终结论 PASS，P0=0/P1=0/P2=0。复核人 `/root/a9_30_r4_label_review`（gpt-6-luna/high），实现方 `/root`；复核时间 `2026-10-02T05:49:54+08:00`。

## 准确输入

源码 `7feae402edfb30da9adb649841d777ca82cc6e80`，时间 `2026-10-02T05:41:55+08:00`，来自绑定此准确提交的干净 checkout。用户明确批准四路径本地 source commit，既有批准允许独立复核通过后的 kit/批准登记提交；不推送或合并。

| 工件 | SHA-256 |
|---|---|
| A9_30_V26_BUILDKIT_r6.zip（91424 bytes） | 8c0f79bf2f5383be3b59b6542f27e159c00efb23f07eeabdc0a05477462cf406 |
| input-lock.json | b36aeffc0392363a21177e400211742fac2eb7777fcb4b28a411ed5ef894d51a |
| PACKAGE_MANIFEST.json | db84d5ebd36a6045fc3193156d3650bcea1ef53297affaffbf434f6c024f4e52 |

ZIP 23项、manifest22数据文件与自身、input-lock21来源项，manifest/lock/ZIP逐文件sha及size一致；13/13 native source 均与准确 `git show <source>:native/helper/<filename>` 原始字节一致。源版本/时间及 Win10 构建脚本闭包相符。

## 审查与纠正记录

独立复核前轮错误地把 ZIP src/helper.cpp 对照为历史生成副本 `native/helper/build-win10-kit-v26/src/helper.cpp`，报告P1；该历史blob SHA `8d47a86387614cdadcc2a17725974426ec45193d80d50e315d1d28e55c8b2d42` 不是批准原生source路径。复核人随后以 execFileSync 原始 Buffer 读取准确 `native/helper/helper.cpp` git blob 与 unzip -p ZIP bytes，两者均97826 bytes，SHA `7d2c7a810d6684a768d85800338bfa87db47d25f46df5ce55fe2210aab21370d`，撤销误报。LABEL恢复/primary错误保留修复已在已批准parent27a1de提交，7feae继承；未删修复、未改包或另造source来迎合错误判据。前轮结论仅作为纠正历史，不能用于批准登记。

实际P2发现 stage 缺少自身批准登记门，已经修复：mandatory exact registry commit/blob SHA，no-reparse后调用与worker相同的Assert-R6Approval，任何ZIP/目标写入前拒绝缺失或错配批准；输出回显身份。最终六控制文件均与 r6-control-input-hashes-r2.json 字节一致。

| 控制文件（closeout/control-scripts） | SHA-256 |
|---|---|
| r6-standard-worker.ps1 | eeda5aad99879ce04bd5363949de72ff4ccddcdef24f487ff9e50b219c48420d |
| stage-r6-kit.ps1 | b1c99cc9d1daab632c4ee1b972fdde733af0d0e3643eff2cbd38bc64fae3f252 |
| serve-r6-controlled-build.ps1 | 9098e6927e8c10e31b221038356f0f72a68c2d35d0339f7140be25255f9c5d90 |
| launch-r6-controlled-build.ps1 | c96057f0cbc46a5f81869017a2cb6e7d8886aae370c59be358bb402a2868e759 |
| test-r6-input-closure.ps1 | f7d0b595aa2448eb8a73ae23281c899c4adc32c10b145bfee152a6b7660ad13e |
| verify-r6-registry-head.py | 6fa25210e9d93b082ab34994b312f9b77612ef4d8e237991d827fdbd2b3a4302 |

其余控制合同保留：SID1005、普通非提升Medium无Job、实际目录仅批准的build-r5-a/b、目标及祖先无重解析点、完整23文件闭包；CreateNew保护首失败日志；B需匹配成功A；source/kit/manifest/lock/独立报告准确绑定；本地HEAD verifier要求工作区registry与HEAD字节一致并核验报告；controller自己创建进程退出证明不虚构其他子进程清理。

新OS门使用实际运行时版本+只读HKLM交叉校验，拒绝类型错/缺失/矛盾/非Client/非Windows10/非x64/不支持build。profile、helper manifest、CMake与r5字节相同，Win7SP1x64、0x0601、静态/MT、v142/SDK19041及API/CRT门保持。没有扩账户/UAC/WMI或系统策略。

## 验证边界及下一步

独立人仅本地只读原始字节和源码复核，未执行PowerShell、远端、staging、native或Win7。此前实际PS5.1门与反例为继承证据；本轮stage新增批准门的实际PS5.1解析及未批准负例必须在投放写目标前完成。当前SSH连接超时，r6未传输，双方实际身份/目录与工具预检须连接恢复后复查。

此PASS仅授权既有范围内登记准确套件，不签发native双构建/返回/产品输入锁/真实Electron/Win7、Alpha2或RC。正式返回须同套件两个干净目录、不同run-id、完整原始v1/v2/v3+PE/API/CRT证据、helper字节一致并独立复核。若A失败，B及下游停止，失败证据保留。

用户批准的目录仍为 `D:\A9-A30-V26-20261001\build-r5-a`、`build-r5-b`，四个准确v1 fixture本人不继承WRITE_OWNER范围继续适用；不创建build-r6目录或增权限。主工作区已有改动和旧套件/证据完整保留。
