/**
 * Updater 校验/回滚测试
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import { Updater, UpdaterConfig } from '../../src/updater/updater';
import { ShellError, ShellErrorCode } from '../../src/errors';

describe('Updater', () => {
  let tmpDir: string;
  let installDir: string;
  let stagingDir: string;
  let config: UpdaterConfig;
  let updater: Updater;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'updater-test-'));
    installDir = path.join(tmpDir, 'install');
    stagingDir = path.join(tmpDir, 'staging');
    fs.mkdirSync(installDir, { recursive: true });
    fs.mkdirSync(stagingDir, { recursive: true });

    config = {
      installDir,
      stagingDir,
      currentVersion: '1.0.0',
    };
    updater = new Updater(config);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('checkForUpdate', () => {
    it('无 updateUrl 时返回 available=false', async () => {
      const info = await updater.checkForUpdate();
      expect(info.available).toBe(false);
    });
  });

  describe('verifyUpdate', () => {
    it('哈希匹配时验证通过', async () => {
      const content = Buffer.from('update-package-content');
      const filePath = path.join(stagingDir, 'pkg.bin');
      fs.writeFileSync(filePath, content);
      const expectedHash = crypto.createHash('sha256').update(content).digest('hex');

      const result = await updater.verifyUpdate(filePath, expectedHash);
      expect(result.valid).toBe(true);
    });

    it('哈希不匹配时验证失败（fail-closed）', async () => {
      const content = Buffer.from('update-package-content');
      const filePath = path.join(stagingDir, 'pkg.bin');
      fs.writeFileSync(filePath, content);

      const result = await updater.verifyUpdate(filePath, 'deadbeef');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('哈希不匹配');
    });

    it('文件不存在时验证失败', async () => {
      const result = await updater.verifyUpdate('/nonexistent/file.bin', 'hash');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('不存在');
    });
  });

  describe('downloadUpdate', () => {
    it('无 URL 时返回失败', async () => {
      const result = await updater.downloadUpdate();
      expect(result.success).toBe(false);
      expect(result.error).toContain('URL');
    });
  });

  describe('applyUpdate + rollback', () => {
    it('安装目录不存在时返回失败', async () => {
      const badConfig = { ...config, installDir: '/nonexistent/dir' };
      const badUpdater = new Updater(badConfig);
      const result = await badUpdater.applyUpdate();
      expect(result.success).toBe(false);
      expect(result.rolledBack).toBe(false);
    });

    it('staging 目录为空时 apply 正常执行（无内容替换）', async () => {
      // 写入一个文件到 install 目录
      fs.writeFileSync(path.join(installDir, 'app.txt'), 'old version');

      // staging 为空，apply 应成功（无文件需要替换）
      const result = await updater.applyUpdate();
      expect(result.success).toBe(true);
    });

    it('apply 成功后文件被替换', async () => {
      // 准备当前版本
      fs.writeFileSync(path.join(installDir, 'app.txt'), 'old version');

      // 准备更新包
      fs.writeFileSync(path.join(stagingDir, 'app.txt'), 'new version');

      const result = await updater.applyUpdate();
      expect(result.success).toBe(true);
      expect(result.rolledBack).toBe(false);

      // 验证文件已更新
      const content = fs.readFileSync(path.join(installDir, 'app.txt'), 'utf-8');
      expect(content).toBe('new version');
    });

    it('rollback 在无备份时失败', async () => {
      const result = await updater.rollback();
      expect(result.success).toBe(false);
      expect(result.error).toContain('备份目录不存在');
    });
  });
});
