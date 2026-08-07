# 来源与派生关系

- `node-pty-0.10.0.tgz`：npm 官方注册表，SHA-256 见 `input-lock.json`。
- `node-pty-0.10.0-embedded-winpty-0.4.4-dev.zip`：从上述锁定 TGZ 的 `deps/winpty/**` 逐字节派生；`VERSION.txt` 为 `0.4.4-dev`。该快照同时包含 `winpty_get_console_process_list` 的头文件声明和实现，与 node-pty 0.10.0 调用匹配。
- Electron ZIP、headers 和 x64 `node.lib`：Electron 官方 release/artifacts；各自上游校验表与 SHA-256 随包保存。
- Node 16.17.1 Windows x64 ZIP：nodejs.org 官方归档及 SHASUMS256。
- npm 工具链：官方 `registry.npmjs.org`，由 `tooling/package-lock.json`、integrity 与 `npm-cache/_cacache` 共同固定；正常 Win10 构建禁止联网。

`winpty 0.4.3` 已从构建输入移除，因为它不提供 node-pty 0.10.0 所调用的 `winpty_get_console_process_list` API。版本裁决见 ADR-0063。
