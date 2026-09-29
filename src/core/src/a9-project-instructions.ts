import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export type ProjectInstructionStatus = 'loaded' | 'absent' | 'too_large' | 'decode_error' | 'secret_blocked' | 'outside';
export interface ProjectInstructionResult {
  status: ProjectInstructionStatus;
  bytes: number;
  sha256?: string;
  content?: string;
}

const MAX_PROJECT_INSTRUCTION_BYTES = 32 * 1024;

export function loadProjectInstructions(
  workspaceRoot: string,
  options: { containsSensitiveData: (value: string | Buffer) => boolean },
): ProjectInstructionResult {
  const target = path.join(workspaceRoot, 'AGENTS.md');
  let link: fs.Stats;
  try {
    link = fs.lstatSync(target);
  } catch (error) {
    return { status: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'absent' : 'decode_error', bytes: 0 };
  }
  let realRoot: string;
  let realTarget: string;
  try {
    realRoot = fs.realpathSync(workspaceRoot);
    realTarget = fs.realpathSync(target);
  } catch (_error) {
    return { status: link.isSymbolicLink() ? 'outside' : 'decode_error', bytes: 0 };
  }
  const relative = path.relative(realRoot, realTarget);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return { status: 'outside', bytes: 0 };
  }
  let stat: fs.Stats;
  try { stat = fs.statSync(realTarget); } catch (_error) { return { status: 'decode_error', bytes: 0 }; }
  if (!stat.isFile()) return { status: 'decode_error', bytes: 0 };
  if (stat.size > MAX_PROJECT_INSTRUCTION_BYTES) return { status: 'too_large', bytes: stat.size };
  let raw: Buffer;
  try { raw = fs.readFileSync(realTarget); } catch (_error) { return { status: 'decode_error', bytes: stat.size }; }
  if (raw.length > MAX_PROJECT_INSTRUCTION_BYTES) return { status: 'too_large', bytes: raw.length };
  const sha256 = crypto.createHash('sha256').update(raw).digest('hex');
  let content: string;
  try { content = new TextDecoder('utf-8', { fatal: true }).decode(raw).replace(/^\uFEFF/, ''); }
  catch (_error) { return { status: 'decode_error', bytes: raw.length, sha256 }; }
  if (options.containsSensitiveData(raw) || options.containsSensitiveData(content)) {
    return { status: 'secret_blocked', bytes: raw.length, sha256 };
  }
  return { status: 'loaded', bytes: raw.length, sha256, content };
}
