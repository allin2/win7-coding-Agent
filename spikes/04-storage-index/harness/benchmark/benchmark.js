'use strict';

/**
 * SPIKE 04 - benchmark runner（S01-S08）
 *
 * 用法：
 *   node benchmark/benchmark.js --samples <dir> --scale 10k [--backend python-bridge] [选项]
 *
 * 输出：
 *   - evidence/run-<timestamp>-s0X.json（每用例结构化 JSON + 原始指标）
 *   - evidence/run-<timestamp>-summary.json（汇总）
 *
 * 介质类型检测（SSD/HDD/unknown）随每个用例输出，绝不把 SSD 数据冒充机械盘。
 * 开发机数据仅趋势参考；Win7 实机验收前不得据此判定 Go。
 *
 * Win7-Validation: NOT_PERFORMED
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../lib/db');
const { initSchema } = require('../lib/indexer');
const { detectDiskType } = require('../lib/disk-type');
const fixtures = require('../lib/fixtures');

const CASES = [
  require('./cases/s01_wal_qps'),
  require('./cases/s02_crash_recovery'),
  require('./cases/s03_fts_full_index'),
  require('./cases/s04_incremental_index'),
  require('./cases/s05_query_p95'),
  require('./cases/s06_cleanup_512mb'),
  require('./cases/s07_bounded_scan'),
  require('./cases/s08_unicode_paths'),
];

function parseArgs(argv) {
  const opts = {
    backend: process.env.A6_DB_BACKEND || 'python-bridge',
    samples: null,
    scale: '10k',
    cases: null,
    durationMs: 60000,
    media: null,
    evidenceDir: null,
    genFixtures: false,
    win7Validated: false,
    s06LimitMb: 512,
    s06TargetMb: 256,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--samples') opts.samples = next();
    else if (a === '--scale') opts.scale = next();
    else if (a === '--backend') opts.backend = next();
    else if (a === '--cases') opts.cases = next().split(',').map((s) => s.trim().toUpperCase());
    else if (a === '--duration-ms') opts.durationMs = Number(next());
    else if (a === '--media') opts.media = next();
    else if (a === '--evidence-dir') opts.evidenceDir = next();
    else if (a === '--gen-fixtures') opts.genFixtures = true;
    else if (a === '--win7-validated') opts.win7Validated = true;
    else if (a === '--s06-limit-mb') opts.s06LimitMb = Number(next());
    else if (a === '--s06-target-mb') opts.s06TargetMb = Number(next());
    else if (a === '--s05-reps') opts.s05Reps = Number(next());
    else if (a === '--s04-modify-n') opts.s04ModifyN = Number(next());
    else if (a === '--help') { opts.help = true; }
    else { throw new Error('unknown arg: ' + a); }
  }
  return opts;
}

const SCALE_FILES = { '3k': 3000, '10k': 10000, '30k': 30000 };

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`SPIKE 04 benchmark runner
用法:
  node benchmark/benchmark.js --samples <dir> [options]

选项:
  --backend <python-bridge|better-sqlite3>   默认 ${opts.backend}
  --scale <3k|10k|30k>                       样本规模（未提供 samples 时自动生成）
  --gen-fixtures                             在临时目录生成样本
  --cases <S01,S02,...>                      只运行指定用例（默认全部）
  --duration-ms <ms>                         S01 持续时长（默认 60000）
  --media <ssd|hdd|unknown>                  显式介质声明（覆盖探测）
  --s06-limit-mb / --s06-target-mb           S06 阈值（开发机可调小）
  --evidence-dir <dir>                       输出目录（默认 harness/evidence）
  --win7-validated                           标记为 Win7 实机验收证据（仅显式授权时用）
  --help`);
    return;
  }

  const media = detectDiskType(opts.media);
  const startUtc = new Date().toISOString();

  // 样本
  let sampleRoot = opts.samples;
  if (!sampleRoot) {
    sampleRoot = path.join(os.tmpdir(), 'spike04_samples_' + Date.now());
    const count = SCALE_FILES[opts.scale] || 10000;
    process.stderr.write(`generating fixtures ${opts.scale} (${count} files) -> ${sampleRoot}\n`);
    const res = fixtures.generateFixtureTree({ root: sampleRoot, fileCount: count, seed: 42 });
    process.stderr.write(`fixtures done: ${res.files} files, cp936=${res.cp936Count}, utf8=${res.utf8Count}\n`);
    opts.samples = sampleRoot;
  } else {
    const count = fs.readdirSync(sampleRoot).length;
    process.stderr.write(`using existing samples at ${sampleRoot}\n`);
  }
  opts.sampleRoot = sampleRoot;

  const evidenceDir = opts.evidenceDir || path.join(__dirname, '..', 'evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const ts = startUtc.replace(/[:.]/g, '-');

  // 建库（每个用例独立库，避免相互污染；S01/S02/S03 等用独立 DB）
  const dbDir = path.join(evidenceDir, '..', 'work', 'db', ts);
  fs.mkdirSync(dbDir, { recursive: true });

  const wanted = opts.cases || CASES.map((c) => c.id);
  const results = [];
  const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'schema', 'spike04.sql'), 'utf8');

  for (const c of CASES) {
    if (!wanted.includes(c.id)) {
      continue;
    }
    process.stderr.write(`[${c.id}] ${c.name} ...\n`);
    const caseDbPath = path.join(dbDir, c.id.toLowerCase() + '.db');
    const db = await openDatabase(caseDbPath, { backend: opts.backend });
    await initSchema(db, schemaSql);

    let indexedDone = false;
    const caseCtx = {
      db,
      options: Object.assign({}, opts, {
        s03TimeBudgetMs: 600000,
      }),
      // 依赖索引的用例先做一次全量索引（若库空）
      async ensureIndexed() {
        if (indexedDone) {
          return;
        }
        const { fullIndex } = require('../lib/indexer');
        const countRow = await (await db.prepare('SELECT COUNT(*) AS c FROM files')).get();
        if (!countRow || countRow.c === 0) {
          let count;
          try {
            count = require('fs').readdirSync(sampleRoot).length;
          } catch (_) {
            count = '?';
          }
          process.stderr.write(`  (pre-indexing ${count} top-level entries at ${sampleRoot})\n`);
          await fullIndex(db, sampleRoot, { timeBudgetMs: 600000, batchSize: 500 });
        }
        indexedDone = true;
      },
    };

    const caseStarted = Date.now();
    const caseError = [];
    let caseResult;
    try {
      caseResult = await c.run(caseCtx);
    } catch (err) {
      caseError.push(String(err && err.stack || err));
      caseResult = {
        metrics: { error: String(err && err.message || err) },
        raw: null,
        pass: { met: false, noGo: null, note: '用例执行抛错', error: String(err && err.stack || err) },
      };
    } finally {
      // 恒关闭 db，避免 python worker 泄漏
      await db.close();
    }

    const entry = {
      schema_version: 1,
      spike: 'SPIKE_04',
      case: c.id,
      name: c.name,
      host: {
        platform: process.platform,
        arch: process.arch,
        node: process.version,
        hostname: os.hostname(),
      },
      runtime: {
        backend: opts.backend,
        sqlite: db.sqliteVersion, // 关闭后 sqliteVersion 仍可读（对象缓存）
      },
      media: {
        type: media,
        declared: !!opts.media,
        note: media === 'hdd' ? 'mechanical disk' : media === 'ssd' ? 'SSD data, NOT mechanical disk' : 'unknown',
      },
      win7: {
        validated: opts.win7Validated,
        note: opts.win7Validated
          ? 'PASS: Win7 SP1 x64 实机执行（锁定 better-sqlite3 ABI 110），数据为实机验收证据'
          : 'NOT_PERFORMED: Win7 实机验收未执行，本数据仅开发机趋势参考',
      },
      params: {
        scale: opts.scale,
        durationMs: opts.durationMs,
        s06LimitMb: opts.s06LimitMb,
      },
      startedAtUtc: startUtc,
      elapsedMs: Date.now() - caseStarted,
      metrics: caseResult.metrics,
      raw: caseResult.raw,
      pass: caseResult.pass,
      errors: caseError.length ? caseError : undefined,
    };

    const outFile = path.join(evidenceDir, `run-${ts}-${c.id.toLowerCase()}.json`);
    fs.writeFileSync(outFile, JSON.stringify(entry, null, 2) + '\n', 'utf8');
    results.push({
      case: c.id,
      name: c.name,
      status: caseResult.pass && caseResult.pass.met ? 'MET' : 'NOT_MET',
      noGo: caseResult.pass && caseResult.pass.noGo ? 'NO_GO' : null,
      metrics: caseResult.metrics,
      file: path.basename(outFile),
    });
    process.stderr.write(`[${c.id}] ${caseResult.pass && caseResult.pass.met ? 'MET' : 'NOT_MET'} -> ${outFile}\n`);
  }

  const summary = {
    schema_version: 1,
    spike: 'SPIKE_04',
    runId: ts,
    startedAtUtc: startUtc,
    backend: opts.backend,
    media: media,
    samples: sampleRoot,
    scale: opts.scale,
    win7_validation: opts.win7Validated ? 'VALIDATED' : 'NOT_PERFORMED',
    results,
  };
  const sumFile = path.join(evidenceDir, `run-${ts}-summary.json`);
  fs.writeFileSync(sumFile, JSON.stringify(summary, null, 2) + '\n');
  process.stderr.write(`summary -> ${sumFile}\n`);
}

main().catch((err) => {
  process.stderr.write('FATAL: ' + (err && err.stack || err) + '\n');
  process.exit(1);
});
