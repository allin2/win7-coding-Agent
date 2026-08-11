import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { findProhibitedShellHost } from './runner';
import { RunnerErrorCode } from './types';
import { StreamEncoding } from './output';

export interface ExecutableProfile {
  id: string;
  executablePath: string;
  sha256: string;
  risk: 'low' | 'high';
  outputEncoding?: StreamEncoding;
  workingDirectoryRoots: string[];
  validateArgs?: (args: readonly string[]) => boolean;
  aclPolicy?: {
    acceptanceRoot: string;
    perRunRoot: string;
    applyLowIntegrityToWorkDir: boolean;
  };
}

export interface ResolvedExecutableProfile extends ExecutableProfile {
  canonicalExecutablePath: string;
}

export class ProfileResolutionError extends Error {
  constructor(public readonly code: RunnerErrorCode, message: string) {
    super(message);
    this.name = 'ProfileResolutionError';
  }
}

/** Immutable, product-injected executable allow-list. Callers only select IDs. */
export class ExecutableProfileRegistry {
  private readonly profiles = new Map<string, Readonly<ExecutableProfile>>();

  constructor(profiles: readonly ExecutableProfile[]) {
    for (const profile of profiles) {
      if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(profile.id) || this.profiles.has(profile.id)) {
        throw new TypeError(`Invalid or duplicate executable profile id: ${profile.id}`);
      }
      if (findProhibitedShellHost(profile.id) || findProhibitedShellHost(profile.executablePath)) {
        throw new TypeError(`Shell hosts cannot be registered: ${profile.id}`);
      }
      if (!/^[a-f0-9]{64}$/.test(profile.sha256)) {
        throw new TypeError(`Profile ${profile.id} must pin a lowercase SHA-256`);
      }
      if (!isAbsolute(profile.executablePath) || profile.workingDirectoryRoots.length === 0) {
        throw new TypeError(`Profile ${profile.id} requires absolute executable and work roots`);
      }
      this.profiles.set(profile.id, Object.freeze({ ...profile }));
    }
  }

  async resolve(id: string, args: readonly string[], workDir: string): Promise<ResolvedExecutableProfile> {
    const profile = this.profiles.get(id);
    if (!profile) throw new ProfileResolutionError(RunnerErrorCode.PROFILE_NOT_FOUND, `Executable profile is not registered: ${id}`);
    if (profile.risk !== 'low') throw new ProfileResolutionError(RunnerErrorCode.PROFILE_RISK_REJECTED, `High-risk profile is not permitted locally: ${id}`);
    if (profile.validateArgs && !profile.validateArgs(args)) {
      throw new ProfileResolutionError(RunnerErrorCode.INVALID_REQUEST, `Arguments are outside profile policy: ${id}`);
    }

    let canonicalExecutablePath: string;
    let canonicalWorkDir: string;
    try {
      canonicalExecutablePath = await fs.realpath(profile.executablePath);
      canonicalWorkDir = await fs.realpath(workDir);
    } catch (error) {
      throw new ProfileResolutionError(RunnerErrorCode.PROFILE_PATH_INVALID, `Profile path resolution failed: ${String(error)}`);
    }
    const allowed = await Promise.all(profile.workingDirectoryRoots.map(async (root) => {
      try { return within(canonicalWorkDir, await fs.realpath(root)); } catch (_error) { return false; }
    }));
    if (!allowed.some(Boolean)) {
      throw new ProfileResolutionError(RunnerErrorCode.PROFILE_PATH_INVALID, `Working directory is outside profile roots: ${workDir}`);
    }
    const digest = createHash('sha256').update(await fs.readFile(canonicalExecutablePath)).digest('hex');
    if (digest !== profile.sha256) {
      throw new ProfileResolutionError(RunnerErrorCode.PROFILE_HASH_MISMATCH, `Executable hash mismatch for profile: ${id}`);
    }
    return { ...profile, canonicalExecutablePath };
  }
}

function isAbsolute(value: string): boolean {
  return path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value);
}

function within(candidate: string, root: string): boolean {
  const normalize = (value: string) => path.resolve(value).replace(/\\/g, '/').toLowerCase();
  const child = normalize(candidate);
  const parent = normalize(root).replace(/\/$/, '');
  return child === parent || child.startsWith(`${parent}/`);
}
