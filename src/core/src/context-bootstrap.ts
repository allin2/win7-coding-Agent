import { ContextItem } from './context-manager';
import { AgentsDiscoveryInput, discoverAgentsRules } from './agents-discovery';

export interface RuntimeEnvironmentSnapshot {
  cwd: string;
  targetOs: string;
  shell: string;
  date: string;
  sandboxMode: string;
  approvalMode: string;
  git: {
    available: boolean;
    repository: boolean;
    branch?: string;
    dirty?: boolean;
    detail?: string;
  };
}

export interface ContextBootstrapInput extends AgentsDiscoveryInput {
  environment: RuntimeEnvironmentSnapshot;
}

/**
 * Creates only facts the model cannot reliably discover before its first
 * action. User task and ToolSpec are added by Runtime, so README, source and
 * directory listings are intentionally absent.
 */
export function buildInitialContext(input: ContextBootstrapInput): ContextItem[] {
  validateEnvironment(input.environment);
  return [
    {
      id: 'bootstrap:environment',
      kind: 'environment',
      content: renderEnvironment(input.environment),
      priority: 20_000,
      protection: 'protected',
      placement: 'stable_prefix',
      source: 'runtime_environment',
    },
    ...discoverAgentsRules(input),
  ];
}

function renderEnvironment(environment: RuntimeEnvironmentSnapshot): string {
  return [
    '<environment>',
    `cwd: ${environment.cwd}`,
    `target_os: ${environment.targetOs}`,
    `shell: ${environment.shell}`,
    `date: ${environment.date}`,
    `sandbox_mode: ${environment.sandboxMode}`,
    `approval_mode: ${environment.approvalMode}`,
    `git_available: ${environment.git.available}`,
    `git_repository: ${environment.git.repository}`,
    ...(environment.git.branch ? [`git_branch: ${environment.git.branch}`] : []),
    ...(environment.git.dirty !== undefined ? [`git_dirty: ${environment.git.dirty}`] : []),
    ...(environment.git.detail ? [`git_detail: ${environment.git.detail}`] : []),
    '</environment>',
  ].join('\n');
}

function validateEnvironment(environment: RuntimeEnvironmentSnapshot): void {
  for (const [name, value] of Object.entries({
    cwd: environment.cwd,
    targetOs: environment.targetOs,
    shell: environment.shell,
    date: environment.date,
    sandboxMode: environment.sandboxMode,
    approvalMode: environment.approvalMode,
  })) {
    if (!value || value.trim().length === 0) {
      throw new Error(`Runtime environment ${name} must be non-empty`);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(environment.date)) {
    throw new Error('Runtime environment date must use YYYY-MM-DD');
  }
}
