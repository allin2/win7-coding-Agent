import * as crypto from 'crypto';
import { estimateContextTokens, TokenEstimateSource } from './token-estimator';

export type ContextItemKind =
  | 'environment'
  | 'instruction'
  | 'task'
  | 'workspace'
  | 'history'
  | 'tool_result'
  | 'working_memory';

/** Protected context is immutable from the model's point of view. */
export type ContextProtection = 'protected' | 'normal';
export type ContextPlacement = 'stable_prefix' | 'rolling' | 'tail';

export interface ContextItem {
  id: string;
  kind: ContextItemKind;
  content: string;
  priority: number;
  estimatedTokens?: number;
  protection?: ContextProtection;
  placement?: ContextPlacement;
  source?: string;
}

export interface ContextBudget {
  maxTokens: number;
  maxItems: number;
  maxChars: number;
  /** Model context window, when known. 75% is the default compaction waterline. */
  modelWindowTokens?: number;
  highWatermarkPercent?: number;
  outputReservePercent?: number;
}

export interface ContextBuildMetadata {
  systemPromptVersion?: string;
  toolCatalogDigestSha256?: string;
}

export interface ContextManifestEntry {
  id: string;
  kind: ContextItemKind;
  chars: number;
  estimatedTokens: number;
  tokenEstimateSource: TokenEstimateSource;
  priority: number;
  contentSha256: string;
  protection: ContextProtection;
  placement: ContextPlacement;
  source?: string;
}

export interface ContextOmission extends ContextManifestEntry {
  reason: 'item_limit' | 'token_limit' | 'character_limit';
}

export interface ContextManifest {
  schemaVersion: '2.0';
  budget: ContextBudget;
  included: ContextManifestEntry[];
  omitted: ContextOmission[];
  usedTokens: number;
  usedChars: number;
  /** The point at which compaction should be requested, never output capacity. */
  highWatermarkTokens: number;
  outputReserveTokens: number;
  watermarkExceeded: boolean;
  truncated: boolean;
  systemPromptVersion?: string;
  toolCatalogDigestSha256?: string;
  digestSha256: string;
}

export interface BuiltContext {
  manifest: ContextManifest;
  items: ContextItem[];
}

/** A protected rule must never be silently omitted to make room for history. */
export class ContextProtectedBudgetError extends Error {
  constructor(readonly itemId: string, readonly reason: ContextOmission['reason']) {
    super(`Protected context item cannot fit: ${itemId} (${reason})`);
    this.name = 'ContextProtectedBudgetError';
  }
}

/**
 * Deterministic, bounded context selection. Contents are atomic: either the
 * complete item is projected or its omission is recorded. Protected items
 * fail closed, so no model call can run without mandatory policy/rule text.
 */
export class ContextManager {
  build(
    items: readonly ContextItem[],
    budget: ContextBudget,
    metadata: ContextBuildMetadata = {},
  ): BuiltContext {
    validateBudget(budget);
    const ids = new Set<string>();
    for (const item of items) {
      if (!item.id || ids.has(item.id)) {
        throw new Error(`Context item id must be unique and non-empty: ${item.id}`);
      }
      if (!Number.isFinite(item.priority)) {
        throw new Error(`Context item priority must be finite: ${item.id}`);
      }
      ids.add(item.id);
    }

    const ordered = [...items].sort(compareItems);
    const included: ContextManifestEntry[] = [];
    const omitted: ContextOmission[] = [];
    const selected: ContextItem[] = [];
    let usedTokens = 0;
    let usedChars = 0;

    for (const item of ordered) {
      const entry = toEntry(item);
      const reason = limitReason(entry, included.length, usedTokens, usedChars, budget);
      if (reason) {
        if (entry.protection === 'protected') {
          throw new ContextProtectedBudgetError(item.id, reason);
        }
        omitted.push({ ...entry, reason });
        continue;
      }
      included.push(entry);
      selected.push({ ...item });
      usedTokens += entry.estimatedTokens;
      usedChars += entry.chars;
    }

    const highWatermarkPercent = budget.highWatermarkPercent ?? 75;
    const outputReservePercent = budget.outputReservePercent ?? 20;
    const modelWindowTokens = budget.modelWindowTokens ?? budget.maxTokens;
    const highWatermarkTokens = Math.max(1, Math.floor(modelWindowTokens * highWatermarkPercent / 100));
    const outputReserveTokens = Math.max(1, Math.ceil(modelWindowTokens * outputReservePercent / 100));
    const manifestWithoutDigest = {
      schemaVersion: '2.0' as const,
      budget: { ...budget },
      included,
      omitted,
      usedTokens,
      usedChars,
      highWatermarkTokens,
      outputReserveTokens,
      watermarkExceeded: usedTokens >= highWatermarkTokens,
      truncated: omitted.length > 0,
      ...(metadata.systemPromptVersion ? { systemPromptVersion: metadata.systemPromptVersion } : {}),
      ...(metadata.toolCatalogDigestSha256 ? { toolCatalogDigestSha256: metadata.toolCatalogDigestSha256 } : {}),
    };
    return {
      items: selected,
      manifest: {
        ...manifestWithoutDigest,
        digestSha256: sha256(canonicalJson(manifestWithoutDigest)),
      },
    };
  }
}

function compareItems(left: ContextItem, right: ContextItem): number {
  const protection = rankProtection(right.protection) - rankProtection(left.protection);
  if (protection !== 0) return protection;
  const placement = rankPlacement(left.placement) - rankPlacement(right.placement);
  if (placement !== 0) return placement;
  return right.priority - left.priority || left.id.localeCompare(right.id);
}

function rankProtection(value: ContextProtection | undefined): number {
  return value === 'protected' ? 1 : 0;
}

function rankPlacement(value: ContextPlacement | undefined): number {
  if (value === 'stable_prefix') return 0;
  if (value === 'tail') return 2;
  return 1;
}

function limitReason(entry: ContextManifestEntry, count: number, tokens: number, chars: number, budget: ContextBudget): ContextOmission['reason'] | undefined {
  if (count >= budget.maxItems) return 'item_limit';
  if (tokens + entry.estimatedTokens > budget.maxTokens) return 'token_limit';
  if (chars + entry.chars > budget.maxChars) return 'character_limit';
  return undefined;
}

function toEntry(item: ContextItem): ContextManifestEntry {
  const chars = item.content.length;
  const estimate = estimateContextTokens(item.content, item.estimatedTokens);
  return {
    id: item.id,
    kind: item.kind,
    chars,
    estimatedTokens: estimate.tokens,
    tokenEstimateSource: estimate.source,
    priority: item.priority,
    contentSha256: sha256(item.content),
    protection: item.protection ?? 'normal',
    placement: item.placement ?? 'rolling',
    ...(item.source ? { source: item.source } : {}),
  };
}

function validateBudget(budget: ContextBudget): void {
  for (const [name, value] of Object.entries(budget)) {
    if (value !== undefined && (!Number.isInteger(value) || value < 1)) {
      throw new Error(`Context budget ${name} must be a positive integer`);
    }
  }
  const highWatermark = budget.highWatermarkPercent ?? 75;
  const reserve = budget.outputReservePercent ?? 20;
  if (highWatermark > 100 || reserve > 100 || highWatermark + reserve > 100) {
    throw new Error('Context watermark and output reserve must fit within 100 percent');
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}
