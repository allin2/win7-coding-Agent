const FORBIDDEN_ENVIRONMENT_EXACT = new Set([
  'NODE_OPTIONS', 'NODE_EXTRA_CA_CERTS', 'NODE_PATH', 'NODE_REDIRECT_WARNINGS', 'NODE_V8_COVERAGE',
  'ELECTRON_RUN_AS_NODE', 'ELECTRON_EXTRA_LAUNCH_ARGS', 'ELECTRON_NO_ASAR',
  'ELECTRON_ENABLE_LOGGING', 'ELECTRON_DISABLE_SECURITY_WARNINGS', 'ELECTRON_OVERRIDE_DIST_PATH',
  'NODE_TLS_REJECT_UNAUTHORIZED', 'SSLKEYLOGFILE', 'OPENSSL_CONF', 'OPENSSL_MODULES',
  'GIT_SSL_NO_VERIFY', 'GIT_SSL_CAINFO', 'GIT_SSL_CAPATH', 'PYTHONHTTPSVERIFY',
  'SSL_CERT_FILE', 'SSL_CERT_DIR', 'REQUESTS_CA_BUNDLE', 'CURL_CA_BUNDLE', 'AWS_CA_BUNDLE',
  'NPM_CONFIG_STRICT_SSL', 'YARN_STRICT_SSL', 'PIP_CERT', 'PIP_TRUSTED_HOST',
]);

export function isForbiddenTrustedShellEnvironmentName(name: string): boolean {
  const upper = name.toUpperCase();
  if (FORBIDDEN_ENVIRONMENT_EXACT.has(upper) || upper.startsWith('ELECTRON_') || upper.startsWith('NODE_')) return true;
  if (['API_KEY', 'APIKEY', 'ACCESS_KEY', 'ACCESSKEY', 'PRIVATE_KEY', 'PRIVATEKEY',
    'CREDENTIAL', 'AUTHORIZATION', 'PASSWORD', 'SECRET', 'TOKEN'].some((fragment) => upper.includes(fragment))) return true;
  return /(?:PROVIDER|OPENAI|ANTHROPIC|DEEPSEEK|AZURE).*KEY/.test(upper);
}

export function createTrustedShellEnvironment(
  inherited: NodeJS.ProcessEnv,
  overlay: Record<string, string>,
  sensitiveValues: readonly string[] = [],
): NodeJS.ProcessEnv {
  const safeOverlay = validateTrustedShellEnvironmentOverlay(overlay, sensitiveValues);
  const output: NodeJS.ProcessEnv = Object.create(null);
  for (const [key, value] of Object.entries(inherited)) {
    if (typeof value === 'string' && !isForbiddenTrustedShellEnvironmentName(key)
      && !containsKnownEnvironmentSecret(key, sensitiveValues)
      && !containsKnownEnvironmentSecret(value, sensitiveValues)) output[key] = value;
  }
  for (const [key, value] of Object.entries(safeOverlay)) output[key] = value;
  return output;
}

/**
 * Only non-secret workspace variables may cross the helper boundary. Values
 * are deliberately never included in errors or audit text.
 */
export function validateTrustedShellEnvironmentOverlay(
  overlay: Record<string, string>,
  sensitiveValues: readonly string[] = [],
): Record<string, string> {
  const output: Record<string, string> = Object.create(null);
  let totalCharacters = 0;
  const keys = Object.keys(overlay);
  if (keys.length > 64) throw new Error('A9_ENV_OVERLAY_REJECTED: too many entries');
  for (const key of keys) {
    const value = overlay[key];
    const upper = key.toUpperCase();
    if (!key || key.length > 128 || key.includes('=') || key.includes('\0')
      || ['__PROTO__', 'PROTOTYPE', 'CONSTRUCTOR'].includes(upper)
      || typeof value !== 'string' || value.length > 8192 || value.includes('\0')
      || isForbiddenTrustedShellEnvironmentName(upper)
      || containsKnownEnvironmentSecret(key, sensitiveValues)
      || containsKnownEnvironmentSecret(value, sensitiveValues)) {
      throw new Error('A9_ENV_OVERLAY_REJECTED: secret or process-control entry');
    }
    totalCharacters += key.length + value.length + 2;
    if (totalCharacters > 32767) throw new Error('A9_ENV_OVERLAY_REJECTED: size limit exceeded');
    output[key] = value;
  }
  return output;
}

// Search complete values and embedded credentials without ever returning them.
// Decode each valid percent run independently so a malformed suffix cannot hide
// a valid encoded credential; support form-encoded spaces and mixed hex case.
function containsKnownEnvironmentSecret(value: string, secrets: readonly string[]): boolean {
  const decode = (text: string): string => text.replace(/(?:%[0-9a-f]{2})+/gi, (run) =>
    Buffer.from(run.slice(1).split('%').map((hex) => parseInt(hex, 16))).toString('utf8'));
  const candidates = [value, decode(value), decode(value.replace(/\+/g, ' '))];
  return secrets.some((secret) => {
    if (typeof secret !== 'string' || secret.length === 0) return false;
    const base64 = Buffer.from(secret, 'utf8').toString('base64');
    const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_');
    const variants = [secret, base64, base64.replace(/=+$/g, ''), base64url, base64url.replace(/=+$/g, '')];
    return candidates.some((candidate) => variants.some((variant) => candidate.includes(variant)));
  });
}
