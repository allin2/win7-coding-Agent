import {
  buildIsolatedArgs,
  buildIsolatedEnv,
  getIsolationConfig,
} from '../src/isolation';

describe('Git isolation profile', () => {
  it('strips inherited Git/SSH execution variables and disables prompts', () => {
    const env = buildIsolatedEnv({
      PATH: 'C:\\mingit\\cmd',
      GIT_SSH_COMMAND: 'malware.exe',
      SSH_AUTH_SOCK: 'socket',
      SAFE_VALUE: 'kept',
    });

    expect(env.GIT_SSH_COMMAND).toBeUndefined();
    expect(env.SSH_AUTH_SOCK).toBeUndefined();
    expect(env.SAFE_VALUE).toBe('kept');
    expect(env).toMatchObject({
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_ATTR_NOSYSTEM: '1',
      GIT_TERMINAL_PROMPT: '0',
      GIT_ASKPASS: 'false',
      SSH_ASKPASS: 'false',
      GIT_PAGER: '',
      GIT_EDITOR: 'false',
    });
  });

  it('places no-pager and isolation config before caller arguments', () => {
    const args = buildIsolatedArgs(['status', '--porcelain']);
    expect(args[0]).toBe('--no-pager');
    expect(args.indexOf('-c')).toBeGreaterThan(0);
    expect(args.indexOf('status')).toBeGreaterThan(args.lastIndexOf('-c'));
  });

  it('covers hooks, credentials, external diff, fsmonitor, SSH and protocol', () => {
    const config = new Map(getIsolationConfig());
    expect(config.get('core.hooksPath')).toBeTruthy();
    expect(config.get('credential.helper')).toBe('');
    expect(config.get('credential.interactive')).toBe('never');
    expect(config.get('diff.external')).toBe('');
    expect(config.get('core.fsmonitor')).toBe('');
    expect(config.get('core.sshCommand')).toBe('false');
    expect(config.get('protocol.allow')).toBe('never');
  });
});
