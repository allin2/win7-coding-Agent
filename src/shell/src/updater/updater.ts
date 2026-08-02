/**
 * fail-closed Updater（D-016）
 *
 * The updater only applies a locally prepared payload after its package hash is
 * verified and bound to that payload. Directory swaps occur on one volume.
 * Downloading, signature validation and package extraction remain external
 * capabilities and are never simulated as success.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface UpdaterConfig {
  installDir: string;
  stagingDir: string;
  currentVersion: string;
  updateUrl?: string;
}

export interface UpdateInfo {
  available: boolean;
  latestVersion?: string;
  downloadUrl?: string;
  expectedHash?: string;
  reason?: string;
}

export interface DownloadResult {
  success: boolean;
  filePath?: string;
  size?: number;
  error?: string;
  recommendedAction?: string;
}

export interface VerifyResult {
  valid: boolean;
  actualHash?: string;
  error?: string;
}

export interface ApplyUpdateOptions {
  /** Signed/downloaded package whose SHA-256 is in the trusted manifest. */
  packagePath: string;
  expectedHash: string;
  /** Extracted payload. Defaults to <stagingDir>/payload. */
  preparedDir?: string;
}

export type ApplyStatus =
  | 'applied'
  | 'not_applied'
  | 'rolled_back'
  | 'rollback_failed';

export interface ApplyResult {
  success: boolean;
  status: ApplyStatus;
  rolledBack: boolean;
  error?: string;
  recommendedAction?: string;
}

export interface RollbackResult {
  success: boolean;
  error?: string;
  recommendedAction?: string;
}

const PAYLOAD_BINDING_FILE = '.verified-package-sha256';

export class Updater {
  private readonly config: UpdaterConfig;
  private readonly backupDir: string;

  constructor(config: UpdaterConfig) {
    this.config = { ...config };
    const installParent = path.dirname(path.resolve(config.installDir));
    const installName = path.basename(path.resolve(config.installDir));
    this.backupDir = path.join(installParent, `.${installName}.update-backup`);
  }

  async checkForUpdate(): Promise<UpdateInfo> {
    if (!this.config.updateUrl) {
      return { available: false, reason: '未配置企业更新源' };
    }
    return {
      available: false,
      reason: '更新清单网络获取尚未实现；未向用户伪报“已是最新版本”',
    };
  }

  async downloadUpdate(_downloadUrl?: string): Promise<DownloadResult> {
    return {
      success: false,
      error: '当前构建未实现受控下载，未创建或复用本地文件冒充下载成功',
      recommendedAction: '由企业部署系统放置已签名更新包，或完成 D-016 下载与签名验证实现。',
    };
  }

  /** Stream SHA-256 so update packages are not loaded entirely into memory. */
  async verifyUpdate(filePath: string, expectedHash: string): Promise<VerifyResult> {
    if (!/^[a-fA-F0-9]{64}$/.test(expectedHash)) {
      return { valid: false, error: '期望 SHA-256 必须是 64 位十六进制字符串' };
    }
    if (!isRegularFile(filePath)) {
      return { valid: false, error: `更新包不存在或不是普通文件: ${filePath}` };
    }

    try {
      const actualHash = await hashFile(filePath);
      if (actualHash.toLowerCase() !== expectedHash.toLowerCase()) {
        return {
          valid: false,
          actualHash,
          error: `哈希不匹配: 期望 ${expectedHash.toLowerCase()}, 实际 ${actualHash}`,
        };
      }
      return { valid: true, actualHash };
    } catch (error) {
      return {
        valid: false,
        error: `校验过程出错: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async applyUpdate(options: ApplyUpdateOptions): Promise<ApplyResult> {
    const installDir = path.resolve(this.config.installDir);
    const preparedDir = path.resolve(
      options.preparedDir ?? path.join(this.config.stagingDir, 'payload'),
    );

    if (!isDirectory(installDir)) {
      return notApplied(
        `安装目录不存在或不是目录: ${installDir}`,
        '重新安装当前版本，确认安装目录完整后再试。',
      );
    }
    if (!isDirectory(preparedDir)) {
      return notApplied(
        `已准备更新目录不存在: ${preparedDir}`,
        '先完成受信任的更新包解压步骤，再执行应用。',
      );
    }
    if (isPathInside(preparedDir, installDir) || isPathInside(installDir, preparedDir)) {
      return notApplied(
        '安装目录与更新目录不能互相包含',
        '把更新内容准备到安装目录之外的同卷暂存目录。',
      );
    }
    if (path.parse(installDir).root.toLowerCase() !== path.parse(preparedDir).root.toLowerCase()) {
      return notApplied(
        '更新目录与安装目录不在同一卷，无法使用原子 rename',
        '把 stagingDir 配置到安装目录所在卷后重试。',
      );
    }

    const verification = await this.verifyUpdate(options.packagePath, options.expectedHash);
    if (!verification.valid) {
      return notApplied(
        `更新包校验失败: ${verification.error ?? '未知校验错误'}`,
        '不要继续应用；重新获取企业签名清单和更新包。',
      );
    }

    const bindingPath = path.join(preparedDir, PAYLOAD_BINDING_FILE);
    if (!isRegularFile(bindingPath)) {
      return notApplied(
        `更新内容缺少 ${PAYLOAD_BINDING_FILE} 绑定文件`,
        '使用受信任解包器重新准备 payload，禁止手工跳过绑定校验。',
      );
    }
    const bindingHash = fs.readFileSync(bindingPath, 'utf8').trim().toLowerCase();
    if (bindingHash !== options.expectedHash.toLowerCase()) {
      return notApplied(
        '更新内容与已验证包的 SHA-256 绑定不一致',
        '清空暂存目录并从已验证更新包重新解压。',
      );
    }
    const payloadEntries = fs.readdirSync(preparedDir).filter((entry) => entry !== PAYLOAD_BINDING_FILE);
    if (payloadEntries.length === 0) {
      return notApplied(
        '更新 payload 为空，拒绝把应用替换为空目录',
        '检查更新包内容和解包日志。',
      );
    }
    if (fs.existsSync(this.backupDir)) {
      return notApplied(
        `检测到上次更新备份: ${this.backupDir}`,
        '先在诊断页选择恢复旧版本或由管理员确认并清理残留备份。',
      );
    }

    let originalMoved = false;
    try {
      fs.renameSync(installDir, this.backupDir);
      originalMoved = true;
      fs.renameSync(preparedDir, installDir);
      fs.rmSync(path.join(installDir, PAYLOAD_BINDING_FILE), { force: true });
      fs.rmSync(this.backupDir, { recursive: true, force: true });
      return { success: true, status: 'applied', rolledBack: false };
    } catch (error) {
      const failure = error instanceof Error ? error.message : String(error);
      if (!originalMoved) {
        return notApplied(
          `更新未开始应用: ${failure}`,
          '关闭占用安装目录的进程并重试；旧版本保持不变。',
        );
      }

      const rollback = await this.rollback();
      if (rollback.success) {
        return {
          success: false,
          status: 'rolled_back',
          rolledBack: true,
          error: `更新失败，已恢复旧版本: ${failure}`,
          recommendedAction: '可以继续使用旧版本；导出更新诊断后再重试。',
        };
      }
      return {
        success: false,
        status: 'rollback_failed',
        rolledBack: false,
        error: `更新失败且自动恢复失败: ${failure}; ${rollback.error ?? '未知回滚错误'}`,
        recommendedAction: rollback.recommendedAction,
      };
    }
  }

  async rollback(): Promise<RollbackResult> {
    const installDir = path.resolve(this.config.installDir);
    if (!isDirectory(this.backupDir)) {
      return {
        success: false,
        error: '备份目录不存在或损坏，无法回滚',
        recommendedAction: '不要继续启动新版本；由管理员从离线安装包恢复。',
      };
    }

    try {
      if (fs.existsSync(installDir)) {
        fs.rmSync(installDir, { recursive: true, force: true });
      }
      fs.renameSync(this.backupDir, installDir);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `回滚失败: ${error instanceof Error ? error.message : String(error)}`,
        recommendedAction: `停止启动应用，并将 ${this.backupDir} 手工恢复为 ${installDir}。`,
      };
    }
  }
}

function notApplied(error: string, recommendedAction: string): ApplyResult {
  return {
    success: false,
    status: 'not_applied',
    rolledBack: false,
    error,
    recommendedAction,
  };
}

function isRegularFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function isDirectory(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function isPathInside(candidate: string, parent: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
