# A9-17 优化前后开发机内存与启动 A/B 对比

采集时间：2026-09-12T23:03 起，共三轮测量（端点 A/B、历史规模扫描、稳态确认），合计约 31 分钟。
分支 `codex/a9-alpha2`，基线 `7d06789`。

本报告是**临时性开发机分析**，用于补齐 [A9-17 开发机启动与空闲内存实测](a9_17_dev_memory_measurement_2026-09-12.md)
中缺失的「优化前同口径基线」。它不改变 A9-17 状态与门禁，不构成 Win7 结论。

> **术语（先读，勿跳过）**：本报告的「优化前 / 优化后」只描述 **A9-17 代码差异的前后**，
> 不是版本前后。
>
> - **优化前** = alpha.1 产品源码。即 `d71807fa`（WIN7-28 冻结源码，ZIP `f1b6730…08351`）
>   ＝ HEAD `7d06789`，两者 `src/` 零差异。
> - **优化后** = alpha.1 产品源码 **+ 未提交的 A9-17 改动**。**这不是 alpha.2。**
>   alpha.2 还包含 A9-16（`PLANNED_NOT_AUTHORIZED`，尚未实现），且没有冻结候选。
>
> 因此本报告的任何数字都**不得**改写成「alpha.2 相对 alpha.1」。理由与可成立的表述见 §6。

## 1. 为什么这次能给出对比

A9-17 的全部改动在本次采集时**尚未提交**，因此 `7d06789`（HEAD）本身就是优化前的代码。
用 `git archive HEAD` 导出到 `/tmp/a9-17-baseline` 即得到优化前工作树，不触碰当前工作区、
不产生提交、不影响历史候选。优化前侧只重建了 `src/state/dist`（A9-17 改了
`src/state/src/a9-persistence.ts`）；其余包源码与 HEAD 逐字节相同，其 `dist` 直接复用。

两侧文件哈希（`meta.json` 全量记录）：

| 文件 | 优化前 | 优化后 |
|---|---|---|
| `src/shell/product/main.js` | `c16ecc0e…` | `4ebeae3b…` |
| `src/shell/product/a9-agent-runtime.js` | `8dad1d24…` | `f5f14106…` |
| `src/shell/product/a9-product-ipc.js` | `8983cac7…` | `89dc42cd…` |
| `src/shell/product/preload.js` | `48cd8067…` | `de959e09…` |
| `src/shell/product/renderer/a9-workbench.js` | `387a5651…` | `0f2d8068…` |
| `src/state/dist/a9-persistence.js` | `7a66802d…` | `80ad842f…` |

## 2. 口径（与上一份报告不同，不可交叉比较）

- **内存**：Electron `app.getAppMetrics()` 的 `workingSetSize`，按 Electron 进程（Browser /
  Tab / GPU / Network Service）求和。**不是**上一份报告的 `ps` RSS 口径。
- 原因：本次环境中 `/bin/ps` 被系统策略拒绝执行（`operation not permitted`），`ps` RSS 方法
  在当前环境无法复现。因此本报告数字**不得**与上一份报告的 321.5 / 340.9 MiB 直接比较。
- **启动方式**：必须追加 `--no-sandbox`（本环境 Chromium 沙箱初始化失败 `EPERM`，GPU/Network
  Service 进程反复崩溃）。这是**非产品配置**，进程拓扑与绝对耗时都不代表打包产品。
- 工作区绑定：`WIN7AGENT_A9_WORKSPACE=<run>/workspace`。上一份报告的夹具依赖该变量当时已
  存在于 shell 环境，脚本本身未设置它。
- 两侧使用同一 Electron 22.3.27 二进制、同一 SQLite 8.7.0（Electron ABI 110）构建；播种使用
  Node 20（ABI 115，与仓库根 `better-sqlite3` 构建匹配；当前 PATH 下的 Node 22 为 ABI 127，
  会直接播种失败）。
- 合成历史每轮 1,024 字符请求 + 2,048 字符回答；保持 Read Only、未配置 Provider、无任务执行。
- 同一重复内两侧背靠背执行，场景与变体顺序逐轮交替。**启动峰值未测到**（见 §6）。

## 3. 端点对比（35 秒窗口，空闲窗口 20–34 秒，各 3 次）

| 场景 | 优化前 | 优化后 | 差值 |
|---|---:|---:|---:|
| 空历史 空闲合计 | 320.6 MiB (316.7–323.3) | 319.4 MiB (317.1–321.2) | −1.2 MiB (−0.4%) |
| 1,000 轮历史 空闲合计 | 476.5 MiB (472.0–478.5) | 339.9 MiB (337.9–344.8) | −136.6 MiB (−28.7%) |

分项（1,000 轮历史，中位数）：

| 进程 | 优化前 | 优化后 | 差值 |
|---|---:|---:|---:|
| Renderer (Tab) | 225.1 MiB | 98.9 MiB | −126.2 MiB |
| Main (Browser) | 155.0 MiB | 143.9 MiB | −11.1 MiB |
| GPU | 70.0 MiB | 70.2 MiB | +0.2 MiB |
| Network Service | 26.3 MiB | 26.5 MiB | +0.2 MiB |

启动时序（主线程时间戳，3 次中位数）：

| 指标 | 场景 | 优化前 | 优化后 | 差值 |
|---|---|---:|---:|---:|
| 窗口创建 | 空历史 | 9,745 ms | 4,746 ms | −4,999 ms |
| 窗口创建 | 1,000 轮 | 9,657 ms | 4,687 ms | −4,971 ms |
| 首屏就绪 | 空历史 | 11,057 ms | 10,918 ms | −139 ms |
| 首屏就绪 | 1,000 轮 | 11,359 ms | 10,644 ms | −715 ms |

首屏对话条数：优化前在 1,000 轮场景为 `1000`（三轮一致）；优化后为 `20`（三轮一致）。

## 4. 历史规模扫描与稳态确认

端点对比只覆盖 0 与 1,000 轮，无法判断优化后内存是「不随历史增长」还是「常数降低」。
追加 100 / 5,000 两档扫描（35 秒窗口）后发现 **5,000 轮那一侧在 35 秒内尚未到稳态**：
优化前三轮为 941.8 / 608.2 / 503.9 MiB，且 GPU 与 Network Service 的 working set 掉到
37–55 / 16–18 MiB，远低于其余所有运行的约 70 / 26.5 MiB，是系统内存压力的典型征象。

因此补做稳态确认：60 秒窗口、空闲窗口 40–59 秒、每档两侧各 2 次。5,000 轮优化前升至
879.8 / 1013.5 MiB，且**同一轮内极稳**（如 1011.9–1013.8 MiB）——说明 35 秒窗口的读数是
「还在增长」，不是测量抖动。

**稳态结果（60 秒窗口，空闲窗口 40–59 秒，各 2 次）：**

| 历史规模 | 优化前 | 优化后 | 差值 |
|---|---:|---:|---:|
| 0 轮 | 318.6 MiB (314.3–323.0) | 315.8 MiB (315.6–315.9) | −2.9 MiB (−0.9%) |
| 1,000 轮 | 471.3 MiB (469.2–473.4) | 333.1 MiB (329.6–336.5) | −138.2 MiB (−29.3%) |
| 5,000 轮 | 946.6 MiB (879.8–1013.5) | 362.3 MiB (362.2–362.4) | **−584.4 MiB (−61.7%)** |

分项（稳态中位数）：

| 进程 | 优化前 0 / 1,000 / 5,000 | 优化后 0 / 1,000 / 5,000 |
|---|---|---|
| Renderer (Tab) | 92.0 / 226.5 / 689.9 MiB | 91.2 / 98.3 / 101.2 MiB |
| Main (Browser) | 132.7 / 148.8 / 174.0 MiB | 130.7 / 138.4 / 164.6 MiB |
| GPU | 67.9 / 69.8 / 60.6 MiB | 67.3 / 69.8 / 69.9 MiB |
| Network Service | 26.5 / 26.2 / 22.0 MiB | 26.5 / 26.6 / 26.5 MiB |

稳态窗口下的启动时序与首屏：

| 指标 | 历史规模 | 优化前 | 优化后 | 差值 |
|---|---|---:|---:|---:|
| 窗口创建 | 0 / 1,000 / 5,000 | 9,818 / 9,276 / 10,099 ms | 4,515 / 4,557 / 4,883 ms | −5,303 / −4,719 / −5,215 ms |
| 首屏就绪 | 0 / 1,000 / 5,000 | 11,220 / 10,883 / 13,071 ms | 10,573 / 10,650 / 11,399 ms | −646 / −232 / **−1,672 ms** |

首屏对话条数：优化前等于全部历史（0 / 1000 / 5000）；优化后恒为 `20`。

**两侧随历史的增长量（0 → 5,000 轮）**：

- 优化前：+628.0 MiB，几乎全部在 Renderer（+597.9 MiB）。
- 优化后：+46.5 MiB，其中 Main +33.9 MiB、Renderer +10.0 MiB。

## 5. 结论

- **窗口先可显示**：窗口创建稳定提前约 4.7–5.3 秒，三档规模、两种窗口长度、共 5 次重复下
  两侧分布完全不重叠，是本轮最可靠的观测。
- **收益随历史规模放大**：1,000 轮 −138.2 MiB（−29.3%）、5,000 轮 −584.4 MiB（−61.7%），
  几乎全部来自 Renderer（5,000 轮时 689.9 → 101.2 MiB）。与「首屏只投影 20 条 + SQL 层限制
  读取」的设计一致。
- **空历史无内存收益**：−0.9%，落在噪声内。本优化不降低 Electron 固有底座。
- **优化后并非完全平坦**：0 → 5,000 轮仍增长 46.5 MiB，且主要来自 Main 进程（+33.9 MiB），
  即 SQL 层仍随历史增长。这**证实**任务书 §6 自己声明的限制（「SQL 仍扫描和排序当前会话的
  元数据，尚未证明数据库开销不随历史增长」），该残余成本尚未被本优化消除。
- **首屏就绪只在超大历史下才变快**：0 / 1,000 轮的差值（−646 / −232 ms）落在轮间波动内，
  不构成改进结论；5,000 轮为 −1,672 ms，两侧区间不重叠，可认为在该规模下确有改善。
- **绝对耗时不可外推**：窗口创建需 4.5–10.1 秒，明显慢于真实桌面，主要来自本环境的
  `--no-sandbox`、软件渲染与应用自身初始化。秒级差值应只作相对量级理解。

## 6. 不得据此主张「alpha.2 内存低于 alpha.1」

本报告的两侧**不是** alpha.1 与 alpha.2。以下是精确的对象身份：

| 侧 | 实际对象 | 是否冻结候选 |
|---|---|---|
| 优化前 | alpha.1 产品源码。`d71807fa`（WIN7-28 冻结源码，ZIP SHA-256 `f1b6730…08351`，即 README 所指 `Win7CodingAgent-0.3.0-alpha.1-win7-x64.zip`）到 `7d06789` 之间 **`src/` 零差异**（已用 `git diff --stat` 核对），故 HEAD 即 alpha.1 产品代码 | 是（alpha.1） |
| 优化后 | alpha.1 产品源码 **+ 未提交的 A9-17 改动** | **否**：未提交、未冻结、无 ZIP/manifest/哈希 |

因此本报告支持的是「A9-17 改动在开发机上带来的相对变化」，不支持任何以「alpha.2」为主语的结论：

1. **alpha.2 目前不是可测量的对象。** alpha.2 的范围是 A9-17 加 A9-16（Review、实时 Shell 输出、
   响应式布局），而 A9-16 状态为 `PLANNED_NOT_AUTHORIZED`，尚未实现，也没有 alpha.2 的冻结候选。
2. **alpha.2 剩余范围的方向性风险。** A9-16 是新增功能，其净内存影响未知且很可能为正。即使 A9-17
   确实降低占用，alpha.2 最终相对 alpha.1 的关系仍不确定。这一条比测量精度更重要。
3. **空历史下没有差别**（−0.9%，落在噪声内），故「内存更低」对全新安装场景不成立。
4. **优化后仍随历史增长**（0 → 5,000 轮 +46.5 MiB，其中 Main +33.9 MiB），不是有界或平坦的。
5. **非目标平台、非产品配置、非项目文档口径**：macOS arm64 开发机、`--no-sandbox`、Electron
   `app.getAppMetrics()`。Win7 仍为 `NOT_PERFORMED`。按 A9-17 §4，「未执行不声称降幅、内存达标
   或 Win7 PASS」。

可以成立的表述仅为：**在开发机上、对 alpha.1 产品源码与「alpha.1 + 未提交 A9-17 改动」做同口径
交替对比，在 1,000 / 5,000 轮合成历史下稳态空闲合计分别低 138.2 MiB（−29.3%）与 584.4 MiB
（−61.7%），两侧区间不重叠；空历史下无可测差异。** 该表述不适用于 alpha.2 整体、不适用于 Win7、
不构成降幅承诺或任何验收结论。

## 7. 限制

- 口径是 Electron 自报 `workingSetSize` 合计，未对共享页去重，也未覆盖 Electron 之外的后代进程；
  与 `ps` RSS 口径不可互换。
- **启动峰值未测到**：启动窗口内主线程被同步工作占用，进程内定时采样被合并，0–10 秒内 40 次
  启动中仅 5 次各采到 1 个样本，无法给出启动峰值对比。本报告不提供启动峰值结论。
- **空闲窗口长度会改变结论**：20–34 秒窗口对 0 / 1,000 轮足够（与 60 秒窗口一致），但对
  5,000 轮优化前侧不足（608.2 → 946.6 MiB）。任何后续复用本夹具的测量都不得沿用 35 秒窗口
  去测大历史，也不得把两个窗口的数字混用。
- 5,000 轮优化前侧跨轮离散仍大（879.8–1013.5 MiB），且 GPU/Network Service 偶发低于正常值；
  该档优化前数字应视为「≥880 MiB、且受系统内存压力影响」，−584.4 MiB 的量级结论成立，
  但精确值不可作为承诺。
- `--no-sandbox` 为非产品配置；产品仍保持 Chromium 沙箱与 Renderer 隔离。
- 仅 macOS 15.7.9 / Apple M4 / 16 GiB 开发机，未重启、未清 OS 缓存，属重复新进程启动而非物理冷启动。
- **不构成 Win7 或 Win10 结论**：Win7 仍为 `NOT_PERFORMED`；本次未在任何 Windows 主机执行。
- 未提交、未推送、未部署；未修改历史候选与真实会话。

## 8. 复现

```bash
# 优化前工作树（只读导出，不触碰当前工作区）
mkdir -p /tmp/a9-17-baseline && git archive HEAD | tar -x -C /tmp/a9-17-baseline
ln -s $PWD/node_modules /tmp/a9-17-baseline/node_modules
ln -s $PWD/src/state/node_modules /tmp/a9-17-baseline/src/state/node_modules
ln -s $PWD/src/shell/node_modules /tmp/a9-17-baseline/src/shell/node_modules
cp -R $PWD/src/shell/dist /tmp/a9-17-baseline/src/shell/dist
for p in core gateway workspace runner git-adapter; do cp -R $PWD/src/$p/dist /tmp/a9-17-baseline/src/$p/dist; done
(cd /tmp/a9-17-baseline/src/state && ./node_modules/.bin/tsc)

# 三种测量模式
python3 /tmp/a9-17-ab/measure-ab.py full      # 0 / 1000 轮，35 秒窗口，3 次
python3 /tmp/a9-17-ab/measure-ab.py sweep     # 100 / 5000 轮，35 秒窗口，3 次
python3 /tmp/a9-17-ab/measure-ab.py settle    # 5000 轮，60 秒窗口，2 次
python3 /tmp/a9-17-ab/measure-ab.py settle2   # 0 / 1000 轮，60 秒窗口，2 次
python3 /tmp/a9-17-ab/analyze-ab.py <evidence-dir>
```

四个必须注意的前置（本次踩到并已修正）：`ps` 不可用需改用 `app.getAppMetrics()`；Electron 必须
`--no-sandbox`；工作区必须由 `WIN7AGENT_A9_WORKSPACE` 绑定；播种必须用 Node 20 而非 PATH 中的
Node 22。

## 9. 可复查证据

- 端点 A/B：`/tmp/a9-17-ab/evidence-full/`（12 次启动，35 秒窗口）
- 规模扫描：`/tmp/a9-17-ab/evidence-sweep/`（12 次启动，100 / 5000 轮）
- 稳态确认：`/tmp/a9-17-ab/evidence-settle/`（4 次启动，5000 轮，60 秒窗口）、
  `/tmp/a9-17-ab/evidence-settle2/`（8 次启动，0 / 1000 轮，60 秒窗口）
- 每个目录含 `meta.json`、`summary.json`、`analysis.json`；每次启动含 `seed.json`、
  `electron.json`（逐样本进程与内存）、`electron.log`
- 夹具：[measure-ab.py](/tmp/a9-17-ab/measure-ab.py)、[analyze-ab.py](/tmp/a9-17-ab/analyze-ab.py)、
  [driver-ab.cjs](/tmp/a9-17-ab/driver-ab.cjs)
