/**
 * @module sse-parser
 * @description OpenAI-compatible SSE 流解析（A9-04）
 *
 * 合同：处理跨 chunk 拆分的行；处理末尾无换行的残余 buffer；正确识别
 * [DONE]；畸形完整事件返回结构化错误而不是静默忽略。
 */

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

export class SseParser {
  private buffer = '';
  private sawDone = false;
  /** 畸形完整事件（结构化上报，不静默吞掉）。 */
  readonly malformedEvents: string[] = [];

  /** 喂入一个网络 chunk；返回 0..n 个完整解析结果。 */
  feed(chunk: Buffer | string): SseParseOutcome[] {
    this.buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    return this.drain(false);
  }

  /** 流结束时调用：处理末尾无换行的残余 buffer。 */
  finish(): SseParseOutcome[] {
    return this.drain(true);
  }

  get sawDoneMarker(): boolean {
    return this.sawDone;
  }

  private drain(final: boolean): SseParseOutcome[] {
    const outcomes: SseParseOutcome[] = [];
    const lines = this.buffer.split(/\r?\n/);
    // 最后一段可能是不完整行；只有 final 时才把它当作完整行处理。
    this.buffer = final ? '' : (lines.pop() || '');
    for (const line of lines) {
      const outcome = this.parseLine(line);
      if (outcome) outcomes.push(outcome);
    }
    if (final && this.buffer) {
      const outcome = this.parseLine(this.buffer);
      if (outcome) outcomes.push(outcome);
      this.buffer = '';
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
      this.malformedEvents.push(jsonText.slice(0, 200));
      return { kind: 'ignore' };
    }
    if (parsed === null || typeof parsed !== 'object') {
      this.malformedEvents.push(jsonText.slice(0, 200));
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
 */
export class ToolCallAccumulator {
  private readonly slots = new Map<number, { id: string; name: string; arguments: string }>();

  apply(delta: NonNullable<SseStreamEvent['toolCallDeltas']>[number]): void {
    const existing = this.slots.get(delta.index) ?? { id: `call_${delta.index}`, name: '', arguments: '' };
    if (delta.id) existing.id = delta.id;
    if (delta.functionName) existing.name += delta.functionName;
    if (delta.argumentsDelta) existing.arguments += delta.argumentsDelta;
    this.slots.set(delta.index, existing);
  }

  toArray(): Array<{ id: string; name: string; arguments: string }> {
    return Array.from(this.slots.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, value]) => ({ ...value }));
  }
}
