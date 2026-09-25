/**
 * @module sse-parser
 * @description OpenAI-compatible SSE 流解析（A9-04；A9-21 M2 输出上限）
 *
 * 合同：处理跨 chunk 拆分的行；处理末尾无换行的残余 buffer；正确识别
 * [DONE]；畸形完整事件返回结构化错误而不是静默忽略。
 *
 * A9-21 M2：
 * - G-5 待处理行缓冲超过 2 MiB 时结构化失败；换行查找只扫描新数据。
 * - G-6 畸形事件样本最多 20 条，另计总数。
 * - G-4 工具调用参数/函数名/槽位上限，超限标记 truncated 或整体溢出。
 */

import { StringDecoder } from 'string_decoder';
import { ErrorCode, GatewayError } from '../types';

export interface SseStreamEvent {
  content: string | null;
  toolCallDeltas?: Array<{
    index: number;
    id?: string;
    functionName?: string;
    argumentsDelta?: string;
  }>;
  finishReason?: string;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
}

export type SseParseOutcome =
  | { kind: 'event'; event: SseStreamEvent }
  | { kind: 'done' }
  | { kind: 'ignore' };

/** G-5：尚未遇到换行的待处理数据上限（UTF-8 字节近似按 JS 字符数计，SSE 行以文本为主）。 */
export const MAX_PENDING_LINE_CHARS = 2 * 1024 * 1024;
/** G-6：畸形事件样本保留上限；总数另计。 */
export const MAX_MALFORMED_SAMPLES = 20;
/** G-4：单次调用参数 / 函数名 / 槽位上限。 */
export const MAX_TOOL_CALL_ARG_BYTES = 512 * 1024;
export const MAX_TOOL_CALL_NAME_BYTES = 4 * 1024;
export const MAX_TOOL_CALL_SLOTS = 64;

export class SseParser {
  private buffer = '';
  /** 新数据起点：换行查找只扫描 [scanFrom, buffer.length)。 */
  private scanFrom = 0;
  private decoder = new StringDecoder('utf8');
  private decoderHasInput = false;
  private sawDone = false;
  /** G-6：样本（≤20）+ 总数。 */
  readonly malformedEvents: string[] = [];
  malformedEventCount = 0;

  /** 喂入一个网络 chunk；返回 0..n 个完整解析结果。 */
  feed(chunk: Buffer | string): SseParseOutcome[] {
    if (typeof chunk === 'string') {
      if (this.decoderHasInput) {
        this.buffer += this.decoder.end();
        this.decoder = new StringDecoder('utf8');
        this.decoderHasInput = false;
      }
      this.buffer += chunk;
    } else {
      this.decoderHasInput = true;
      this.buffer += this.decoder.write(chunk);
    }
    return this.drain(false);
  }

  /** 流结束时调用：处理末尾无换行的残余 buffer。 */
  finish(): SseParseOutcome[] {
    if (this.decoderHasInput) {
      this.buffer += this.decoder.end();
      this.decoder = new StringDecoder('utf8');
      this.decoderHasInput = false;
    }
    return this.drain(true);
  }

  get sawDoneMarker(): boolean {
    return this.sawDone;
  }

  private recordMalformed(jsonText: string): void {
    this.malformedEventCount += 1;
    if (this.malformedEvents.length < MAX_MALFORMED_SAMPLES) {
      this.malformedEvents.push(jsonText.slice(0, 200));
    }
  }

  private drain(final: boolean): SseParseOutcome[] {
    const outcomes: SseParseOutcome[] = [];
    for (;;) {
      // G-5：换行查找只扫新数据，不对整个缓冲区反复 split。
      let nl = -1;
      let nlWidth = 1;
      for (let i = this.scanFrom; i < this.buffer.length; i++) {
        const ch = this.buffer.charCodeAt(i);
        if (ch === 10 /* \n */) {
          nl = i;
          nlWidth = 1;
          break;
        }
        if (ch === 13 /* \r */) {
          if (i + 1 < this.buffer.length) {
            if (this.buffer.charCodeAt(i + 1) === 10) {
              nl = i;
              nlWidth = 2;
              break;
            }
            nl = i;
            nlWidth = 1;
            break;
          }
          if (final) {
            nl = i;
            nlWidth = 1;
            break;
          }
          // \r 在末尾，可能与下一 chunk 的 \n 组成 CRLF：停在这里，scanFrom 留在 \r。
          this.scanFrom = i;
          break;
        }
      }
      if (nl < 0) {
        break;
      }
      const line = this.buffer.slice(0, nl);
      this.buffer = this.buffer.slice(nl + nlWidth);
      this.scanFrom = 0;
      const outcome = this.parseLine(line);
      if (outcome) outcomes.push(outcome);
    }

    if (final && this.buffer) {
      const outcome = this.parseLine(this.buffer);
      if (outcome) outcomes.push(outcome);
      this.buffer = '';
      this.scanFrom = 0;
    }

    // G-5：待处理（尚无换行）超限 → 结构化失败，不无限增长。
    const pending = this.buffer.length;
    if (pending > MAX_PENDING_LINE_CHARS) {
      throw new GatewayError(
        ErrorCode.INVALID_FRAME,
        `SSE pending line exceeds ${MAX_PENDING_LINE_CHARS} chars without a newline; stream rejected`,
      );
    }
    return outcomes;
  }

  private parseLine(rawLine: string): SseParseOutcome | undefined {
    const line = rawLine.trim();
    if (!line || line.startsWith(':')) return { kind: 'ignore' };
    if (line === 'data: [DONE]' || line === 'data:[DONE]') {
      this.sawDone = true;
      return { kind: 'done' };
    }
    if (!line.startsWith('data:')) {
      return { kind: 'ignore' };
    }
    const jsonText = line.startsWith('data: ') ? line.slice(6) : line.slice(5);
    if (jsonText.trim().length === 0) return { kind: 'ignore' };
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (_err) {
      this.recordMalformed(jsonText);
      return { kind: 'ignore' };
    }
    if (parsed === null || typeof parsed !== 'object') {
      this.recordMalformed(jsonText);
      return { kind: 'ignore' };
    }
    const choice = (parsed as any).choices?.[0];
    if (choice === null || choice === undefined) {
      const usage = (parsed as any).usage;
      if (usage) {
        return {
          kind: 'event',
          event: { content: null, usage: mapUsage(usage) },
        };
      }
      return { kind: 'ignore' };
    }
    const delta = choice.delta ?? {};
    const toolCallDeltas = Array.isArray(delta.tool_calls)
      ? delta.tool_calls
          .filter((tc: unknown) => tc !== null && typeof tc === 'object')
          .map((tc: any, arrayIndex: number) => ({
            index: typeof tc.index === 'number' ? tc.index : arrayIndex,
            ...(tc.id ? { id: String(tc.id) } : {}),
            ...(tc.function?.name ? { functionName: String(tc.function.name) } : {}),
            ...(tc.function?.arguments !== undefined ? { argumentsDelta: String(tc.function.arguments) } : {}),
          }))
      : undefined;
    return {
      kind: 'event',
      event: {
        content: typeof delta.content === 'string' ? delta.content : null,
        ...(toolCallDeltas && toolCallDeltas.length > 0 ? { toolCallDeltas } : {}),
        ...(choice.finish_reason ? { finishReason: String(choice.finish_reason) } : {}),
        ...((parsed as any).usage ? { usage: mapUsage((parsed as any).usage) } : {}),
      },
    };
  }
}

function mapUsage(usage: any): NonNullable<SseStreamEvent['usage']> {
  return {
    ...(typeof usage.prompt_tokens === 'number' ? { promptTokens: usage.prompt_tokens } : {}),
    ...(typeof usage.completion_tokens === 'number' ? { completionTokens: usage.completion_tokens } : {}),
    ...(typeof usage.total_tokens === 'number' ? { totalTokens: usage.total_tokens } : {}),
  };
}

/**
 * 把多事件 tool_calls 增量聚合为完整调用列表（保持协议关联：id/name/args
 * 按 index 累积）。A9-21 M2 G-4：参数/函数名/槽位均有上限。
 */
export class ToolCallAccumulator {
  private readonly slots = new Map<
    number,
    { id: string; name: string; arguments: string; nameBytes: number; argsBytes: number; truncated?: boolean }
  >();
  private readonly maxArgsBytes: number;
  private readonly maxNameBytes: number;
  private readonly maxSlots: number;
  /** 槽位溢出后丢弃的调用字节下界。 */
  overflowDroppedBytes = 0;
  /** 是否发生过槽位溢出（整个响应按 tool_call_limit 截断）。 */
  slotsOverflowed = false;

  constructor(
    maxArgsBytes: number = MAX_TOOL_CALL_ARG_BYTES,
    maxNameBytes: number = MAX_TOOL_CALL_NAME_BYTES,
    maxSlots: number = MAX_TOOL_CALL_SLOTS,
  ) {
    this.maxArgsBytes = maxArgsBytes;
    this.maxNameBytes = maxNameBytes;
    this.maxSlots = maxSlots;
  }

  apply(delta: NonNullable<SseStreamEvent['toolCallDeltas']>[number]): void {
    const existing = this.slots.get(delta.index) ?? {
      id: `call_${delta.index}`,
      name: '',
      arguments: '',
      nameBytes: 0,
      argsBytes: 0,
    };

    // G-4 槽位：index 超出 [0, maxSlots) 时计入溢出，不新开槽。
    if (delta.index < 0 || delta.index >= this.maxSlots) {
      this.slotsOverflowed = true;
      this.overflowDroppedBytes += Buffer.byteLength(delta.functionName || '', 'utf8')
        + Buffer.byteLength(delta.argumentsDelta || '', 'utf8')
        + Buffer.byteLength(delta.id || '', 'utf8');
      return;
    }

    if (delta.id) existing.id = delta.id;

    if (delta.functionName) {
      const incoming = Buffer.byteLength(delta.functionName, 'utf8');
      if (existing.truncated || existing.nameBytes + incoming > this.maxNameBytes) {
        existing.truncated = true;
      } else {
        existing.name += delta.functionName;
        existing.nameBytes += incoming;
      }
    }

    if (delta.argumentsDelta) {
      const incoming = Buffer.byteLength(delta.argumentsDelta, 'utf8');
      if (existing.truncated) {
        // 已截断：不再保留，只视为丢弃。
      } else if (existing.argsBytes + incoming > this.maxArgsBytes) {
        existing.truncated = true;
      } else {
        existing.arguments += delta.argumentsDelta;
        existing.argsBytes += incoming;
      }
    }

    this.slots.set(delta.index, existing);
  }

  toArray(): Array<{ id: string; name: string; arguments: string; truncated?: boolean }> {
    return Array.from(this.slots.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, value]) => ({
        id: value.id,
        name: value.name,
        arguments: value.arguments,
        ...(value.truncated ? { truncated: true as const } : {}),
      }));
  }
}
