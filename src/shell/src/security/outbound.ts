/**
 * 出站请求过滤器
 * 默认拒绝所有非白名单出站请求
 */

import { ShellError, ShellErrorCode } from '../errors';

export interface AllowedHostEntry {
  host: string;
  port: number;
  protocol: 'http' | 'https' | 'ws' | 'wss';
}

export interface CheckResult {
  allowed: boolean;
  reason?: string;
}

export class OutboundFilter {
  private allowedHosts: Map<string, AllowedHostEntry> = new Map();

  /**
   * 添加白名单主机
   */
  addAllowedHost(host: string, port: number, protocol: AllowedHostEntry['protocol']): void {
    const key = this.makeKey(host, port, protocol);
    this.allowedHosts.set(key, { host, port, protocol });
  }

  /**
   * 移除白名单主机（按 host 匹配移除所有端口/协议）
   */
  removeAllowedHost(host: string): void {
    for (const [key, entry] of this.allowedHosts.entries()) {
      if (entry.host === host) {
        this.allowedHosts.delete(key);
      }
    }
  }

  /**
   * 检查 URL 是否允许出站
   * 默认拒绝所有非白名单请求
   */
  checkRequest(url: string): CheckResult {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { allowed: false, reason: `无效 URL: ${url}` };
    }

    const protocol = parsed.protocol.replace(':', '') as AllowedHostEntry['protocol'];
    const host = parsed.hostname;
    const port = parsed.port
      ? parseInt(parsed.port, 10)
      : (parsed.protocol === 'https:' || parsed.protocol === 'wss:' ? 443 : 80);

    const key = this.makeKey(host, port, protocol);
    const entry = this.allowedHosts.get(key);

    if (!entry) {
      return {
        allowed: false,
        reason: `出站请求被阻断: ${protocol}://${host}:${port} 不在白名单中`,
      };
    }

    return { allowed: true };
  }

  /**
   * 检查并抛出（若阻断则抛出 ShellError）
   */
  enforceRequest(url: string): void {
    const result = this.checkRequest(url);
    if (!result.allowed) {
      throw new ShellError(
        ShellErrorCode.OUTBOUND_BLOCKED,
        result.reason ?? '出站请求被阻断',
        url,
      );
    }
  }

  /**
   * 获取当前白名单条目数
   */
  get size(): number {
    return this.allowedHosts.size;
  }

  /**
   * 清空白名单
   */
  clear(): void {
    this.allowedHosts.clear();
  }

  /**
   * 获取所有白名单条目
   */
  getAllowedHosts(): ReadonlyArray<AllowedHostEntry> {
    return Array.from(this.allowedHosts.values());
  }

  private makeKey(host: string, port: number, protocol: string): string {
    return `${protocol}://${host}:${port}`;
  }
}
