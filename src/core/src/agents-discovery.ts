import * as fs from 'fs';
import * as path from 'path';

import { ContextItem } from './context-manager';

export interface AgentsDiscoveryInput {
  repoRoot: string;
  cwd: string;
  userRulesPath?: string;
  maxCharsPerFile?: number;
  maxBytesPerFile?: number;
}

/**
 * Loads durable AGENTS rules deterministically: explicit user rules first,
 * then repository root through the current directory. Files outside repoRoot
 * are never discovered through cwd traversal.
 */
export function discoverAgentsRules(input: AgentsDiscoveryInput): ContextItem[] {
  const root = fs.realpathSync(path.resolve(input.repoRoot));
  const cwd = fs.realpathSync(path.resolve(input.cwd));
  if (cwd !== root && !cwd.startsWith(`${root}${path.sep}`)) {
    throw new Error('cwd must be inside repoRoot for AGENTS discovery');
  }
  const maxBytes = input.maxBytesPerFile ?? input.maxCharsPerFile ?? 32_768;
  const candidates = [
    ...(input.userRulesPath ? [path.resolve(input.userRulesPath)] : []),
    ...directoriesFromRoot(root, cwd).map((directory) => path.join(directory, 'AGENTS.md')),
  ];
  const seen = new Set<string>();
  return candidates.flatMap((candidate, index) => {
    const lexical = path.resolve(candidate);
    if (!fs.existsSync(lexical)) return [];
    const resolved = fs.realpathSync(lexical);
    const explicitUserRule = Boolean(input.userRulesPath) && index === 0;
    if (
      !explicitUserRule &&
      resolved !== root &&
      !resolved.startsWith(`${root}${path.sep}`)
    ) {
      throw new Error(`AGENTS rule resolves outside repoRoot: ${lexical}`);
    }
    if (seen.has(resolved)) return [];
    seen.add(resolved);
    const bytes = fs.readFileSync(resolved);
    if (bytes.length > maxBytes) {
      throw new Error(`AGENTS rule file exceeds maximum size: ${resolved}`);
    }
    const content = bytes.toString('utf8');
    const scope = explicitUserRule ? 'user' : path.dirname(resolved);
    return [{
      id: `agents:${index}:${resolved}`,
      kind: 'instruction' as const,
      content: `<rules scope="${scope}">\n${content}\n</rules>`,
      priority: 10_000 - index,
      protection: 'protected' as const,
      placement: 'stable_prefix' as const,
      source: resolved,
    }];
  });
}

function directoriesFromRoot(root: string, cwd: string): string[] {
  const relative = path.relative(root, cwd);
  if (!relative) return [root];
  const result = [root];
  let current = root;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    result.push(current);
  }
  return result;
}
