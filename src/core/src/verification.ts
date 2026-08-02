import * as crypto from 'crypto';

export interface VerificationRequirement {
  checkId: string;
  description: string;
}

/** Trusted, request-side completion contract. Model output may suggest checks,
 * but cannot alter this contract. */
export interface TaskAcceptance {
  schemaVersion: '1.0';
  checks: VerificationRequirement[];
}

export interface VerificationEvidence {
  checkId: string;
  status: 'passed' | 'failed' | 'unavailable';
  complete: boolean;
  summary: string;
  source: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface EvidenceBundle {
  schemaVersion: '1.0';
  taskId: string;
  runId: string;
  createdAt: string;
  passed: boolean;
  requirements: VerificationRequirement[];
  evidence: VerificationEvidence[];
  failures: string[];
  /** Stable check IDs that failed, suitable for bounded repair accounting. */
  failedCheckIds: string[];
  digestSha256: string;
}

export class VerificationGate {
  constructor(private readonly now: () => Date = () => new Date()) {}

  evaluate(
    taskId: string,
    runId: string,
    requirements: readonly VerificationRequirement[],
    evidence: readonly VerificationEvidence[],
  ): EvidenceBundle {
    const failures: string[] = [];
    const failedCheckIds = new Set<string>();
    if (requirements.length === 0) {
      failures.push('No verification requirements were declared');
      failedCheckIds.add('__acceptance__');
    }
    const requirementIds = new Set<string>();
    for (const requirement of requirements) {
      if (!requirement.checkId || requirementIds.has(requirement.checkId)) {
        failures.push(`Invalid or duplicate requirement: ${requirement.checkId}`);
        failedCheckIds.add(requirement.checkId || '__acceptance__');
      }
      requirementIds.add(requirement.checkId);
    }
    const evidenceById = new Map<string, VerificationEvidence[]>();
    for (const item of evidence) {
      const existing = evidenceById.get(item.checkId) ?? [];
      existing.push(item);
      evidenceById.set(item.checkId, existing);
    }
    for (const requirement of requirements) {
      const matches = evidenceById.get(requirement.checkId) ?? [];
      if (matches.length !== 1) {
        failures.push(
          matches.length === 0
            ? `Missing evidence: ${requirement.checkId}`
            : `Duplicate evidence: ${requirement.checkId}`,
        );
        failedCheckIds.add(requirement.checkId);
        continue;
      }
      const item = matches[0];
      if (item.status !== 'passed') {
        failures.push(`Verification ${requirement.checkId} is ${item.status}`);
        failedCheckIds.add(requirement.checkId);
      }
      if (!item.complete) {
        failures.push(`Verification ${requirement.checkId} is incomplete or truncated`);
        failedCheckIds.add(requirement.checkId);
      }
    }

    const bundleWithoutDigest = {
      schemaVersion: '1.0' as const,
      taskId,
      runId,
      createdAt: this.now().toISOString(),
      passed: failures.length === 0,
      requirements: requirements.map((item) => ({ ...item })),
      evidence: evidence.map((item) => ({
        ...item,
        ...(item.details ? { details: { ...item.details } } : {}),
      })),
      failures,
      failedCheckIds: Array.from(failedCheckIds).sort(),
    };
    return {
      ...bundleWithoutDigest,
      digestSha256: crypto
        .createHash('sha256')
        .update(JSON.stringify(bundleWithoutDigest), 'utf8')
        .digest('hex'),
    };
  }
}
