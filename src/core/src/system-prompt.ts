/**
 * @module system-prompt
 * @description A9 System Prompt V2 契约与构建器
 * @remarks ADR-0089 / PRD §7 A9-GW01 / PRD §8 A9-A01
 */

import * as crypto from 'crypto';
import { PermissionMode } from './types';

export const A9_SYSTEM_PROMPT_VERSION = 'a9-system-prompt-v2';

export interface SystemPromptOptions {
  mode?: PermissionMode;
  shell?: 'powershell' | 'cmd' | string;
  /** 探测到的 Shell 版本（进入模型上下文与工具卡片，A9-SH01）。 */
  shellVersion?: string;
  targetOs?: string;
  cwd?: string;
  /** 当前模式对模型可见的工具名（按模式过滤，不虚构能力）。 */
  visibleTools?: string[];
}

export interface SystemPromptContract {
  schemaVersion: 2;
  version: string;
  sha256: string;
  content: string;
}

/**
 * 构建符合 A9 契约的 System Prompt V2
 */
export function buildA9SystemPrompt(options: SystemPromptOptions = {}): SystemPromptContract {
  const mode = options.mode || PermissionMode.FULL_ACCESS;
  const shell = options.shell || 'powershell';
  const targetOs = options.targetOs || 'Windows 7 SP1 x64';

  const modeInstructions = mode === PermissionMode.FULL_ACCESS
    ? [
        'Permission Mode: FULL ACCESS.',
        '- You are authorized to directly read, search, create, edit, copy, move, and delete files in this workspace.',
        '- You may execute project build, test, and package management commands using the `shell` tool.',
        '- High-impact operations (git push, destructive reset/clean, package publishing, permanent deletion) require explicit user confirmation.',
      ]
    : mode === PermissionMode.REVIEW
      ? [
          'Permission Mode: REVIEW.',
          '- You may inspect the workspace and propose file changes for user review.',
          '- File writes and executions will be staged or require explicit approval before applying to the target workspace.',
        ]
      : [
          'Permission Mode: READ ONLY.',
          '- You are only permitted to read, search, list, and analyze workspace contents.',
          '- Mutating file operations and shell command executions are disabled.',
        ];

  const shellLabel = options.shellVersion ? `${shell} ${options.shellVersion}` : shell;
  const visibleTools = options.visibleTools ?? ['list', 'read', 'search', 'write', 'edit', 'copy', 'move', 'delete', 'shell', 'update_plan'];
  const content = [
    `[${A9_SYSTEM_PROMPT_VERSION}] You are the Windows 7 Trusted Coding Agent.`,
    `Target Environment: ${targetOs}. Shell: ${shellLabel}.`,
    options.cwd ? `Working Directory: ${options.cwd}.` : '',
    '',
    ...modeInstructions,
    '',
    'Instruction Hierarchy:',
    '1. Runtime invariants & active permission mode (highest priority).',
    '2. Explicit user prompt for the current task.',
    '3. AGENTS.md and detected project instructions (CLAUDE.md, etc.).',
    '4. Codebase contents and data.',
    '',
    'Tool Guidelines:',
    `- Available tools in the current permission mode: ${visibleTools.map((t) => `\`${t}\``).join(', ')}.`,
    '- For modifying code, prefer `edit` (precise anchor replacement) or `write` (complete content) to preserve encoding and line endings.',
    `- When calling \`shell\`, provide complete valid ${shell} command strings. Execution is non-interactive; use non-interactive flags.`,
    '- Make reasonable assumptions for routine implementation details; only pause to ask the user when facing irreversible or directional choices.',
    '',
    'Honest Verification & Outcome:',
    '- Never claim tests or builds passed without actual execution evidence via `shell`.',
    '- Report task status honestly: Verified Complete (when tests/builds passed), Completed with Warnings (if unverified), or Blocked (with reasons).',
  ].join('\n');

  const sha256 = crypto.createHash('sha256').update(content, 'utf8').digest('hex');

  return {
    schemaVersion: 2,
    version: A9_SYSTEM_PROMPT_VERSION,
    sha256,
    content,
  };
}
