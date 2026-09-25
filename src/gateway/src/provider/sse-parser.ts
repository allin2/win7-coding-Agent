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

/** G-5：尚未遇到换行的待处理数据上限（UTF-8 字节）。 */
export const MAX_PENDING_LINE_BYTES = 2 * 1024 * 1024;
/** G-6：畸形事件样本保留上限；总数另计。 */
export const MAX_MALFORMED_SAMPLES = 20;
/** G-4：单次调用参数 / 函数名 / 槽位上限。 */
export const MAX_TOOL_CALL_ARG_BYTES = 512 * 1024;
export const MAX_TOOL_CALL_NAME_BYTES = 4 * 1024;
export const MAX_TOOL_CALL_SLOTS = 64;

export class SseParser {
  /**
   * 未完成行的分段（A9-21 M2 R-1）：只在新到达文本上 indexOf('\\n')，
   * 找到时才 join 分段成行；避免 buffer += 大串后反复下标扫描。
   * 行切分语义与基线 split(/\\r?\\n/) 一致：\\n 与 \\r\\n 结束一行，单独 \\r 留在行内。
   */
  private lineSegs: string[] = [];
  /** 当前未完成行的 UTF-8 字节累计（每段只计一次）。 */
  private pendingBytes = 0;
  private decoder = new StringDecoder('utf8');
  private decoderHasInput = false;
  private sawDone = false;
  /** G-6：样本（≤20）+ 总数。 */
  readonly malformedEvents: string[] = [];
  malformedEventCount = 0;
  /** drain 收集 pushText 期间产生的完整行（feed/finish 统一出口）。 */
  private pendingOutcomes: SseParseOutcome[] = [];

  /** 喂入一个网络 chunk；返回 0..n 个完整解析结果。 */
  feed(chunk: Buffer | string): SseParseOutcome[] {
    if (typeof chunk === 'string') {
      // String input is already decoded (primarily tests/adapters). Close any
      // preceding byte stream explicitly before switching representations.
      if (this.decoderHasInput) {
        this.pushText(this.decoder.end());
        this.decoder = new StringDecoder('utf8');
        this.decoderHasInput = false;
      }
      this.pushText(chunk);
    } else {
      this.decoderHasInput = true;
      this.pushText(this.decoder.write(chunk));
    }
    return this.drain(false);
  }

  /** 流结束时调用：处理末尾无换行的残余 buffer。 */
  finish(): SseParseOutcome[] {
    if (this.decoderHasInput) {
      this.pushText(this.decoder.end());
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

  /** 只扫描新到达的文本查找换行；无换行则把段挂到未完成行上。 */
  private pushText(text: string): void {
    if (!text) return;
    let start = 0;
    for (;;) {
      const nl = text.indexOf('\n', start);
      if (nl < 0) {
        const rest = text.slice(start);
        if (rest) {
          this.lineSegs.push(rest);
          this.pendingBytes += Buffer.byteLength(rest, 'utf8');
        }
        break;
      }
      this.lineSegs.push(text.slice(start, nl));
      let line = this.lineSegs.join('');
      this.lineSegs = [];
      this.pendingBytes = 0;
      // \r\n 行结束时去掉紧邻的 \r；单独的 \r 保留在行内（与 split(/\r?\n/) 一致）。
      if (line.endsWith('\r')) line = line.slice(0, -1);
      const outcome = this.parseLine(line);
      if (outcome) this.pendingOutcomes.push(outcome);
      start = nl + 1;
    }
    if (this.pendingBytes > MAX_PENDING_LINE_BYTES) {
      throw new GatewayError(
        ErrorCode.INVALID_FRAME,
        `SSE pending line exceeds ${MAX_PENDING_LINE_BYTES} bytes without a newline; stream rejected`,
      );
    }
  }

  private drain(final: boolean): SseParseOutcome[] {
    const outcomes = this.pendingOutcomes;
    this.pendingOutcomes = [];
    if (final) {
      // 最后一段可能是不完整行；只有 final 时才把它当作完整行处理。
      if (this.lineSegs.length > 0) {
        const line = this.lineSegs.join('');
        this.lineSegs = [];
        this.pendingBytes = 0;
        const outcome = this.parseLine(line);
        if (outcome) outcomes.push(outcome);
      }
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
      // SSE 规范外的字段（event:/id:/retry:）不参与数据流。
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
      // 无 choices 的合法事件（如仅 usage）也允许。
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
 * 按 index 累积，顺序执行也不丢失与 assistant 消息的对应）。
 * A9-21 M2 G-4：参数/函数名/槽位均有上限。
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
