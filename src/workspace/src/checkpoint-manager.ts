/**
 * @module checkpoint-manager
 * @description A9 工作区 Checkpoint、Diff、撤销与删除恢复管理 (PRD §5 A9-F03 / ADR-0089)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { buildContentDiffPreview } from './diff';

export interface FileChangeRecord {
  filePath: string;
  action: 'create' | 'modify' | 'delete';
  originalHash?: string;
  originalContent?: Buffer;
  newHash?: string;
  newContent?: Buffer;
  timestamp: string;
}

export interface TurnCheckpoint {
  turnId: string;
  createdAt: string;
  changes: Map<string, FileChangeRecord>;
  baselineHashes: Map<string, string>;
}

export class CheckpointManager {
  private readonly checkpoints = new Map<string, TurnCheckpoint>();
  private readonly recoveryDir: string;

  constructor(private readonly workspaceRoot: string) {
    this.recoveryDir = path.join(workspaceRoot, '.agent_recovery');
  }

  /**
   * 开启一轮新的 Checkpoint 事务
   */
  startTurn(turnId: string): TurnCheckpoint {
    let checkpoint = this.checkpoints.get(turnId);
    if (!checkpoint) {
      checkpoint = {
        turnId,
        createdAt: new Date().toISOString(),
        changes: new Map(),
        baselineHashes: new Map(),
      };
      this.checkpoints.set(turnId, checkpoint);
    }
    return checkpoint;
  }

  /**
   * 在发生副作用前记录文件原始内容基线
   */
  recordPreMutation(turnId: string, targetPath: string): void {
    const checkpoint = this.startTurn(turnId);
    const absPath = path.resolve(this.workspaceRoot, targetPath);

    if (!checkpoint.changes.has(targetPath)) {
      if (fs.existsSync(absPath)) {
        try {
          const content = fs.readFileSync(absPath);
          const hash = crypto.createHash('sha256').update(content).digest('hex');
          checkpoint.baselineHashes.set(targetPath, hash);
          checkpoint.changes.set(targetPath, {
            filePath: targetPath,
            action: 'modify',
            originalHash: hash,
            originalContent: content,
            timestamp: new Date().toISOString(),
          });
        } catch (_e) {
          // ignore read error
        }
      } else {
        // 新建文件
        checkpoint.changes.set(targetPath, {
          filePath: targetPath,
          action: 'create',
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  /**
   * 记录已完成的文件变更后状态
   */
  recordPostMutation(turnId: string, targetPath: string, action: 'create' | 'modify' | 'delete'): void {
    const checkpoint = this.startTurn(turnId);
    const absPath = path.resolve(this.workspaceRoot, targetPath);
    const existing = checkpoint.changes.get(targetPath) || {
      filePath: targetPath,
      action,
      timestamp: new Date().toISOString(),
    };

    if (action === 'delete') {
      existing.action = 'delete';
      existing.newHash = undefined;
      existing.newContent = undefined;
      // 保存至恢复区备份
      if (existing.originalContent) {
        this.saveToRecovery(targetPath, existing.originalContent);
      }
    } else if (fs.existsSync(absPath)) {
      try {
        const content = fs.readFileSync(absPath);
        existing.newContent = content;
        existing.newHash = crypto.createHash('sha256').update(content).digest('hex');
      } catch (_e) {
        // ignore
      }
    }

    checkpoint.changes.set(targetPath, existing);
  }

  /**
   * 撤销整轮 Turn 的所有文件修改
   */
  undoTurn(turnId: string): { restored: string[]; errors: string[] } {
    const checkpoint = this.checkpoints.get(turnId);
    if (!checkpoint) {
      return { restored: [], errors: [`未找到 Checkpoint: ${turnId}`] };
    }

    const restored: string[] = [];
    const errors: string[] = [];

    for (const [relPath, record] of checkpoint.changes.entries()) {
      const absPath = path.resolve(this.workspaceRoot, relPath);
      try {
        if (record.action === 'create') {
          // 新建的文件撤销为删除
          if (fs.existsSync(absPath)) {
            fs.unlinkSync(absPath);
            restored.push(`${relPath} (已移除新建文件)`);
          }
        } else if (record.action === 'modify' || record.action === 'delete') {
          // 修改或删除的文件撤销为恢复原内容
          if (record.originalContent) {
            const parentDir = path.dirname(absPath);
            if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
            fs.writeFileSync(absPath, record.originalContent);
            restored.push(`${relPath} (已恢复原始版本)`);
          }
        }
      } catch (err: any) {
        errors.push(`撤销 ${relPath} 失败: ${err.message}`);
      }
    }

    return { restored, errors };
  }

  /**
   * 获取指定 Turn 的变更清单和 Diff
   */
  getTurnDiff(turnId: string): Array<{ path: string; action: string; diffText: string }> {
    const checkpoint = this.checkpoints.get(turnId);
    if (!checkpoint) return [];

    const results: Array<{ path: string; action: string; diffText: string }> = [];

    for (const [relPath, record] of checkpoint.changes.entries()) {
      const diff = buildContentDiffPreview(
        record.originalContent ?? null,
        record.newContent ?? null,
      );

      results.push({
        path: relPath,
        action: record.action,
        diffText: diff.unifiedDiff,
      });
    }

    return results;
  }

  private saveToRecovery(relPath: string, content: Buffer): void {
    try {
      if (!fs.existsSync(this.recoveryDir)) {
        fs.mkdirSync(this.recoveryDir, { recursive: true });
      }
      const safeName = relPath.replace(/[\\/]/g, '_') + `.${Date.now()}.bak`;
      fs.writeFileSync(path.join(this.recoveryDir, safeName), content);
    } catch (_e) {
      // 忽略恢复区保存失败
    }
  }
}
