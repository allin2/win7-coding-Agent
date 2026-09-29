import type { A9LoopMessage } from './a9-agent-loop';

export interface ContextBudgetStats {
  budgetChars: number;
  estimatedChars: number;
  includedRounds: number;
  omittedRounds: number;
  elidedToolResults: number;
}

const estimateMessage = (message: A9LoopMessage): number => message.content.length
  + (message.toolCalls || []).reduce((sum, call) => sum + call.arguments.length, 0);

function groupRounds(messages: A9LoopMessage[]): A9LoopMessage[][] {
  const rounds: A9LoopMessage[][] = [];
  for (const message of messages) {
    if (message.role === 'user' || rounds.length === 0) rounds.push([message]);
    else rounds[rounds.length - 1].push(message);
  }
  return rounds;
}

export function assembleWithinBudget(
  messages: A9LoopMessage[],
  options: { budgetChars: number; fixedPrefixCount: number },
): { messages: A9LoopMessage[]; stats: ContextBudgetStats } {
  const prefix = messages.slice(0, options.fixedPrefixCount);
  const rounds = groupRounds(messages.slice(options.fixedPrefixCount));
  const current = rounds.pop() || [];
  const size = (items: A9LoopMessage[]) => items.reduce((sum, message) => sum + estimateMessage(message), 0);
  let estimatedChars = size(prefix) + size(current);
  const selectedCurrent = current.slice();
  let elidedToolResults = 0;
  if (estimatedChars > options.budgetChars) {
    const toolIndices = current.map((message, index) => message.role === 'tool' ? index : -1).filter((index) => index >= 0);
    for (const index of toolIndices.slice(0, -1)) {
      if (estimatedChars <= options.budgetChars) break;
      const original = selectedCurrent[index];
      const placeholder = `[较早的工具输出已省略：${original.content.length} 字符，完整输出见工具日志]`;
      if (placeholder.length >= original.content.length) continue;
      selectedCurrent[index] = { ...original, content: placeholder };
      estimatedChars -= original.content.length - placeholder.length;
      elidedToolResults += 1;
    }
  }
  const selected: A9LoopMessage[][] = [];
  let omittedRounds = 0;
  for (let index = rounds.length - 1; index >= 0; index -= 1) {
    const round = rounds[index];
    const roundSize = size(round);
    if (estimatedChars + roundSize > options.budgetChars) {
      omittedRounds = index + 1;
      break;
    }
    selected.unshift(round);
    estimatedChars += roundSize;
  }
  return {
    messages: [...prefix, ...selected.flat(), ...selectedCurrent],
    stats: {
      budgetChars: options.budgetChars,
      estimatedChars,
      includedRounds: selected.length + (current.length > 0 ? 1 : 0),
      omittedRounds,
      elidedToolResults,
    },
  };
}
