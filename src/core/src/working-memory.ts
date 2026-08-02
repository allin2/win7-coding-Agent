import * as crypto from 'crypto';

import { ContextItem } from './context-manager';
import { ToolRegistry, ToolSpec } from './tools';
import { ApprovalLevel, ToolCall } from './types';

export const UPDATE_PLAN_TOOL_NAME = 'agent.update_plan';

export interface WorkingMemoryConstraint {
  id: string;
  source: string;
  digestSha256: string;
  recap: string;
}

export interface WorkingMemorySnapshot {
  schemaVersion: '1.0';
  revision: number;
  goal: string;
  constraints: WorkingMemoryConstraint[];
  plan: string[];
  currentStep: string;
  findings: string[];
}

export interface WorkingMemoryUpdate {
  expectedRevision: number;
  plan: string[];
  currentStep: string;
  findings: string[];
}

export class WorkingMemory {
  private revision = 0;
  private plan: string[] = [];
  private currentStep = 'Inspect the task and choose the next bounded action.';
  private findings: string[] = [];
  private readonly constraints: WorkingMemoryConstraint[];

  constructor(
    private readonly goal: string,
    protectedItems: readonly ContextItem[],
    restored?: WorkingMemorySnapshot,
  ) {
    if (!goal.trim()) throw new Error('Working memory goal must be non-empty');
    this.constraints = protectedItems.map((item) => ({
      id: item.id,
      source: item.source ?? item.kind,
      digestSha256: sha256(item.content),
      recap: boundedRecap(item.content),
    }));
    if (restored) {
      if (restored.schemaVersion !== '1.0' || restored.goal !== goal) {
        throw new Error('Working memory snapshot does not match the current goal');
      }
      const expectedConstraintDigest = sha256(JSON.stringify(this.constraints));
      const restoredConstraintDigest = sha256(JSON.stringify(restored.constraints));
      if (expectedConstraintDigest !== restoredConstraintDigest) {
        throw new Error('Working memory protected constraints changed');
      }
      this.revision = restored.revision;
      this.plan = [...restored.plan];
      this.currentStep = restored.currentStep;
      this.findings = [...restored.findings];
    }
  }

  snapshot(): WorkingMemorySnapshot {
    return {
      schemaVersion: '1.0',
      revision: this.revision,
      goal: this.goal,
      constraints: this.constraints.map((constraint) => ({ ...constraint })),
      plan: [...this.plan],
      currentStep: this.currentStep,
      findings: [...this.findings],
    };
  }

  update(input: WorkingMemoryUpdate): WorkingMemorySnapshot {
    if (input.expectedRevision !== this.revision) {
      throw new Error(
        `Working memory revision conflict: expected ${this.revision}, received ${input.expectedRevision}`,
      );
    }
    validateLines(input.plan, 'plan', 64);
    validateLines(input.findings, 'findings', 64);
    if (!input.currentStep.trim() || input.currentStep.length > 1_000) {
      throw new Error('Working memory currentStep must be 1..1000 characters');
    }
    this.plan = [...input.plan];
    this.currentStep = input.currentStep;
    this.findings = [...input.findings];
    this.revision += 1;
    return this.snapshot();
  }

  toContextItem(): ContextItem {
    return {
      id: 'runtime:working-memory',
      kind: 'working_memory',
      content: renderWorkingMemory(this.snapshot()),
      priority: 30_000,
      protection: 'protected',
      placement: 'tail',
      source: 'runtime_working_memory',
    };
  }
}

export function createUpdatePlanToolSpec(): ToolSpec {
  return {
    schemaVersion: '2.0',
    name: UPDATE_PLAN_TOOL_NAME,
    description: 'Replace mutable plan, current step, and findings. Goal and constraints are immutable.',
    approvalLevel: ApprovalLevel.READ_ONLY,
    capability: 'agent_control.update_plan',
    inputSchema: {
      properties: {
        expectedRevision: {
          type: 'number',
          description: 'Current working-memory revision shown in tail context.',
          minimum: 0,
        },
        plan: {
          type: 'string[]',
          description: 'Complete ordered plan with explicit completed and pending markers.',
        },
        currentStep: {
          type: 'string',
          description: 'The single bounded action currently being performed.',
        },
        findings: {
          type: 'string[]',
          description: 'Concise durable discoveries required by later steps.',
        },
      },
      required: ['expectedRevision', 'plan', 'currentStep', 'findings'],
      additionalProperties: false,
    },
  };
}

export function normalizeUpdatePlanCall(call: ToolCall): ToolCall {
  const registry = new ToolRegistry();
  registry.register(createUpdatePlanToolSpec());
  return registry.normalizeCall(call);
}

function renderWorkingMemory(snapshot: WorkingMemorySnapshot): string {
  return [
    `<working_memory revision="${snapshot.revision}">`,
    `goal: ${snapshot.goal}`,
    'constraints:',
    ...snapshot.constraints.map((constraint) =>
      `- [protected:${constraint.id}:${constraint.digestSha256}] ${constraint.recap}`),
    'plan:',
    ...(snapshot.plan.length > 0 ? snapshot.plan.map((item) => `- ${item}`) : ['- [ ] Create a plan']),
    `current_step: ${snapshot.currentStep}`,
    'findings:',
    ...(snapshot.findings.length > 0 ? snapshot.findings.map((item) => `- ${item}`) : ['- none']),
    '</working_memory>',
  ].join('\n');
}

function validateLines(lines: readonly string[], name: string, maxItems: number): void {
  if (lines.length > maxItems) throw new Error(`Working memory ${name} exceeds ${maxItems} items`);
  for (const line of lines) {
    if (!line.trim() || line.length > 1_000) {
      throw new Error(`Working memory ${name} entries must be 1..1000 characters`);
    }
  }
}

function boundedRecap(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  return normalized.length <= 240 ? normalized : `${normalized.slice(0, 237)}...`;
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}
