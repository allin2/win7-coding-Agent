/**
 * @module broker
 * @description Agent Core 能力令牌管理 — 发放、撤销、验证与能力检查
 * @remarks 令牌按 sessionId 索引，支持过期检查
 */

import { CapabilityBinding, CapabilityToken } from './types';
import { capabilityRevokedError } from './errors';
import * as crypto from 'crypto';

/**
 * 令牌验证结果
 */
export interface TokenValidationResult {
  /** 令牌是否有效 */
  valid: boolean;
  /** 有效时返回令牌对象 */
  token?: CapabilityToken;
  /** 无效时返回原因 */
  reason?: string;
}

/**
 * CapabilityBroker 类 — 能力令牌生命周期管理
 * @remarks 管理令牌的发放、撤销、验证和能力查询
 */
export class CapabilityBroker {
  /** 令牌存储：tokenId -> CapabilityToken */
  private readonly tokens: Map<string, CapabilityToken> = new Map();
  /** 会话索引：sessionId -> Set<tokenId> */
  private readonly sessionIndex: Map<string, Set<string>> = new Map();

  /**
   * 发放能力令牌
   * @param sessionId - 关联会话 ID
   * @param capabilities - 授权的能力列表
   * @param ttlMs - 令牌有效期（毫秒），默认 3600000（1 小时）
   * @returns 发放的令牌对象
   */
  issueToken(
    sessionId: string,
    capabilities: string[],
    ttlMs: number = 3600000,
    binding?: CapabilityBinding,
  ): CapabilityToken {
    if (capabilities.includes('workspace_write') && !binding) {
      throw new TypeError('workspace_write token requires an exact approval binding');
    }
    const tokenId = this.generateTokenId();
    const token: CapabilityToken = {
      tokenId,
      sessionId,
      capabilities: [...capabilities],
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
      revoked: false,
      ...(binding ? { binding: { ...binding } } : {}),
    };

    this.tokens.set(tokenId, token);

    // 更新会话索引
    if (!this.sessionIndex.has(sessionId)) {
      this.sessionIndex.set(sessionId, new Set());
    }
    this.sessionIndex.get(sessionId)!.add(tokenId);

    return token;
  }

  /**
   * 撤销能力令牌
   * @param tokenId - 要撤销的令牌 ID
   * @throws AgentError(CAPABILITY_REVOKED) 令牌不存在时抛出
   */
  revokeToken(tokenId: string): void {
    const token = this.tokens.get(tokenId);
    if (!token) {
      throw capabilityRevokedError(`令牌 ${tokenId} 不存在`);
    }
    token.revoked = true;
  }

  /**
   * 验证令牌有效性
   * @param tokenId - 要验证的令牌 ID
   * @returns 验证结果
   */
  validateToken(tokenId: string): TokenValidationResult {
    const token = this.tokens.get(tokenId);
    if (!token) {
      return { valid: false, reason: '令牌不存在' };
    }
    if (token.revoked) {
      return { valid: false, reason: '令牌已撤销' };
    }
    if (this.isExpired(token)) {
      return { valid: false, reason: '令牌已过期' };
    }
    return { valid: true, token };
  }

  /**
   * 检查令牌是否具有指定能力
   * @param tokenId - 令牌 ID
   * @param capability - 要检查的能力名称
   * @returns 是否具有该能力
   */
  hasCapability(tokenId: string, capability: string): boolean {
    const validation = this.validateToken(tokenId);
    if (!validation.valid || !validation.token) {
      return false;
    }
    return validation.token.capabilities.includes(capability);
  }

  /**
   * 获取指定会话的所有有效令牌
   * @param sessionId - 会话 ID
   * @returns 有效令牌列表
   */
  getTokensBySession(sessionId: string): CapabilityToken[] {
    const tokenIds = this.sessionIndex.get(sessionId);
    if (!tokenIds) return [];
    const result: CapabilityToken[] = [];
    for (const tokenId of tokenIds) {
      const validation = this.validateToken(tokenId);
      if (validation.valid && validation.token) {
        result.push(validation.token);
      }
    }
    return result;
  }

  /**
   * 清理指定会话的所有令牌
   * @param sessionId - 会话 ID
   */
  clearSession(sessionId: string): void {
    const tokenIds = this.sessionIndex.get(sessionId);
    if (!tokenIds) return;
    for (const tokenId of tokenIds) {
      this.tokens.delete(tokenId);
    }
    this.sessionIndex.delete(sessionId);
  }

  /**
   * 检查令牌是否已过期
   * @param token - 令牌对象
   * @returns 是否已过期
   */
  private isExpired(token: CapabilityToken): boolean {
    return new Date(token.expiresAt).getTime() <= Date.now();
  }

  /**
   * 生成唯一令牌 ID
   * @returns 令牌 ID 字符串
   */
  private generateTokenId(): string {
    return `tok_${crypto.randomBytes(16).toString('hex')}`;
  }
}

/**
 * 创建默认能力令牌管理器
 * @returns CapabilityBroker 实例
 */
export function createBroker(): CapabilityBroker {
  return new CapabilityBroker();
}
