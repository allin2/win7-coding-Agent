'use strict';

(function exposeGatewaySettingsPayload(root) {
  function build(input) {
    const mode = input && input.mode;
    const values = { mode };
    if (mode !== 'gateway' && mode !== 'deepseek') return values;

    values.gatewayUrl = mode === 'deepseek'
      ? 'https://api.deepseek.com'
      : String(input.gatewayUrl || '').trim();
    values.model = input.model;

    const caBundlePath = String(input.caBundlePath || '').trim();
    if (caBundlePath) values.caBundlePath = caBundlePath;

    if (input.apiKey) values.apiKey = input.apiKey;
    values.rememberApiKey = input.rememberApiKey === true;
    return values;
  }

  root.win7AgentGatewaySettingsPayload = Object.freeze({ build });
}(window));
