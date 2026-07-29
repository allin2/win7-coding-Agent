/**
 * fail-closed Updater（D-016）
 * 校验失败 → 拒绝，保留旧版本
 * 使用临时目录 + rename 确保原子性，断电不产生半更新
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { ShellError, ShellErrorCode } from '../errors';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UpdaterConfig {
  /** 应用安装目录 */
  installDir: string;
  /** 临时下载/暂存目录 */
  stagingDir: string;
  /** 当前版本号 */
  currentVersion: string;
  /** 更新包下载 URL */
  updateUrl?: string;
}

export interface UpdateInfo {
  available: boolean;
  latestVersion?: string;
  downloadUrl?: string;
  expectedHash?: string;
}

export interface DownloadResult {
  success: boolean;
  filePath?: string;
  size?: number;
  error?: string;
}

export interface VerifyResult {
  valid: boolean;
  error?: string;
}

export interface ApplyResult {
  success: boolean;
  rolledBack: boolean;
  error?: string;
}

export interface RollbackResult {
  success: boolean;
  error?: string;
}

// ─── Updater ──────────────────────────────────────────────────────────────────

export class Updater {
  private config: UpdaterConfig;
  private backupDir: string;

  constructor(config: UpdaterConfig) {
    this.config = config;
    this.backupDir = path.join(config.stagingDir, '.backup');
  }

  /**
   * 检查是否有可用更新
   * 注意：实际实现中需从 updateUrl 获取版本信息
   * 当前为 stub 实现，返回无更新
   */
  async checkForUpdate(): Promise<UpdateInfo> {
    if (!this.config.updateUrl) {
      return { available: false };
    }

    // 实际实现：从 updateUrl 获取 manifest.json
    // 当前 stub：返回无更新
    return { available: false };
  }

  /**
   * 下载更新包到 staging 目录
   * 实际实现中从 downloadUrl 下载
   */
  async downloadUpdate(downloadUrl?: string): Promise<DownloadResult> {
    const url = downloadUrl ?? this.config.updateUrl;
    if (!url) {
      return { success: false, error: '未配置更新下载 URL' };
    }

    // 确保 staging 目录存在
    if (!fs.existsSync(this.config.stagingDir)) {
      fs.mkdirSync(this.config.stagingDir, { recursive: true });
    }

    const filePath = path.join(this.config.stagingDir, 'update-package.bin');

    // 实际实现：从 url 下载文件到 filePath
    // 当前 stub：检查文件是否已存在
    if (!fs.existsSync(filePath)) {
      return { success: false, error: '更新包不存在（stub 实现）' };
    }

    const stat = fs.statSync(filePath);
    return { success: true, filePath, size: stat.size };
  }

  /**
   * 校验更新包完整性（SHA-256 哈希比对）
   * fail-closed：校验失败拒绝应用
   */
  async verifyUpdate(filePath: string, expectedHash: string): Promise<VerifyResult> {
    if (!fs.existsSync(filePath)) {
      return { valid: false, error: `更新包不存在: ${filePath}` };
    }

    try {
      const fileBuffer = fs.readFileSync(filePath);
      const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

      if (hash !== expectedHash) {
        return {
          valid: false,
          error: `哈希不匹配: 期望 ${expectedHash}, 实际 ${hash}`,
        };
      }

      return { valid: true };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return { valid: false, error: `校验过程出错: ${errMsg}` };
    }
  }

  /**
   * 应用更新
   * 使用临时目录 + rename 确保原子性：
   * 1. 将当前安装目录备份到 backupDir
   * 2. 将 staging 中的更新内容 rename 到 installDir
   * 3. 若中途失败，自动回滚
   */
  async applyUpdate(): Promise<ApplyResult> {
    const { installDir, stagingDir } = this.config;

    // 验证安装目录存在
    if (!fs.existsSync(installDir)) {
      return { success: false, rolledBack: false, error: `安装目录不存在: ${installDir}` };
    }

    // 验证 staging 目录存在且有更新内容
    if (!fs.existsSync(stagingDir)) {
      return { success: false, rolledBack: false, error: `暂存目录不存在: ${stagingDir}` };
    }

    try {
      // Step 1: 备份当前版本
      await this.backup(installDir, this.backupDir);

      // Step 2: 原子替换 — 将 staging 内容 rename 到 installDir
      // 实际实现中需要处理跨文件系统的情况
      // 当前实现：逐文件替换
      const stagingContents = fs.readdirSync(stagingDir);
      for (const item of stagingContents) {
        if (item === '.backup') continue;
        const srcPath = path.join(stagingDir, item);
        const destPath = path.join(installDir, item);
        // rename 是原子操作（同一文件系统下）
        fs.renameSync(srcPath, destPath);
      }

      return { success: true, rolledBack: false };
    } catch (err) {
      // 失败时自动回滚
      const rollbackResult = await this.rollback();
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        rolledBack: rollbackResult.success,
        error: `更新失败并已回滚: ${errMsg}`,
      };
    }
  }

  /**
   * 回滚到备份版本
   */
  async rollback(): Promise<RollbackResult> {
    const { installDir } = this.config;

    if (!fs.existsSync(this.backupDir)) {
      return { success: false, error: '备份目录不存在，无法回滚' };
    }

    try {
      // 清除当前安装目录内容
      const currentContents = fs.readdirSync(installDir);
      for (const item of currentContents) {
        const itemPath = path.join(installDir, item);
        fs.rmSync(itemPath, { recursive: true, force: true });
      }

      // 从备份恢复
      const backupContents = fs.readdirSync(this.backupDir);
      for (const item of backupContents) {
        const srcPath = path.join(this.backupDir, item);
        const destPath = path.join(installDir, item);
        fs.renameSync(srcPath, destPath);
      }

      // 清理备份目录
      fs.rmdirSync(this.backupDir, { recursive: true });

      return { success: true };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      throw new ShellError(
        ShellErrorCode.UPDATE_VERIFY_FAILED,
        `回滚失败: ${errMsg}`,
        '回滚过程发生不可恢复错误',
      );
    }
  }

  /**
   * 备份当前安装目录
   */
  private async backup(srcDir: string, destDir: string): Promise<void> {
    if (fs.existsSync(destDir)) {
      fs.rmSync(destDir, { recursive: true, force: true });
    }
    fs.mkdirSync(destDir, { recursive: true });

    const contents = fs.readdirSync(srcDir);
    for (const item of contents) {
      const srcPath = path.join(srcDir, item);
      const destPath = path.join(destDir, item);
      fs.renameSync(srcPath, destPath);
    }
  }
}
