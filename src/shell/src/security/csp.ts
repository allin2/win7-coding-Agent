/**
 * CSP（Content Security Policy）策略生成器
 * 默认策略：禁内联脚本、禁远程源、仅允许 self 和 gateway
 */

export interface CSPOptions {
  /** 允许连接的 gateway origin 列表，例如 ['http://localhost:9800'] */
  gatewayOrigins?: string[];
  /** 额外允许的 script-src 来源（默认仅 'self'） */
  extraScriptSrc?: string[];
  /** 是否允许 eval（默认 false） */
  allowEval?: boolean;
}

const DEFAULT_GATEWAY_ORIGINS: string[] = [];

/**
 * 生成 CSP 策略字符串
 * 默认策略：
 *   default-src 'none';
 *   script-src 'self';
 *   style-src 'self';
 *   connect-src <gateway-only>;
 *   img-src 'self';
 *   font-src 'self';
 *   frame-ancestors 'none';
 */
export function generateCSP(options?: CSPOptions): string {
  const origins = options?.gatewayOrigins ?? DEFAULT_GATEWAY_ORIGINS;
  const extraScriptSrc = options?.extraScriptSrc ?? [];
  const allowEval = options?.allowEval ?? false;

  // script-src
  const scriptSrcParts: string[] = ["'self'"];
  if (allowEval) {
    scriptSrcParts.push("'unsafe-eval'");
  }
  scriptSrcParts.push(...extraScriptSrc);

  // connect-src: 仅允许 gateway origins
  const connectSrcParts: string[] = [];
  if (origins.length > 0) {
    connectSrcParts.push(...origins);
  } else {
    // 无 gateway 配置时仅允许 self
    connectSrcParts.push("'self'");
  }

  const directives: Record<string, string> = {
    'default-src': "'none'",
    'script-src': scriptSrcParts.join(' '),
    'style-src': "'self'",
    'connect-src': connectSrcParts.join(' '),
    'img-src': "'self'",
    'font-src': "'self'",
    'frame-ancestors': "'none'",
    'base-uri': "'self'",
    'form-action': "'self'",
  };

  return Object.entries(directives)
    .map(([key, value]) => `${key} ${value}`)
    .join('; ');
}

/**
 * 获取默认 CSP 策略（无参数）
 */
export function getDefaultCSP(): string {
  return generateCSP();
}
