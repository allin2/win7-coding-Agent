/**
 * @module a9-mode-settings
 * @description A9 工作区权限模式的持久化设置（PRD §2 A9-M01 / ADR-0089）
 *
 * 首次打开工作区必须显式选择 Full Access / Review / Read Only 并记住该选择；
 * 未知、缺失或损坏的持久化值按 fail-closed 处理，返回 `needs_selection`，
 * 绝不静默提升为 Full Access。
 */

import * as fs from 'fs';
import * as path from 'path';
import { PermissionMode, normalizePermissionMode } from './types';

export const WORKSPACE_MODE_SETTINGS_SCHEMA_VERSION = 1;

export interface WorkspaceModeSettingsV1 {
  schemaVersion: typeof WORKSPACE_MODE_SETTINGS_SCHEMA_VERSION;
  workspaceRoot: string;
  permissionMode: PermissionMode;
  selectedAt: string;
}

export type WorkspaceModeSettingsState =
  | { status: 'configured'; settings: WorkspaceModeSettingsV1 }
  | { status: 'needs_selection'; reason: 'missing' | 'unparsable' | 'invalid_mode' | 'schema_mismatch'; detail?: string };

/**
 * 解析已持久化的模式设置文档。任何字段缺失、schema 不符或权限值未知都返回
 * `needs_selection`，不产生默认 Full Access。
 */
export function parseWorkspaceModeSettings(raw: unknown): WorkspaceModeSettingsState {
  if (raw === null || raw === undefined || typeof raw !== 'object') {
    return { status: 'needs_selection', reason: 'unparsable' };
  }
  const doc = raw as Record<string, unknown>;
  if (doc.schemaVersion !== WORKSPACE_MODE_SETTINGS_SCHEMA_VERSION) {
    return { status: 'needs_selection', reason: 'schema_mismatch', detail: `schemaVersion=${String(doc.schemaVersion)}` };
  }
  if (typeof doc.workspaceRoot !== 'string' || doc.workspaceRoot.length === 0) {
    return { status: 'needs_selection', reason: 'unparsable', detail: 'workspaceRoot missing' };
  }
  if (typeof doc.selectedAt !== 'string' || doc.selectedAt.length === 0) {
    return { status: 'needs_selection', reason: 'unparsable', detail: 'selectedAt missing' };
  }
  const mode = normalizePermissionMode(doc.permissionMode);
  if (!mode) {
    return { status: 'needs_selection', reason: 'invalid_mode', detail: `permissionMode=${JSON.stringify(doc.permissionMode)}` };
  }
  return {
    status: 'configured',
    settings: {
      schemaVersion: WORKSPACE_MODE_SETTINGS_SCHEMA_VERSION,
      workspaceRoot: doc.workspaceRoot,
      permissionMode: mode,
      selectedAt: doc.selectedAt,
    },
  };
}

/**
 * 工作区模式设置存储：读取损坏时保持 needs_selection 并保留原文件供诊断，
 * 写入使用临时文件 + 原子替换。
 */
export class WorkspaceModeSettingsStore {
  constructor(private readonly settingsPath: string) {}

  static settingsFilePathFor(dataRoot: string, workspaceKey: string): string {
    const safeKey = workspaceKey.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
    return path.join(dataRoot, 'workspace-modes', `${safeKey}.v${WORKSPACE_MODE_SETTINGS_SCHEMA_VERSION}.json`);
  }

  load(): WorkspaceModeSettingsState {
    let text: string;
    try {
      text = fs.readFileSync(this.settingsPath, 'utf8');
    } catch (_err) {
      return { status: 'needs_selection', reason: 'missing' };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      return { status: 'needs_selection', reason: 'unparsable', detail: err instanceof Error ? err.message : String(err) };
    }
    return parseWorkspaceModeSettings(parsed);
  }

  save(workspaceRoot: string, permissionMode: PermissionMode): WorkspaceModeSettingsV1 {
    const settings: WorkspaceModeSettingsV1 = {
      schemaVersion: WORKSPACE_MODE_SETTINGS_SCHEMA_VERSION,
      workspaceRoot,
      permissionMode,
      selectedAt: new Date().toISOString(),
    };
    const dir = path.dirname(this.settingsPath);
    fs.mkdirSync(dir, { recursive: true });
    const tmpPath = `${this.settingsPath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmpPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
    fs.renameSync(tmpPath, this.settingsPath);
    return settings;
  }
}
