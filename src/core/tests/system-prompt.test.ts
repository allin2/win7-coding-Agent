import {
  A9_SYSTEM_PROMPT_VERSION,
  PermissionMode,
  buildA9SystemPrompt,
} from '../src';

describe('A9-01: System Prompt V2', () => {
  it('builds valid System Prompt contract for Full Access', () => {
    const prompt = buildA9SystemPrompt({
      mode: PermissionMode.FULL_ACCESS,
      shell: 'powershell',
    });

    expect(prompt.schemaVersion).toBe(2);
    expect(prompt.version).toBe(A9_SYSTEM_PROMPT_VERSION);
    expect(prompt.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(prompt.content).toContain('FULL ACCESS');
    expect(prompt.content).toContain('Default Shell: powershell');
    expect(prompt.content).toContain('Instruction Hierarchy');
    expect(prompt.content).toContain('AGENTS.md');
    expect(prompt.content).toContain('Honest Verification');
  });

  it('adjusts instructions based on mode', () => {
    const readOnlyPrompt = buildA9SystemPrompt({ mode: PermissionMode.READ_ONLY });
    expect(readOnlyPrompt.content).toContain('READ ONLY');
    expect(readOnlyPrompt.content).not.toContain('You are authorized to directly read, search, create, edit');

    const reviewPrompt = buildA9SystemPrompt({ mode: PermissionMode.REVIEW });
    expect(reviewPrompt.content).toContain('REVIEW');
  });
});
