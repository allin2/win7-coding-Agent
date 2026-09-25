/**
 * A9-21 M1b：URL 凭据脱敏与旧正则等价的线性扫描。
 *
 * 旧正则 /([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi 在连续协议名字符上二次回退。
 * 第 1 版 {0,31} 不等价（见反例）；本版改为交接书 v2 §2.2 线性扫描，输出与旧正则逐字节相同。
 * Unicode 样例一律写 \\u 转义，避免源码被编辑器/传输折叠码点。
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const { createA9AgentRuntime, redactUrlUserinfo } = require('../../product/a9-agent-runtime') as {
  createA9AgentRuntime: (options: Record<string, unknown>) => {
    getSnapshot: () => { diagnostics?: { detail?: string; code?: string } };
  };
  redactUrlUserinfo: (text: string) => string;
};

/** 旧正则参照（勿改）。每次内联，避免带 g 标志的 lastIndex 污染。 */
function oldRedactUrlUserinfo(text: string): string {
  return String(text == null ? '' : text)
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1***redacted***@');
}

const MIB = 1024 * 1024;
const U00A0 = '\u00A0';
const U2028 = '\u2028';
const U212A = '\u212A';
const U017F = '\u017F';

function msNow(): number {
  return Date.now();
}

/** 固定种子 LCG（不得用 Math.random）。 */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s;
  };
}

function pick(rng: () => number, items: string): string {
  return items.charAt(rng() % items.length);
}

function pickInt(rng: () => number, min: number, max: number): number {
  return min + (rng() % (max - min + 1));
}

describe('A9-21 M1b: equivalence with legacy regex (fixed corpus)', () => {
  const proto32 = 'a'.repeat(32);
  const proto33 = 'a'.repeat(33);
  const corpus: Array<[string, string]> = [
    ['https://user:pass@host/x', 'https://user:pass@host/x'],
    ['git+ssh://u:p@h', 'git+ssh://u:p@h'],
    ['HTTP://A:B@C', 'HTTP://A:B@C'],
    ['s3://k:v@b', 's3://k:v@b'],
    ['protocol exactly 32', `${proto32}://user:pass@host/x`],
    ['protocol exactly 33', `${proto33}://user:pass@host/x`],
    ['no credentials', 'https://example.com/a:b@c'],
    ['multiple urls', 'https://u1:p1@h1/a and git+ssh://u2:p2@h2/b done'],
    ['chinese around', '前缀 https://user:pass@host/x 后缀'],
    ['empty', ''],
    ['colon in path only', 'https://example.com/a:b'],
    ['at in path only', 'https://example.com/a@b'],
    // 第 1 版 {0,31} 不等价反例（协议名长且字母不在末 32 字符内）
    ['counterexample dotted version', 'v1.2.3.4.5.6.7.8.9.10.11.12.13.14.15://user:pass@host'],
    ['counterexample a+32ones', 'a11111111111111111111111111111111://user:pass@host'],
    ['counterexample x+40dashes', 'x----------------------------------------://user:pass@host'],
    // 相邻 URL 与协议名/@/空白夹杂
    ['adjacent urls', 'a://u:p@b://x:y@c'],
    ['at before ://', 'a@://u:p@h'],
    ['space before ://', 'a ://u:p@h'],
    ['at inside scheme run', 'a@b://u:p@h'],
    ['space inside scheme run', 'a b://u:p@h'],
    // U+00A0 / U+2028 空白与 U+212A / U+017F 字符
    ['U+00A0 before ://', 'a' + U00A0 + '://u:p@h'],
    ['U+2028 before ://', 'a' + U2028 + '://u:p@h'],
    ['U+00A0 in userinfo', 'a://u' + U00A0 + 'p:x@h'],
    ['U+2028 in userinfo', 'a://u' + U2028 + 'p:x@h'],
    ['U+212A scheme', U212A + '://u:p@h'],
    ['U+017F scheme', U017F + '://u:p@h'],
    ['U+212A mid scheme', '1' + U212A + '2://u:p@h'],
    ['U+017F mid scheme', '1' + U017F + '2://u:p@h'],
    ['U+212A in userinfo', 'a://' + U212A + ':p@h'],
    ['U+212A long scheme', 'a' + '1'.repeat(40) + U212A + '://u:p@h'],
  ];

  it.each(corpus)('byte-identical output: %s', (_label, input) => {
    expect(redactUrlUserinfo(input)).toBe(oldRedactUrlUserinfo(input));
  });

  it('counterexamples: legacy redacts, {0,31} style would leave plaintext', () => {
    for (const input of [
      'v1.2.3.4.5.6.7.8.9.10.11.12.13.14.15://user:pass@host',
      'a11111111111111111111111111111111://user:pass@host',
      'x----------------------------------------://user:pass@host',
    ]) {
      const out = redactUrlUserinfo(input);
      expect(out).toBe(oldRedactUrlUserinfo(input));
      expect(out).toContain('***redacted***');
      expect(out).not.toContain('user:pass');
    }
  });

  it('redacts URL userinfo and keeps scheme', () => {
    expect(redactUrlUserinfo('https://user:pass@host/x')).toBe('https://***redacted***@host/x');
  });

  it('handles null/undefined like String()', () => {
    expect(redactUrlUserinfo(null as unknown as string)).toBe(oldRedactUrlUserinfo(null as unknown as string));
    expect(redactUrlUserinfo(undefined as unknown as string)).toBe(oldRedactUrlUserinfo(undefined as unknown as string));
  });
});

describe('A9-21 M1b: equivalence with legacy regex (seeded differential)', () => {
  const SEED = 0xa92101b2;
  const COUNT = 100000;

  it(`seeded differential ${COUNT} cases (seed 0x${SEED.toString(16)}) match legacy`, () => {
    const rng = lcg(SEED);
    const protoAlpha = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const protoOther = '0123456789.+--';
    const junk = 'abcXYZ019 .+-:/@_\t\n ' + U00A0 + U2028 + U212A + U017F + '中文x"\'\\|{}[]()<>!?,;~`^%$#&*';
    const userAlpha = 'abcdefghijklmnopqrstuvwxyz0123456789._-';

    for (let i = 0; i < COUNT; i++) {
      const kind = i % 10;
      let input: string;
      if (kind === 0) {
        // 字母稀疏的长协议名（20～70 字符，字母约 5%）+ :// + 凭据
        const len = pickInt(rng, 20, 70);
        let scheme = '';
        for (let j = 0; j < len; j++) {
          scheme += rng() % 20 === 0 ? pick(rng, protoAlpha) : pick(rng, protoOther);
        }
        if (rng() % 4 === 0) {
          const pos = rng() % scheme.length;
          scheme = scheme.slice(0, pos) + pick(rng, protoAlpha) + scheme.slice(pos + 1);
        }
        input = `${scheme}://${pick(rng, userAlpha)}:${pick(rng, userAlpha)}@${pick(rng, userAlpha)}`;
      } else if (kind === 1) {
        // 反例形态：字母 + 长数字/点/横线
        const lead = pick(rng, protoAlpha);
        const fill = pick(rng, '1.-+');
        const n = pickInt(rng, 33, 60);
        input = `${lead}${fill.repeat(n)}://${pick(rng, userAlpha)}:${pick(rng, userAlpha)}@h`;
      } else if (kind === 2) {
        input = `${pick(rng, 'aHs3')}.://u${i}:p@b://x:y@c${i} tail`;
      } else if (kind === 3) {
        input = `${pick(rng, protoAlpha)}${pick(rng, '@ \t' + U00A0 + U2028)}//u:p@h`;
      } else if (kind === 4) {
        input = `${pick(rng, protoAlpha)}${pick(rng, U212A + U017F + U00A0 + U2028)}://u:p@h${pick(rng, junk)}`;
      } else if (kind === 5) {
        let s = '';
        const n = pickInt(rng, 0, 40);
        for (let j = 0; j < n; j++) s += pick(rng, junk);
        input = s;
      } else if (kind === 6) {
        input = `${pick(rng, 'hHtTsS3')}://example.com/a${pick(rng, ':@')}b`;
      } else if (kind === 7) {
        const n = rng() % 2 === 0 ? 32 : 33;
        input = `${'a'.repeat(n)}://u:p@h`;
      } else if (kind === 8) {
        input = pick(rng, protoAlpha + protoOther).repeat(pickInt(rng, 1, 80));
      } else {
        const n = pickInt(rng, 5, 120);
        let s = '';
        for (let j = 0; j < n; j++) s += pick(rng, junk + protoAlpha + ':/@');
        if (rng() % 3 === 0) s += '://u:p@h';
        input = s;
      }

      const expected = oldRedactUrlUserinfo(input);
      const actual = redactUrlUserinfo(input);
      if (actual !== expected) {
        throw new Error(
          `differential mismatch at case ${i} (kind ${kind}): input=${JSON.stringify(input.slice(0, 120))}\n`
          + `old=${JSON.stringify(expected.slice(0, 120))}\nnew=${JSON.stringify(actual.slice(0, 120))}`,
        );
      }
    }
  });
});

describe('A9-21 M1b: redactUrlUserinfo performance on 1 MiB inputs', () => {
  const unitUserNoAt = 'a://' + 'u'.repeat(500) + ':' + 'p'.repeat(500);
  const cases: Array<[string, string]> = [
    ['continuous letters', 'a'.repeat(MIB)],
    ['letters with one colon', 'a'.repeat(MIB / 2) + ':' + 'a'.repeat(MIB / 2 - 1)],
    ['a:// long : long no at', (() => {
      const xLen = MIB / 2;
      return 'a://' + 'x'.repeat(xLen) + ':' + 'y'.repeat(MIB - 4 - xLen - 1);
    })()],
    ['a://b:c repeated', 'a://b:c '.repeat(Math.ceil(MIB / 8)).slice(0, MIB)],
    ['hex string', 'deadbeef'.repeat(MIB / 8)],
    ['dense :// repeat', '://'.repeat(Math.ceil(MIB / 3)).slice(0, MIB)],
    ["('a'*1000+'://') repeat", ('a'.repeat(1000) + '://').repeat(Math.ceil(MIB / 1003)).slice(0, MIB)],
    ['a:// u*500 : p*500 repeat (no at)', unitUserNoAt.repeat(Math.ceil(MIB / unitUserNoAt.length)).slice(0, MIB)],
  ];

  it.each(cases)('completes within 1s: %s', (_label, input) => {
    expect(input.length).toBe(MIB);
    const started = msNow();
    const out = redactUrlUserinfo(input);
    const elapsed = msNow() - started;
    expect(typeof out).toBe('string');
    expect(elapsed).toBeLessThan(1000);
  });

  it('1 MiB worst-case letters completes within 1s (explicit measurement)', () => {
    const input = 'a'.repeat(MIB);
    const started = msNow();
    redactUrlUserinfo(input);
    const elapsed = msNow() - started;
    expect(elapsed).toBeLessThan(1000);
  });
});

describe('A9-21 M1b: boundedDiagnosticText via persistence failure path', () => {
  function runWithThrowingOpenDatabase(errorMessage: string) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-21-m1b-'));
    const workspaceRoot = path.join(root, 'ws');
    const dataRoot = path.join(root, 'data');
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.mkdirSync(dataRoot, { recursive: true });
    const started = msNow();
    const runtime = createA9AgentRuntime({
      workspaceRoot,
      dataRoot,
      ownerId: `m1b-${process.pid}`,
      openDatabase: () => {
        throw new Error(errorMessage);
      },
    });
    const elapsed = msNow() - started;
    const detail = String(runtime.getSnapshot().diagnostics?.detail || '');
    fs.rmSync(root, { recursive: true, force: true });
    return { elapsed, detail };
  }

  it('credential at start: redacts, bounds length, finishes within 2s on 1 MiB error', () => {
    // 凭据放在开头：若未脱敏，slice(0,600) 仍会留下明文 u:p（避免假通过）。
    const huge = 'https://u:p@h ' + 'a'.repeat(MIB);
    const { elapsed, detail } = runWithThrowingOpenDatabase(huge);

    expect(elapsed).toBeLessThan(2000);
    expect(detail).not.toContain('u:p');
    expect(detail).not.toContain('https://u:p@h');
    expect(detail.length).toBeLessThanOrEqual(600);
    expect(detail.includes('***redacted***')).toBe(true);
  });

  it('credential near position 300: redacts and hides u:p within 2s on 1 MiB error', () => {
    const prefix = 'x'.repeat(280);
    const huge = `${prefix} https://u:p@h ` + 'a'.repeat(MIB);
    const { elapsed, detail } = runWithThrowingOpenDatabase(huge);

    expect(elapsed).toBeLessThan(2000);
    expect(detail).not.toContain('u:p');
    expect(detail.includes('***redacted***')).toBe(true);
    expect(detail.length).toBeLessThanOrEqual(600);
  });

  it('counterexample scheme at position 300 is redacted (not {0,31}-style plaintext)', () => {
    const prefix = 'x'.repeat(200);
    const cred = 'v1.2.3.4.5.6.7.8.9.10.11.12.13.14.15://user:pass@host ';
    const huge = `${prefix} ${cred}` + 'a'.repeat(MIB);
    const { elapsed, detail } = runWithThrowingOpenDatabase(huge);

    expect(elapsed).toBeLessThan(2000);
    expect(detail).not.toContain('user:pass');
    expect(detail.includes('***redacted***')).toBe(true);
  });
});
