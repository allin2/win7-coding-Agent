import {
  createUpdatePlanToolSpec,
  normalizeUpdatePlanCall,
  WorkingMemory,
} from '../src/working-memory';
import { ApprovalLevel } from '../src/types';

describe('WorkingMemory', () => {
  it('updates only mutable fields and preserves protected constraints', () => {
    const memory = new WorkingMemory('Fix issue #42', [{
      id: 'project-policy',
      kind: 'instruction',
      content: 'Do not modify the database schema',
      priority: 10,
      protection: 'protected',
      source: 'AGENTS.md',
    }]);
    const before = memory.snapshot();
    const after = memory.update({
      expectedRevision: 0,
      plan: ['[x] reproduce', '[ ] implement'],
      currentStep: 'Implement the bounded fix',
      findings: ['Timeout is fixed at 30 seconds'],
    });

    expect(after.revision).toBe(1);
    expect(after.goal).toBe(before.goal);
    expect(after.constraints).toEqual(before.constraints);
    expect(memory.toContextItem()).toMatchObject({
      kind: 'working_memory',
      placement: 'tail',
      protection: 'protected',
    });
    expect(memory.toContextItem().content).toContain('Do not modify the database schema');
  });

  it('rejects stale revisions and attempts to submit constraint fields', () => {
    const memory = new WorkingMemory('Goal', []);
    memory.update({
      expectedRevision: 0,
      plan: ['[ ] one'],
      currentStep: 'one',
      findings: [],
    });
    expect(() => memory.update({
      expectedRevision: 0,
      plan: ['[ ] stale'],
      currentStep: 'stale',
      findings: [],
    })).toThrow('revision conflict');

    expect(() => normalizeUpdatePlanCall({
      id: 'wm-1',
      toolName: createUpdatePlanToolSpec().name,
      approvalLevel: ApprovalLevel.READ_ONLY,
      args: {
        expectedRevision: 0,
        plan: [],
        currentStep: 'try',
        findings: [],
        constraints: [],
      },
    })).toThrow('unknown:constraints');
  });
});
