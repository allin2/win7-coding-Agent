# A9-31 managed r3 控制输入独立补充复核

独立复核人：`/root/a9_31_managed_r2_independent_review`（gpt-6-luna/high）；实现方：`/root`。
主代理保存复核人回传结果。复核人只读，未运行脚本、测试、构建、远端连接或写入。

**PASS_FOR_OWNER_CONTROL_INPUT_APPROVAL，P0/P1/P2=0/0/0。** 仅供负责人裁决控制输入、目录和双构建范围，
不是负责人批准，不替代普通用户/ParseFile/原生双构建或收口门槛。

## 准确输入

source `10114503a1e79706131ea4a11a5b96bd2958807a`；
ZIP `0191f61db2719eb42e0cbf822cbed6f6f07eeed69a7c5f0b04a9e19d54a367c1`；
input-lock `5d3159712d77ccd89e0a38e7e89379562685c98cc208d0b48c4d9f34912a68b4`；
manifest `82ae5dd5539a85facade3b8aea6659e15bcede90e0601fd6cca075912ca248de`。
23文件套件闭包沿用[原独立报告](a9_31_managed_r3_independent_kit_review_2026-10-03.md)，本次未重做。

六项控制脚本尺寸/哈希均与复核时pending registry匹配，路径位于
`.acceptance/a9-31-developer/native-kit-r3/control-scripts/`：

| 文件 | SHA-256 |
|---|---|
| launch-managed-r3-controlled-build.ps1 | e335c59f695d13d0f451d394a7990f5111d1503f6f5153b00b349ec733e7afc3 |
| managed-r3-standard-worker.ps1 | aa4175d1f5052bbfeddd680e7fdd1e5a95e9f0e12bc240c440abc378507a7059 |
| serve-managed-r3-controlled-build.ps1 | f57896c288e826342b536307ebc53873eda704b5b5a4f2bce13ca8c0fe5c2678 |
| stage-managed-r3-kit.ps1 | 3f6e0cf45d90cf6d33c2e2484b45e5a372690ddc1e11b7e3badb7c2a746a8621 |
| test-managed-r3-input-closure.ps1 | 2d51d120e0ab36e039d847243e51c9363c3e970b688efd67a59e678f3dcc93cd |
| verify-managed-r3-registry-head.py | 9381f52996733554918f3491c9e4c823b8cd6d2c3401b8db05c24c94e045e3b1 |

复核时registry SHA为`70cfb0e96719bed4365e6d2e3454361139c923f7c46122dc420cde7022a86907`，
方案SHA前后缀为`079d1464…02b87`；准确原方案/registry快照由主代理留在native-kit-r3控制复核绑定材料。
其后方案仅追加实现方检查事实、registry追加本报告元数据；不改变六控制字节及目标/权限范围。
这类后续元数据不冒充复核时的原registry哈希。

## 控制边界与修复

launcher在Add-Type/CreateProcessW前检查control祖先无重解析点，并重新校验批准registry、
独立kit报告及六项控制输入。worker每阶段重验身份schema/probe、普通角色、非提升、
Medium SID/RID、elevation type、job probe、无Host Job及账户；SID1005/Session3另有硬门。

控制器固定BuildA/BuildB两请求，绑定PID、Session3、source/registry/kit，共用60分钟窗口。
BuildA失败停止BuildB，B必须匹配A成功记录。命令/目录/fixture均固定，未见任意命令入口。
计划仅授权新D盘三目标目录、四v1 fixture；没有旧用户profile写路径。
同SID可信当前用户不是安全沙箱；启动前漂移复核不声称抵御恶意同用户持续并发改写。

初次静态提出“identity子进程exit被忽略”的疑似P1已更正撤回：实际是同PowerShell直接`& build.ps1`，
输出JSON后的Assert throw会进入worker外层catch。最终字段重验是合同强化，不将原调用记为可假PASS。
控制入口stage到launch间字节漂移P2已在最终launcher启动前复核闭合，首轮脚本副本保留。

## 实现方证据与未执行边界

复核人只读核对身份谓词13项正负例及caught=true/continued=false，不自行执行。
实现方随后在实际PS5.1取得五控制ParseInput、10请求谓词检查；这些不代表普通令牌或完整build运行。
完整kit build.ps1的ParseFile、普通SID1005身份、目录/ACL准备、BuildA/B、Electron及Win7 NOT_PERFORMED。
传输后仍须ParseFile硬门；任一完整性/身份/阶段失败停止下游。
