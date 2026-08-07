# 构建期许可证声明补充

以下 7 个仅用于 Win10 构建工具链的 npm 包未在发布归档根目录携带独立 LICENSE 文件；`npm-licenses.json` 已保存其 `package.json` 声明，CycloneDX SBOM 已保存版本、integrity 和来源：

- agent-base 6.0.2 — MIT
- emoji-regex 8.0.0 — MIT
- err-code 2.0.3 — MIT
- http-proxy-agent 5.0.0 — MIT
- https-proxy-agent 5.0.1 — MIT
- imurmurhash 0.1.4 — MIT
- socks-proxy-agent 7.0.0 — MIT

这些包不进入 `output/runtime`。A6 Win7 运行时闭包中的 better-sqlite3、bindings、file-uri-to-path 均保存了独立许可证文件，SQLite 的 public-domain 状态见 `SQLITE_LEGAL_NOTICE.md`。
