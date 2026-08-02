/**
 * Git Adapter — isolated, whitelisted Git requests routed through Runner.
 *
 * This module deliberately has no child_process capability. The injected
 * runner owns timeout, output bounds, process-tree containment, and the final
 * approval revalidation boundary.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  GitAdapterError,
  GitAdapterErrorCode,
  GitCommandCategory,
  GitRequest,
  GitResult,
  GitRunnerPort,
  GitRunnerRequest,
} from './types';
import { buildIsolatedArgs, buildIsolatedEnv } from './isolation';
import { getCommandCategory, validateWhitelist } from './whitelist';

export interface GitAdapterConfig {
  gitBinary?: string;
  defaultTimeout?: number;
  defaultIdleTimeout?: number;
  maxOutput?: number;
  /** ADR-0032 makes isolation mandatory; false is rejected. */
  isolation?: boolean;
  runner?: GitRunnerPort;
}

export class GitAdapter {
  private readonly gitBinary: string;
  private readonly defaultTimeout: number;
  private readonly defaultIdleTimeout: number;
  private readonly maxOutput: number;
  private readonly runner?: GitRunnerPort;

  constructor(config: GitAdapterConfig = {}) {
    if (config.isolation === false) {
      throw new GitAdapterError(
        GitAdapterErrorCode.ISOLATION_REQUIRED,
        'Git isolation cannot be disabled (ADR-0032/C20)',
      );
    }
    this.gitBinary = config.gitBinary ?? 'git';
    this.defaultTimeout = config.defaultTimeout ?? 30_000;
    this.defaultIdleTimeout = config.defaultIdleTimeout ?? 15_000;
    this.maxOutput = config.maxOutput ?? 10 * 1024 * 1024;
    this.runner = config.runner;
  }

  async execute(request: GitRequest): Promise<GitResult> {
    const prepared = this.prepare(request);
    if (!this.runner) {
      throw new GitAdapterError(
        GitAdapterErrorCode.RUNNER_UNAVAILABLE,
        'Git execution requires an injected contained Runner',
      );
    }
    if (prepared.approvalLevel === 'workspace_write' && !request.approval) {
      throw new GitAdapterError(
        GitAdapterErrorCode.APPROVAL_REQUIRED,
        `Git ${request.command} requires an exact workspace-write approval binding`,
      );
    }
    const result = await this.runner.execute({
      ...prepared,
      ...(request.approval ? { approval: request.approval } : {}),
    });

    return {
      status: result.status,
      exitCode: result.exitCode,
      stdout: result.stdout.text,
      stderr: result.stderr.text,
      command: request.command,
      timedOut: result.status === 'timeout',
      truncated: result.stdout.truncated || result.stderr.truncated,
      durationMs: result.durationMs,
      ...(result.error ? { error: result.error } : {}),
    };
  }

  /**
   * Build the exact Runner request used for preview hashing and approval. This
   * method performs no process execution and intentionally omits the approval
   * object itself from the execution fingerprint.
   */
  prepare(request: GitRequest): GitRunnerRequest {
    const whitelist = validateWhitelist(request);
    if (!whitelist.allowed || !whitelist.commandDef) {
      throw new GitAdapterError(
        GitAdapterErrorCode.COMMAND_DENIED,
        `Git command denied: ${whitelist.reason ?? 'not allowed'}`,
      );
    }
    const unsafeAttributes = findUnsafeRepositoryAttributes(request.workDir);
    if (unsafeAttributes) {
      throw new GitAdapterError(
        GitAdapterErrorCode.COMMAND_DENIED,
        'Git repository attributes contain filter/diff external-command bindings; refusing execution because Win7 Git cannot disable repository-local attributes safely',
      );
    }
    const category = whitelist.commandDef.category;
    return {
      command: this.gitBinary,
      args: [...buildIsolatedArgs([]), request.command, ...request.args],
      config: {
        timeoutMs: request.timeout ?? this.defaultTimeout,
        idleTimeoutMs: Math.min(request.timeout ?? this.defaultTimeout, this.defaultIdleTimeout),
        maxStdoutBytes: this.maxOutput,
        maxStderrBytes: this.maxOutput,
        workDir: request.workDir,
        envOverlay: buildIsolatedEnv(),
        stdinPolicy: 'closed',
      },
      approvalLevel: category === GitCommandCategory.WRITE
        ? 'workspace_write'
        : 'read_only',
    };
  }

  getCommandCategory(
    command: string,
    subcommand?: string,
  ): GitCommandCategory | undefined {
    return getCommandCategory(command, subcommand);
  }
}

/**
 * Repository-local .gitattributes and info/attributes are read after the
 * command-line configuration is applied. A wildcard `-c filter.*=...` is not
 * a reliable cross-version disable switch, so fail closed when an attribute
 * can select a filter or textconv command. This is deliberately conservative:
 * repositories using those features are routed to the documented read-only /
 * remote fallback until a stronger Git containment profile is available.
 */
function findUnsafeRepositoryAttributes(workDir: string): boolean {
  const candidates = [
    path.join(workDir, '.gitattributes'),
    path.join(workDir, '.git', 'info', 'attributes'),
  ];
  return candidates.some((candidate) => {
    try {
      if (!fs.existsSync(candidate)) return false;
      const text = fs.readFileSync(candidate, 'utf8');
      return /(^|\s)[+-]?(?:filter|diff)(?:=|\s|$)/m.test(text);
    } catch {
      // An unreadable attributes file is itself unsafe to evaluate.
      return true;
    }
  });
}
