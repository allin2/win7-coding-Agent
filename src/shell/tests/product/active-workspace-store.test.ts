import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const { createActiveWorkspaceStore, FILE_NAME } = require('../../product/active-workspace-store') as any;
const { createDesktopHost } = require('../../product/desktop-host') as any;

describe('A9 active workspace restart store', () => {
  let root: string;

  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-active-workspace-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('atomically persists and reloads a Chinese and space path without task state', () => {
    const workspaceRoot = path.join(root, '中文 空格项目');
    const dataRoot = path.join(root, 'data');
    fs.mkdirSync(workspaceRoot, { recursive: true });
    const store = createActiveWorkspaceStore({ dataRoot });

    expect(store.load()).toBeNull();
    expect(store.save(fs.realpathSync(workspaceRoot))).toEqual({
      schemaVersion: 1,
      workspacePath: fs.realpathSync(workspaceRoot),
    });
    expect(createActiveWorkspaceStore({ dataRoot }).load()).toEqual({
      schemaVersion: 1,
      workspacePath: fs.realpathSync(workspaceRoot),
    });
    expect(fs.readdirSync(dataRoot)).toEqual([FILE_NAME]);
    expect(Object.keys(JSON.parse(fs.readFileSync(path.join(dataRoot, FILE_NAME), 'utf8'))).sort()).toEqual([
      'schemaVersion',
      'workspacePath',
    ]);
  });

  it('fails closed on a corrupt pointer and preserves its original bytes', () => {
    const dataRoot = path.join(root, 'data');
    fs.mkdirSync(dataRoot, { recursive: true });
    const filePath = path.join(dataRoot, FILE_NAME);
    fs.writeFileSync(filePath, '{broken', 'utf8');
    const before = fs.readFileSync(filePath);
    const store = createActiveWorkspaceStore({ dataRoot });

    expect(() => store.load()).toThrow(expect.objectContaining({ code: 'A9_ACTIVE_WORKSPACE_STORE_CORRUPT' }));
    expect(fs.readFileSync(filePath)).toEqual(before);
  });

  it('does not bind the host when durable selection cannot be written', async () => {
    const workspaceRoot = path.join(root, 'workspace');
    fs.mkdirSync(workspaceRoot, { recursive: true });
    const host = createDesktopHost({
      onWorkspaceSelected: () => {
        const error = new Error('write failed') as Error & { code?: string };
        error.code = 'A9_ACTIVE_WORKSPACE_STORE_WRITE_FAILED';
        throw error;
      },
    });
    try {
      await expect(host.selectWorkspace(workspaceRoot)).rejects.toMatchObject({
        code: 'A9_ACTIVE_WORKSPACE_STORE_WRITE_FAILED',
      });
      expect(host.getActiveWorkspacePath()).toBeNull();
      expect(host.listSessions()).toEqual([]);
    } finally {
      host.dispose();
    }
  });
});
