import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

function payloadBuilder(): any {
  const source = fs.readFileSync(
    path.join(__dirname, '../../product/renderer/gateway-settings-payload.js'),
    'utf8',
  );
  const window: Record<string, unknown> = {};
  vm.runInNewContext(source, { window });
  return (window.win7AgentGatewaySettingsPayload as any).build;
}

describe('Renderer Gateway settings payload', () => {
  it('omits an empty optional CA bundle path in DeepSeek mode', () => {
    const payload = payloadBuilder()({
      mode: 'deepseek',
      gatewayUrl: 'https://ignored.example',
      model: 'deepseek-v4-flash',
      caBundlePath: '   ',
      apiKey: 'test-key',
      rememberApiKey: true,
    });

    expect(payload).toEqual({
      mode: 'deepseek',
      gatewayUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      apiKey: 'test-key',
      rememberApiKey: true,
    });
    expect(payload).not.toHaveProperty('caBundlePath');
  });

  it('preserves a non-empty CA bundle path for controlled Gateway mode', () => {
    expect(payloadBuilder()({
      mode: 'gateway',
      gatewayUrl: ' https://gateway.example/v1 ',
      model: 'deepseek-v4-flash',
      caBundlePath: ' C:\\acceptance\\ca.pem ',
    })).toMatchObject({
      mode: 'gateway',
      gatewayUrl: 'https://gateway.example/v1',
      caBundlePath: 'C:\\acceptance\\ca.pem',
    });
  });

  it('strips network and credential fields when returning to Replay', () => {
    expect(payloadBuilder()({
      mode: 'replay',
      gatewayUrl: 'https://api.deepseek.com',
      apiKey: 'test-key',
      rememberApiKey: true,
    })).toEqual({ mode: 'replay' });
  });

  it('sends an explicit false persistence intent without exposing a saved value', () => {
    expect(payloadBuilder()({
      mode: 'deepseek',
      model: 'deepseek-v4-flash',
      rememberApiKey: false,
    })).toEqual({
      mode: 'deepseek',
      gatewayUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      rememberApiKey: false,
    });
  });
});
