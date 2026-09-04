/**
 * @module a9-mode-settings
 * @description A9 工作区权限模式的持久化设置（PRD §2 A9-M01 / ADR-0089 / ADR-0090）
 *
 * 存储键绑定 canonical absolute workspace path 的 SHA-256（v2），修复两个
 * 末级目录同名的工作区共用同一 basename 键、第二个工作区静默继承
 * full_access 的缺陷。加载后验证文档内 workspaceRoot 与当前工作区一致；
 * 旧 basename（v1）文件只有在内部 workspaceRoot 与当前工作区精确匹配时
 * 才允许迁移。未知、缺失、损坏、跨工作区一律 needs_selection（fail-closed）。
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PermissionMode, normalizePermissionMode } from './types';

export const WORKSPACE_MODE_SETTINGS_SCHEMA_VERSION = 2;

/** v1（basename 键）历史文档；仅用于精确匹配迁移。 */
const LEGACY_SCHEMA_VERSION = 1;

export interface ModeAuditEntry {
  changedAt: string;
  from: PermissionMode | 'none';
  to: PermissionMode;
}

export interface WorkspaceModeSettingsV2 {
  schemaVersion: typeof WORKSPACE_MODE_SETTINGS_SCHEMA_VERSION;
  /** canonical absolute workspace path（规范化合同见 canonicalizeWorkspacePath）。 */
  workspaceRoot: string;
  permissionMode: PermissionMode;
  selectedAt: string;
  /** 模式切换持久化审计（有界）。 */
  auditTrail: ModeAuditEntry[];
}

export type WorkspaceModeSettingsState =
  | { status: 'configured'; settings: WorkspaceModeSettingsV2 }
  | { status: 'needs_selection'; reason: 'missing' | 'unparsable' | 'invalid_mode' | 'schema_mismatch' | 'workspace_mismatch'; detail?: string };

/**
 * 工作区路径规范化合同（跨平台可单测）：
 * 1. 统一分隔符：win32 用反斜杠，其他平台用正斜杠；
 * 2. 展开为绝对路径（相对路径基于 process.cwd()）；
 * 3. 去除末尾分隔符（保留根：`C:\` 或 `/`）；
 * 4. win32 盘符统一小写，且整条路径按大小写不敏感规范化（全小写）；
 *    POSIX 保持大小写敏感原样；
 * 5. UNC 路径保持 `\\server\share\...` 形式并同样小写化（win32）。
 */
export function canonicalizeWorkspacePath(input: string, platform: NodeJS.Platform = process.platform): string {
  if (typeof input !== 'string' || input.length === 0) return '';
  const isWin = platform === 'win32';
  let normalized = isWin ? input.replace(/\//g, '\\') : input.replace(/\\/g, '/');

  let absolute: string;
  if (isWin) {
    const cwd = process.cwd().replace(/\//g, '\\');
    absolute = path.win32.isAbsolute(normalized) ? normalized : path.win32.resolve(cwd, normalized);
  } else {
    absolute = path.posix.isAbsolute(normalized) ? normalized : path.posix.resolve(process.cwd(), normalized);
  }

  // 去除末尾分隔符，保留根。
  const root = isWin ? path.win32.parse(absolute).root : '/';
  let trimmed = absolute;
  while (trimmed.length > root.length && (trimmed.endsWith('\\') || trimmed.endsWith('/'))) {
    trimmed = trimmed.slice(0, -1);
  }

  if (isWin) {
    // 盘符小写 + 大小写不敏感规范化。
    const lowered = trimmed.toLowerCase();
    const drive = path.win32.parse(lowered);
    if (drive.root && /^[a-z]:\\$/.test(drive.root)) return lowered;
    return lowered;
  }
  return trimmed;
}

/** 工作区设置文件键：canonical 路径的 SHA-256（文件系统安全、长度固定）。 */
export function workspaceSettingsFileKey(workspaceRoot: string, platform: NodeJS.Platform = process.platform): string {
  const canonical = canonicalizeWorkspacePath(workspaceRoot, platform);
  if (!canonical) throw new Error('WORKSPACE_ROOT_INVALID');
  return `ws-${crypto.createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
}

/**
 * 解析 v2 设置文档。schema 不符、字段缺失、权限值未知、或文档绑定的工作区
 * 与当前工作区不一致（workspace_mismatch）都返回 needs_selection。
 */
export function parseWorkspaceModeSettings(raw: unknown, currentWorkspaceRoot: string, platform: NodeJS.Platform = process.platform): WorkspaceModeSettingsState {
  const canonicalCurrent = canonicalizeWorkspacePath(currentWorkspaceRoot, platform);
  if (raw === null || raw === undefined || typeof raw !== 'object') {
    return { status: 'needs_selection', reason: 'unparsable' };
  }
  const doc = raw as Record<string, unknown>;
  if (doc.schemaVersion !== WORKSPACE_MODE_SETTINGS_SCHEMA_VERSION) {
    return { status: 'needs_selection', reason: 'schema_mismatch', detail: `schemaVersion=${String(doc.schemaVersion)}` };
  }
  if (!Array.isArray(doc.auditTrail)) {
    return { status: 'needs_selection', reason: 'unparsable', detail: 'auditTrail missing' };
  }
  if (typeof doc.selectedAt !== 'string' || doc.selectedAt.length === 0) {
    return { status: 'needs_selection', reason: 'unparsable', detail: 'selectedAt missing' };
  }
  const mode = normalizePermissionMode(doc.permissionMode);
  if (!mode) {
    return { status: 'needs_selection', reason: 'invalid_mode', detail: `permissionMode=${JSON.stringify(doc.permissionMode)}` };
  }
  const docRoot = typeof doc.workspaceRoot === 'string' ? doc.workspaceRoot : '';
  if (!docRoot || canonicalizeWorkspacePath(docRoot, platform) !== canonicalCurrent) {
    return { status: 'needs_selection', reason: 'workspace_mismatch', detail: `doc=${docRoot} current=${canonicalCurrent}` };
  }
  return {
    status: 'configured',
    settings: {
      schemaVersion: WORKSPACE_MODE_SETTINGS_SCHEMA_VERSION,
      workspaceRoot: canonicalCurrent,
      permissionMode: mode,
      selectedAt: doc.selectedAt,
      auditTrail: (doc.auditTrail as ModeAuditEntry[]).slice(-50),
    },
  };
}

/**
 * v1（basename 键）历史文档迁移：只有内部 workspaceRoot 与当前工作区
 * canonical 精确一致时才允许迁移；否则拒绝（不读取其模式值）。
 */
export function parseLegacyForMigration(raw: unknown, currentWorkspaceRoot: string, platform: NodeJS.Platform = process.platform): WorkspaceModeSettingsV2 | null {
  if (raw === null || raw === undefined || typeof raw !== 'object') return null;
  const doc = raw as Record<string, unknown>;
  if (doc.schemaVersion !== LEGACY_SCHEMA_VERSION) return null;
  const mode = normalizePermissionMode(doc.permissionMode);
  if (!mode) return null;
  const docRoot = typeof doc.workspaceRoot === 'string' ? doc.workspaceRoot : '';
  if (!docRoot) return null;
  if (canonicalizeWorkspacePath(docRoot, platform) !== canonicalizeWorkspacePath(currentWorkspaceRoot, platform)) {
    return null;
  }
  return {
    schemaVersion: WORKSPACE_MODE_SETTINGS_SCHEMA_VERSION,
    workspaceRoot: canonicalizeWorkspacePath(currentWorkspaceRoot, platform),
    permissionMode: mode,
    selectedAt: typeof doc.selectedAt === 'string' ? doc.selectedAt : new Date().toISOString(),
    auditTrail: [{ changedAt: new Date().toISOString(), from: 'none' as const, to: mode }],
  };
}

const MAX_AUDIT_ENTRIES = 50;

/**
 * 工作区模式设置存储（v2）：读取损坏/不匹配时保持 needs_selection 并保留
 * 原文件供诊断；写入使用临时文件 + 原子替换并追加审计。
 */
export class WorkspaceModeSettingsStore {
  private readonly settingsPath: string;
  private readonly legacyPath: string | undefined;
  private readonly platform: NodeJS.Platform;

  constructor(settingsPath: string, options: { legacyPath?: string; platform?: NodeJS.Platform } = {}) {
    this.settingsPath = settingsPath;
    this.legacyPath = options.legacyPath;
    this.platform = options.platform ?? process.platform;
  }

  static settingsFilePathFor(dataRoot: string, workspaceRoot: string, platform: NodeJS.Platform = process.platform): string {
    const dir = path.join(dataRoot, 'workspace-modes');
    return path.join(dir, `${workspaceSettingsFileKey(workspaceRoot, platform)}.json`);
  }

  static legacyBasenameFilePathFor(dataRoot: string, workspaceRoot: string): string {
    const safeKey = path.basename(workspaceRoot).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
    return path.join(dataRoot, 'workspace-modes', `${safeKey}.v1.json`);
  }

  /** 加载（含受控 v1 迁移）。任何失败路径都不产生默认 Full Access。 */
  load(currentWorkspaceRoot: string): WorkspaceModeSettingsState {
    let text: string;
    try {
      text = fs.readFileSync(this.settingsPath, 'utf8');
    } catch (_err) {
      // v2 缺失时尝试 v1 精确匹配迁移。
      if (this.legacyPath && fs.existsSync(this.legacyPath)) {
        try {
          const legacy = JSON.parse(fs.readFileSync(this.legacyPath, 'utf8'));
          const migrated = parseLegacyForMigration(legacy, currentWorkspaceRoot, this.platform);
          if (migrated) {
            this.writeDocument(migrated);
            return { status: 'configured', settings: migrated };
          }
          return { status: 'needs_selection', reason: 'workspace_mismatch', detail: 'legacy document belongs to a different workspace' };
        } catch (err) {
          return { status: 'needs_selection', reason: 'unparsable', detail: err instanceof Error ? err.message : String(err) };
        }
      }
      return { status: 'needs_selection', reason: 'missing' };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      return { status: 'needs_selection', reason: 'unparsable', detail: err instanceof Error ? err.message : String(err) };
    }
    return parseWorkspaceModeSettings(parsed, currentWorkspaceRoot, this.platform);
  }

  save(workspaceRoot: string, permissionMode: PermissionMode): WorkspaceModeSettingsV2 {
    const existing = this.load(workspaceRoot);
    const previous = existing.status === 'configured' ? existing.settings.permissionMode : undefined;
    const settings: WorkspaceModeSettingsV2 = {
      schemaVersion: WORKSPACE_MODE_SETTINGS_SCHEMA_VERSION,
      workspaceRoot: canonicalizeWorkspacePath(workspaceRoot, this.platform),
      permissionMode,
      selectedAt: new Date().toISOString(),
      auditTrail: [
        ...(existing.status === 'configured' ? existing.settings.auditTrail : []),
        { changedAt: new Date().toISOString(), from: previous ?? ('none' as const), to: permissionMode },
      ].slice(-MAX_AUDIT_ENTRIES),
    };
    this.writeDocument(settings);
    return settings;
  }

  private writeDocument(settings: WorkspaceModeSettingsV2): void {
    const dir = path.dirname(this.settingsPath);
    fs.mkdirSync(dir, { recursive: true });
    const tmpPath = `${this.settingsPath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmpPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
    fs.renameSync(tmpPath, this.settingsPath);
  }
}
