/**
 * @module a9-ignore
 * @description A9 工作区文件忽略规则与过滤 (PRD §5 A9-F01 / ADR-0089)
 */

import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_IGNORED_NAMES = new Set([
  '.git',
  '.svn',
  '.hg',
  'node_modules',
  '.venv',
  'venv',
  '__pycache__',
  '.agent_recovery',
  'dist',
  'build',
  'bin',
  'obj',
]);

export interface IgnoreFilter {
  isIgnored(relativePath: string, isDirectory?: boolean): boolean;
}

/**
 * 构建针对指定工作区的忽略规则过滤器
 */
export function createWorkspaceIgnoreFilter(workspaceRoot: string): IgnoreFilter {
  const ignorePatterns: string[] = [];

  // 读取 .gitignore
  const gitignorePath = path.join(workspaceRoot, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    try {
      const content = fs.readFileSync(gitignorePath, 'utf8');
      ignorePatterns.push(...parseIgnoreLines(content));
    } catch (_e) {
      // 忽略读取错误
    }
  }

  // 读取 .agentignore
  const agentignorePath = path.join(workspaceRoot, '.agentignore');
  if (fs.existsSync(agentignorePath)) {
    try {
      const content = fs.readFileSync(agentignorePath, 'utf8');
      ignorePatterns.push(...parseIgnoreLines(content));
    } catch (_e) {
      // 忽略读取错误
    }
  }

  return {
    isIgnored(relativePath: string, _isDirectory?: boolean): boolean {
      const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
      if (!normalized || normalized === '.') return false;

      const segments = normalized.split('/');
      for (const segment of segments) {
        if (DEFAULT_IGNORED_NAMES.has(segment)) return true;
      }

      for (const pattern of ignorePatterns) {
        if (matchPattern(normalized, pattern)) return true;
      }

      return false;
    },
  };
}

function parseIgnoreLines(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

function matchPattern(targetPath: string, pattern: string): boolean {
  let cleanPattern = pattern.replace(/\\/g, '/');
  if (cleanPattern.endsWith('/')) {
    cleanPattern = cleanPattern.slice(0, -1);
  }
  if (cleanPattern.startsWith('/')) {
    cleanPattern = cleanPattern.slice(1);
    return targetPath === cleanPattern || targetPath.startsWith(cleanPattern + '/');
  }
  if (cleanPattern.includes('*')) {
    const regexStr = cleanPattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '.*')
      .replace(/(?<!\.)\*/g, '[^/]*');
    return new RegExp(`(?:^|/)${regexStr}(?:/|$)`).test(targetPath);
  }
  return targetPath === cleanPattern || targetPath.endsWith('/' + cleanPattern) || targetPath.includes('/' + cleanPattern + '/');
}
