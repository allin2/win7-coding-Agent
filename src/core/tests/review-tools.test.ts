import { ApprovalLevel, PolicyEngine, PolicyVerdict } from '../src';
import { ToolRegistry } from '../src/tools';
import { registerReviewTools, reviewToolSpecs } from '../src/review-tools';

describe('A8 Review staging tool contract', () => {
  it('publishes a bounded read-only structured proposal tool', () => {
    expect(reviewToolSpecs().map((spec) => spec.name)).toEqual(['workspace.review_prepare']);
    const registry = new ToolRegistry();
    registerReviewTools(registry);
    const call = registry.normalizeCall({
      id: 'review-prepare-1',
      toolName: 'workspace.review_prepare',
      args: { proposalsJson: '[]' },
      approvalLevel: ApprovalLevel.READ_ONLY,
    });
    expect(call.args).toEqual({ proposalsJson: '[]' });
  });

  it('allows only the policy-listed read-only staging seam', () => {
    const policy = new PolicyEngine();
    const decision = policy.evaluate({
      id: 'review-prepare-1',
      toolName: 'workspace.review_prepare',
      args: { proposalsJson: '[]' },
      approvalLevel: ApprovalLevel.READ_ONLY,
    }, undefined, 'session-1', 'workspace.read');
    expect(decision).toMatchObject({ verdict: PolicyVerdict.ALLOW, allowed: true });
  });
});
