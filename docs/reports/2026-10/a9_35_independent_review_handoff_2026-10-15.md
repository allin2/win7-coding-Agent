# A9-35 第1轮独立复核交接

复核对象由全新CLI会话启动提示绑定完整SHA；基线dd7b92fd1ca4de606358b228feb822c21ef4c253，分支codex/a9-35-managed-start-failure。先完整读任务书、9路径提案和[本地报告](a9_35_local_managed_start_failure_repair_2026-10-15.md)，核对授权与真实差异，不采信执行者测试结论。

仅审3产品路径（runner的trusted-shell-runner/background-process-manager与shell的a9-agent-runtime）及2测试路径（runner合同测试和shell a9-background-tools）的增量与必要上下文。native-transport/协议/原生/锁均未改，不重开其他历史问题。尤其检查预启动拒绝的零helper/子进程事实、目录检查后的竞态、正常失败一次tool_end、未知生命周期/真实审计失败零后续请求、同请求/版本/profile的证明、Stop/release和迟到输出回归。

只在启动指定的全新临时根可写。原树、主树、历史证据、DB/WAL/SHM和凭据不写；不读凭据、不联网/下载、不远端、不运行Electron/PowerShell、不提交推送、不删除、不再委派。clone --no-hardlinks到该根；离线依赖逐条链接，排除@win7-agent，不能写链接目标。

Node20.17.0，先verify:quick构建全部依赖与消费者，然后运行4个runner文件和shell a9-background-tools，再docs:check/diff。所有消费者测试必须加载刚生成的dist，不能在测试前恢复旧dist；结束后记录身份才可在自己克隆恢复跟踪生成物。执行者为runner119、shell17、docs356/50通过，仅开发机证据。

至少自选3个有判别力的相关反例及3个可编译的行为变异。先确认基线可运行；编译/语法/依赖失败不算被拦。逐次恢复原字节，不让并行检查读取变异输入。缺证明、错实例不能被判清理成功；真实审计失败仍硬停。

当前协议不接受无execution_started的v3 execution_result，error帧也无完整清理证明。完整ready失败清理仅受控替身覆盖，实际helper与Win7 NOT_PERFORMED，预启动拒绝不能关闭BG03。请独立判断这一边界及是否存在范围内可修问题；不擅自修改协议或批准后续。

详细报告与CLI最终回复分开文件，按P0/P1/P2/信息报告准确行、实测命令、反例/变异、身份恢复和限制，明确是否建议提交准确整合清单。0P0/0P1不等于BG03、Win7、冻结、门A/B或整合授权。
