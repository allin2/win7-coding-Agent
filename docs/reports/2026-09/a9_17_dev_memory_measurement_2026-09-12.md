# A9-17 开发机启动与空闲内存实测

采集时间：2026-09-12T18:14:45.755047+08:00。当前分支 `codex/a9-alpha2`，HEAD `7d06789` 加本地 A9-17 修改。

环境：Apple M4，16 GiB RAM，macOS 15.7.9 arm64；Electron 22.3.27 / Node 16.17.1，开发源码入口，SQLite 8.7.0 Electron ABI 110。
每个场景启动 3 次、每次 35 秒，交替场景次序，使用独立工作区和数据目录。保持 Read Only、未配置 Provider、无任务执行、相同窗口/安全/GPU 默认设置。未重启或清理 OS 缓存，属于重复新进程启动，不是物理冷启动。

## 实测结果

| 场景 | 空闲 RSS 合计 | 三轮空闲范围 | 启动采样峰值中位数 | 最高启动采样峰值 |
|---|---:|---:|---:|---:|
| 空历史 | 321.5 MiB | 319.7–322.4 MiB | 327.2 MiB | 328.6 MiB |
| 1,000 轮合成历史 | 340.9 MiB | 337.7–344.9 MiB | 347.7 MiB | 352.7 MiB |

每个进程组均为 4 个进程。Core 逻辑在主进程中，不另加预算或虚构 Core 进程。分项各自取中位数，因此未必精确相加为总量中位数。

| 场景 | 主进程 | Renderer | GPU | 网络服务 |
|---|---:|---:|---:|---:|
| 空历史 | 133.1 MiB | 92.6 MiB | 67.4 MiB | 27.5 MiB |
| 1,000 轮合成历史 | 142.3 MiB | 98.9 MiB | 70.0 MiB | 27.6 MiB |

## 口径与验证

- `ps -axo pid=,ppid=,rss=,lstart=,comm=` 对新启动根 PID 和已观察到的后代采样；RSS 的单位经本机 man ps 确认为 1024 bytes，合计除以 1024 得 MiB。
- 启动窗口 0–10 秒，约每 250 ms 采样；空闲窗口 20–34 秒，约每 500 ms 采样。空闲值先求各轮窗口中位数，再求三轮中位数。峰值为各轮前 10 秒的最大采样值，再求中位数；另列六次有效启动中的场景最高值。
- 合成历史每轮请求 1,024 字符、回答 2,048 字符，加固定标识；共 1,000 轮。输入为合成测试数据，内存数字为实际程序测量。UI 仍只加载最近 20 条，未展开旧记录；空历史 0 条。
- 每次启动均通过真实 Preload snapshot 核对状态 ready、Read Only、Provider 未配置和首屏条数。所有采样逐行核对 PID 无重复、进程 RSS 可加总，Electron app.getAppMetrics 对空闲合计作交叉核对。
- RSS 合计会重复计算共享页，不是去重物理占用或 Activity Monitor 的 memory footprint；macOS 内存压缩也使跨平台比较失真。最高值仍可能漏掉采样间隔内更短的峰值。
- 采样器本身不计入目标进程组；Electron 内部另以 500 ms 周期记录 getAppMetrics，存在少量未单独扣除的测量开销。
- 仅测当前开发版本，没有优化前同口径基线，因此不能给出内存降幅；这些结果不代表 Win7 或正式打包候选，不构成 Win7 PASS。
- 初次采样驱动因 Electron 模块引用错误未进入产品主入口；该次失败已排除，修正后 6 次有效启动全部完成。

## 可复查证据

- [原始数据及方法目录](/private/var/folders/3z/wj46qg4j2pn2fwgtccdj093m0000gn/T/a9-17-memory-dev-9zsyd0od)
- [逐轮结果 summary.json](/private/var/folders/3z/wj46qg4j2pn2fwgtccdj093m0000gn/T/a9-17-memory-dev-9zsyd0od/summary.json)
- [聚合及交叉核对 analysis.json](/private/var/folders/3z/wj46qg4j2pn2fwgtccdj093m0000gn/T/a9-17-memory-dev-9zsyd0od/analysis.json)
- [复现采样脚本](/private/var/folders/3z/wj46qg4j2pn2fwgtccdj093m0000gn/T/a9-17-memory-dev-9zsyd0od/measure.py)

证据目录保留每轮 ps RSS、Electron 指标、启动标记、测试输入规模及日志；meta.json 绑定本次源码/构建文件 SHA-256。未提交、推送、部署或修改用户真实会话。
