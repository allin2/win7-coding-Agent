import { GitAdapter } from './adapter';
import {
  GitAdapterError,
  GitAdapterErrorCode,
  GitApprovalBinding,
  GitRequest,
  GitResult,
  GitSessionBaseline,
  GitSessionInspection,
  GitTrackedRollbackResult,
} from './types';

/**
 * Git-backed session safety net. It never starts processes itself and never
 * deletes untracked files. All execution remains behind GitAdapter + Runner.
 */
export class GitSessionGuard {
  constructor(private readonly adapter: GitAdapter) {}

  async begin(sessionId: string, workDir: string): Promise<GitSessionBaseline> {
    if (!sessionId || !workDir) {
      throw new GitAdapterError(
        GitAdapterErrorCode.SESSION_BASELINE_INVALID,
        'Git session baseline requires sessionId and an absolute workDir',
      );
    }
    const status = await this.readStatus(workDir);
    if (status.stdout.length > 0) {
      throw new GitAdapterError(
        GitAdapterErrorCode.WORKTREE_DIRTY,
        'Agent session requires a clean Git worktree; preserve or commit existing user changes first',
      );
    }
    const headResult = await this.adapter.execute({
      command: 'rev-parse',
      args: ['--verify', 'HEAD'],
      workDir,
    });
    assertSucceeded(headResult, 'capture Git HEAD');
    const head = headResult.stdout.trim().toLowerCase();
    if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(head)) {
      throw new GitAdapterError(
        GitAdapterErrorCode.SESSION_BASELINE_INVALID,
        'Git HEAD did not resolve to a reviewed 40- or 64-character object id',
      );
    }
    return { schemaVersion: '1.0', sessionId, workDir, head };
  }

  async inspect(baseline: GitSessionBaseline): Promise<GitSessionInspection> {
    validateBaseline(baseline);
    const status = await this.readStatus(baseline.workDir);
    const diff = await this.adapter.execute({
      command: 'diff',
      args: ['--binary', baseline.head, '--'],
      workDir: baseline.workDir,
    });
    assertSucceeded(diff, 'render session diff');
    const untrackedPaths = parseUntrackedPaths(status.stdout);
    return {
      schemaVersion: '1.0',
      baseline: { ...baseline },
      clean: status.stdout.length === 0,
      statusPorcelain: status.stdout,
      diffBinary: diff.stdout,
      untrackedPaths,
      truncated: status.truncated || diff.truncated,
    };
  }

  prepareTrackedRollback(baseline: GitSessionBaseline): GitRequest {
    validateBaseline(baseline);
    return {
      command: 'restore',
      args: ['--source', baseline.head, '--staged', '--worktree', '--', '.'],
      workDir: baseline.workDir,
    };
  }

  async rollbackTracked(
    baseline: GitSessionBaseline,
    approval: GitApprovalBinding,
  ): Promise<GitTrackedRollbackResult> {
    const request = { ...this.prepareTrackedRollback(baseline), approval };
    const restore = await this.adapter.execute(request);
    assertSucceeded(restore, 'restore tracked session changes');
    const inspection = await this.inspect(baseline);
    const complete = inspection.clean;
    return {
      schemaVersion: '1.0',
      restoredTrackedFiles: true,
      complete,
      inspection,
      ...(!complete
        ? {
          warning: inspection.untrackedPaths.length > 0
            ? 'Tracked changes were restored; untracked files remain and require a separate explicit deletion approval.'
            : 'Tracked restore completed but the worktree still differs from the session baseline.',
        }
        : {}),
    };
  }

  private async readStatus(workDir: string): Promise<GitResult> {
    const status = await this.adapter.execute({
      command: 'status',
      args: ['--porcelain=v1', '-z', '--untracked-files=all'],
      workDir,
    });
    assertSucceeded(status, 'inspect Git worktree');
    return status;
  }
}

function validateBaseline(baseline: GitSessionBaseline): void {
  if (
    baseline?.schemaVersion !== '1.0' ||
    !baseline.sessionId ||
    !baseline.workDir ||
    !/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(baseline.head)
  ) {
    throw new GitAdapterError(
      GitAdapterErrorCode.SESSION_BASELINE_INVALID,
      'Git session baseline is malformed',
    );
  }
}

function assertSucceeded(result: GitResult, action: string): void {
  if (result.status !== 'exited' || result.exitCode !== 0 || result.truncated) {
    throw new GitAdapterError(
      GitAdapterErrorCode.SESSION_OPERATION_FAILED,
      `Unable to ${action}: status=${result.status}, exitCode=${String(result.exitCode)}, truncated=${String(result.truncated)}`,
    );
  }
}

function parseUntrackedPaths(status: string): string[] {
  return status.split('\0')
    .filter((entry) => entry.startsWith('?? '))
    .map((entry) => entry.slice(3))
    .filter((entry) => entry.length > 0);
}
