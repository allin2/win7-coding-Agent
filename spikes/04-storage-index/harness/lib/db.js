'use strict';

/**
 * SPIKE 04 - 统一 DB 驱动（异步接口）
 *
 * 提供与后端无关的异步数据库接口，供 indexer / benchmark / crash-recovery 使用。
 *
 * 后端：
 *   - 'better-sqlite3'（Win7 锁定，Electron ABI 110 内加载；原生绑定路径可由
 *     A6_BS3_ROOT / A6_BS3_NATIVE 指定）
 *   - 'python-bridge'（开发机逻辑验证，python3 + sqlite3 worker，JSON-lines 桥接）
 *
 * 统一接口（全部 async）：
 *   db.sqliteVersion -> string
 *   db.backend -> string
 *   db.exec(sql) -> Promise<void>
 *   db.pragma(sql, simple) -> Promise<value | rows>
 *   db.prepare(sql) -> Promise<stmt>
 *     stmt.run(params) / get(params) / all(params) / finalize() -> Promise
 *   db.transaction(asyncFn) -> Promise<T>（自行 begin/commit/rollback）
 *   db.close() -> Promise<void>
 *   db.mediaHint -> string（调用方注入的介质类型，随 JSON 输出）
 *
 * Win7-Validation: NOT_PERFORMED
 */

const path = require('path');
const { spawn } = require('child_process');

// ─── better-sqlite3 后端（同步内核 → 异步外壳）──────────────────────────────

function createBetterSqlite3(dbPath, options) {
  const bs3Root = options.bs3Root || process.env.A6_BS3_ROOT;
  let Database;
  if (bs3Root) {
    Database = require(path.join(bs3Root, 'lib', 'index.js'));
  } else {
    Database = require('better-sqlite3');
  }
  const nativeBinding = options.nativeBinding || process.env.A6_BS3_NATIVE;
  const db = nativeBinding
    ? new Database(dbPath, { nativeBinding })
    : new Database(dbPath);

  const versionRow = db.prepare('select sqlite_version() as v').get();
  const sqliteVersion = versionRow.v;

  return {
    backend: 'better-sqlite3',
    sqliteVersion,
    _dbPath: dbPath,
    async exec(sql) {
      db.exec(sql);
    },
    async pragma(sql, simple) {
      // better-sqlite3 的 db.pragma 不接受 'PRAGMA ' 前缀（自行拼接），
      // 与 python-bridge 后端（execute('PRAGMA ...') 合法）对齐：去掉前缀。
      const cleaned = String(sql).replace(/^\s*PRAGMA\s+/i, '');
      return simple ? db.pragma(cleaned, { simple: true }) : db.pragma(cleaned);
    },
    async prepare(sql) {
      const stmt = db.prepare(sql);
      return {
        async run(params) {
          return stmt.run(...(params || []));
        },
        async get(params) {
          return stmt.get(...(params || []));
        },
        async all(params) {
          return stmt.all(...(params || []));
        },
        async finalize() {
          // better-sqlite3 无显式 finalize API（语句由 GC 自动释放）；
          // no-op 以保持与 python-bridge 后端的统一接口。
        },
      };
    },
    async transaction(fn) {
      db.exec('BEGIN');
      try {
        const result = await fn();
        db.exec('COMMIT');
        return result;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
    async close() {
      db.close();
    },
  };
}

function normalizeParams(params) {
  if (params === undefined || params === null) {
    return [];
  }
  if (Array.isArray(params)) {
    return params;
  }
  return [params];
}

// ─── python-bridge 后端 ─────────────────────────────────────────────────────

function createPythonBridge(dbPath, options) {
  const pythonBin = options.pythonBin || process.env.A6_PYTHON || '/usr/bin/python3';
  const workerPath = path.join(__dirname, '..', 'python', 'sqlite_bridge.py');

  const env = Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' });
  const proc = spawn(pythonBin, ['-u', workerPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env,
  });
  let lineBuffer = '';
  const pending = new Map();
  let nextId = 1;
  let workerDead = false;
  let lastWorkerErr = '';

  proc.stdout.setEncoding('utf8');
  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data', (d) => {
    lastWorkerErr += d;
    if (lastWorkerErr.length > 4000) {
      lastWorkerErr = lastWorkerErr.slice(-4000);
    }
  });

  // worker 意外退出：reject 全部 pending，避免挂死
  proc.on('exit', (code, signal) => {
    workerDead = true;
    const err = new Error('python worker exited unexpectedly code=' + code + ' signal=' + signal + ' stderr=' + lastWorkerErr.slice(-400));
    for (const p of pending.values()) {
      p.reject(err);
    }
    pending.clear();
  });
  proc.on('error', (err) => {
    workerDead = true;
    for (const p of pending.values()) {
      p.reject(err);
    }
    pending.clear();
  });

  proc.stdout.on('data', (chunk) => {
    lineBuffer += chunk;
    let idx;
    while ((idx = lineBuffer.indexOf('\n')) !== -1) {
      const line = lineBuffer.slice(0, idx).trim();
      lineBuffer = lineBuffer.slice(idx + 1);
      if (!line) {
        continue;
      }
      let msg;
      try {
        msg = JSON.parse(line);
      } catch (_) {
        continue;
      }
      const id = msg.id;
      const pendingReq = pending.get(id);
      if (pendingReq) {
        pending.delete(id);
        if (msg.ok) {
          pendingReq.resolve(msg.result);
        } else {
          pendingReq.reject(new Error(msg.error || 'python bridge error'));
        }
      }
    }
  });

  function request(op, payload) {
    if (workerDead) {
      return Promise.reject(new Error('python worker is dead; stderr=' + lastWorkerErr.slice(-200)));
    }
    const id = nextId++;
    const body = Object.assign({ id, op }, payload);
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      proc.stdin.write(JSON.stringify(body) + '\n');
    });
  }

  const api = {
    backend: 'python-bridge',
    sqliteVersion: null,
    _dbPath: dbPath,
    async open() {
      const res = await request('open', { path: dbPath });
      api.sqliteVersion = res.sqlite_version;
      return api;
    },
    async exec(sql) {
      return request('exec', { sql });
    },
    async pragma(sql, simple) {
      return request('pragma', { sql, simple: !!simple });
    },
    async prepare(sql) {
      const res = await request('prepare', { sql });
      const stmtId = res.stmt;
      return {
        async run(params) {
          return request('run', { stmt: stmtId, params: normalizeParams(params) });
        },
        async get(params) {
          return request('get', { stmt: stmtId, params: normalizeParams(params) });
        },
        async all(params) {
          return request('all', { stmt: stmtId, params: normalizeParams(params) });
        },
        async finalize() {
          return request('finalize', { stmt: stmtId });
        },
      };
    },
    async transaction(fn) {
      await request('begin', {});
      try {
        const result = await fn();
        await request('commit', {});
        return result;
      } catch (err) {
        await request('rollback', {}).catch(() => {});
        throw err;
      }
    },
    async close() {
      try {
        await request('close', {});
      } catch (_) {
        /* ignore */
      }
      proc.stdin.end();
    },
    _proc: proc,
  };

  return api;
}

/**
 * 打开数据库（async）。
 * @param {string} dbPath
 * @param {object} [options]
 * @param {'better-sqlite3'|'python-bridge'} [options.backend]
 * @returns {Promise<object>} 统一异步接口
 */
async function openDatabase(dbPath, options) {
  const opts = options || {};
  const backend = opts.backend || process.env.A6_DB_BACKEND || 'better-sqlite3';
  if (backend === 'better-sqlite3') {
    return createBetterSqlite3(dbPath, opts);
  }
  if (backend === 'python-bridge') {
    const api = createPythonBridge(dbPath, opts);
    return api.open();
  }
  throw new Error('unknown backend: ' + backend);
}

module.exports = { openDatabase };
