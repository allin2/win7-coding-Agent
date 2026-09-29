import * as path from 'path';
import { expandShellHostPayloads } from './git-command-policy';

export type VerificationCommandClass = 'verify' | 'neutral' | 'mutating';

export const NEUTRAL_COMMANDS = [
  'echo', 'printf', 'type', 'cat', 'dir', 'ls', 'pwd', 'cd', 'where', 'which', 'findstr', 'more', 'sort',
  'write-output', 'write-host', 'get-content', 'get-childitem', 'get-location', 'get-item',
  'select-string', 'test-path', 'measure-object', 'gc', 'gci', 'gl', 'gi', 'sls', 'measure',
] as const;
export const READ_ONLY_GIT_COMMANDS = ['status', 'diff', 'log', 'show', 'branch', 'rev-parse', 'ls-files'] as const;
export const DIRECT_VERIFICATION_COMMANDS = [
  'jest', 'vitest', 'mocha', 'pytest', 'py.test', 'tsc', 'eslint', 'msbuild', 'mvn', 'gradle', 'make',
] as const;
export const NPX_VERIFICATION_COMMANDS = ['jest', 'vitest', 'mocha', 'tsc', 'eslint'] as const;

const neutral = new Set<string>(NEUTRAL_COMMANDS);
const readOnlyGit = new Set<string>(READ_ONLY_GIT_COMMANDS);
const directVerify = new Set<string>(DIRECT_VERIFICATION_COMMANDS);
const npxVerify = new Set<string>(NPX_VERIFICATION_COMMANDS);

function splitSegments(command: string): string[] | undefined {
  const segments: string[] = [];
  let current = '';
  let quote: string | undefined;
  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];
    if (quote) {
      current += char;
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") { quote = char; current += char; continue; }
    if (char === '|' || char === ';' || char === '&') {
      if (char === '&' && command[i + 1] !== '&') return undefined;
      segments.push(current.trim());
      current = '';
      if (command[i + 1] === char) i += 1;
      continue;
    }
    current += char;
  }
  if (quote) return undefined;
  segments.push(current.trim());
  return segments.every(Boolean) ? segments : undefined;
}

function words(segment: string): string[] | undefined {
  const result: string[] = [];
  const expression = /"([^"]*)"|'([^']*)'|([^\s]+)/g;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(segment))) result.push(match[1] ?? match[2] ?? match[3]);
  return result.length > 0 ? result : undefined;
}

function executableName(value: string): string {
  return path.win32.basename(path.posix.basename(value)).toLowerCase().replace(/\.exe$/, '').replace(/\.cmd$/, '');
}

function classifySegment(segment: string): VerificationCommandClass {
  const args = words(segment);
  if (!args) return 'mutating';
  const command = executableName(args[0]);
  const rest = args.slice(1).map((arg) => arg.toLowerCase());
  if (rest.length === 1 && ['-v', '--version', '-h', '--help'].includes(rest[0])) return 'neutral';
  if (neutral.has(command)) return 'neutral';
  if (command === 'git') return rest.length > 0 && readOnlyGit.has(rest[0]) ? 'neutral' : 'mutating';
  if (command === 'npm') return rest[0] === 'test' || rest[0] === 't' || (rest[0] === 'run' && rest.length >= 2) ? 'verify' : 'mutating';
  if (command === 'yarn' || command === 'pnpm') return rest[0] === 'test' || (rest[0] === 'run' && rest.length >= 2) ? 'verify' : 'mutating';
  if (command === 'npx') return rest.length > 0 && npxVerify.has(executableName(rest[0])) ? 'verify' : 'mutating';
  if (directVerify.has(command)) return 'verify';
  if (command === 'dotnet') return ['build', 'test'].includes(rest[0]) ? 'verify' : 'mutating';
  if (command === 'cargo') return ['build', 'test', 'check'].includes(rest[0]) ? 'verify' : 'mutating';
  if (command === 'go') return ['build', 'test', 'vet'].includes(rest[0]) ? 'verify' : 'mutating';
  if (['node', 'python', 'python3', 'py'].includes(command)) {
    return rest[0] && !rest[0].startsWith('-') && /\.(?:[cm]?js|py)$/i.test(rest[0]) ? 'verify' : 'mutating';
  }
  return 'mutating';
}

export function classifyShellCommandForVerification(command: string): VerificationCommandClass {
  const payload = expandShellHostPayloads(command);
  if (payload === undefined) return 'mutating';
  const segments = splitSegments(payload);
  if (!segments) return 'mutating';
  const classes = segments.map(classifySegment);
  if (classes.includes('mutating')) return 'mutating';
  return classes.includes('verify') ? 'verify' : 'neutral';
}
