import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import {
  ApplyUpdateOptions,
  Updater,
  UpdaterConfig,
} from '../../src/updater/updater';

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
    config = { installDir, stagingDir, currentVersion: '1.0.0' };
    updater = new Updater(config);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function prepareUpdate(newContent: string = 'new version'): ApplyUpdateOptions {
    const packagePath = path.join(stagingDir, 'pkg.bin');
    const packageContent = Buffer.from(`package:${newContent}`);
    fs.writeFileSync(packagePath, packageContent);
    const expectedHash = crypto.createHash('sha256').update(packageContent).digest('hex');
    const preparedDir = path.join(stagingDir, 'payload');
    fs.mkdirSync(preparedDir, { recursive: true });
    fs.writeFileSync(path.join(preparedDir, 'app.txt'), newContent);
    fs.writeFileSync(path.join(preparedDir, '.verified-package-sha256'), expectedHash);
    return { packagePath, expectedHash, preparedDir };
  }

  it('未配置更新源时说明原因', async () => {
    await expect(updater.checkForUpdate()).resolves.toMatchObject({
      available: false,
      reason: expect.any(String),
    });
  });

  it('未实现下载能力时不把本地文件冒充成功', async () => {
    const result = await updater.downloadUpdate('https://updates.example.test/pkg');
    expect(result.success).toBe(false);
    expect(result.recommendedAction).toContain('企业部署');
  });

  describe('verifyUpdate', () => {
    it('流式哈希匹配时验证通过', async () => {
      const options = prepareUpdate();
      await expect(updater.verifyUpdate(options.packagePath, options.expectedHash))
        .resolves.toMatchObject({ valid: true, actualHash: options.expectedHash });
    });

    it('哈希不匹配时 fail-closed', async () => {
      const options = prepareUpdate();
      const result = await updater.verifyUpdate(options.packagePath, '0'.repeat(64));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('哈希不匹配');
    });

    it('非法哈希格式和缺失文件均失败', async () => {
      await expect(updater.verifyUpdate('/nonexistent/file.bin', 'hash'))
        .resolves.toMatchObject({ valid: false });
    });
  });

  describe('applyUpdate / rollback', () => {
    it('安装目录不存在时状态为 not_applied', async () => {
      const options = prepareUpdate();
      const badUpdater = new Updater({ ...config, installDir: path.join(tmpDir, 'missing') });
      await expect(badUpdater.applyUpdate(options)).resolves.toMatchObject({
        success: false,
        status: 'not_applied',
        rolledBack: false,
      });
    });

    it('空 payload 不会替换可用安装', async () => {
      fs.writeFileSync(path.join(installDir, 'app.txt'), 'old version');
      const options = prepareUpdate();
      fs.rmSync(path.join(options.preparedDir!, 'app.txt'));

      const result = await updater.applyUpdate(options);
      expect(result.status).toBe('not_applied');
      expect(fs.readFileSync(path.join(installDir, 'app.txt'), 'utf8')).toBe('old version');
    });

    it('校验失败时旧版本保持不变', async () => {
      fs.writeFileSync(path.join(installDir, 'app.txt'), 'old version');
      const options = prepareUpdate();
      options.expectedHash = '0'.repeat(64);

      const result = await updater.applyUpdate(options);
      expect(result.status).toBe('not_applied');
      expect(fs.readFileSync(path.join(installDir, 'app.txt'), 'utf8')).toBe('old version');
    });

    it('同卷目录切换成功后返回 applied', async () => {
      fs.writeFileSync(path.join(installDir, 'app.txt'), 'old version');
      const options = prepareUpdate();

      const result = await updater.applyUpdate(options);
      expect(result).toMatchObject({ success: true, status: 'applied', rolledBack: false });
      expect(fs.readFileSync(path.join(installDir, 'app.txt'), 'utf8')).toBe('new version');
      expect(fs.existsSync(path.join(installDir, '.verified-package-sha256'))).toBe(false);
    });

    it('rollback 明确恢复同卷备份', async () => {
      fs.writeFileSync(path.join(installDir, 'app.txt'), 'broken version');
      const backupDir = path.join(tmpDir, '.install.update-backup');
      fs.mkdirSync(backupDir);
      fs.writeFileSync(path.join(backupDir, 'app.txt'), 'old version');

      const result = await updater.rollback();
      expect(result.success).toBe(true);
      expect(fs.readFileSync(path.join(installDir, 'app.txt'), 'utf8')).toBe('old version');
    });

    it('无有效备份时返回可操作的恢复建议而不抛异常', async () => {
      const result = await updater.rollback();
      expect(result.success).toBe(false);
      expect(result.recommendedAction).toContain('离线安装包');
    });
  });
});
