import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vm from 'vm';
import { EventEmitter } from 'events';

const driverSourcePath = path.resolve(__dirname, 'a9-06-driver-entry.cjs');
const productMainPath = path.resolve(__dirname, '../../product/main.js');

interface DriverMockEnvironment {
  calls: string[];
  ipcHandlers: Record<string, any>;
  dialogMock: { showOpenDialog?: any };
  appMock: any;
  cleanup: () => void;
  reportWritten?: any;
}

function loadDriverHarness(options: {
  appAlreadyReady?: boolean;
  smokeMode?: string;
  forceStageError?: boolean;
  smokeOutPath?: string;
  retryConversation?: string;
  resolveWhenReady?: boolean;
} = {}): DriverMockEnvironment {
  const driverSource = fs.readFileSync(driverSourcePath, 'utf8');
  const calls: string[] = [];
  const ipcHandlers: Record<string, any> = {};
  const dialogMock: { showOpenDialog?: any } = {};

  const appMock = new EventEmitter() as any;
  appMock.isReady = () => Boolean(options.appAlreadyReady);
  appMock.whenReady = () => {
    calls.push('app.whenReady');
    if (options.resolveWhenReady) {
      return Promise.resolve();
    }
    return new Promise(() => {}); // stay pending
  };
  appMock.quit = () => {
    calls.push('app.quit');
    // In Electron, app.quit() triggers before-quit, and then will-quit
    appMock.emit('before-quit');
    appMock.emit('will-quit');
  };
  appMock.exit = (code: number) => {
    calls.push(`app.exit(${code})`);
  };

  const windowMock = new (class extends EventEmitter {
    webContents = {
      getURL: () => 'file:///app/resources/app/product/renderer/workbench.html',
      executeJavaScript: async (code: string) => {
        if (code.includes('readyState')) return 'complete';
        return true;
      },
    };
  })();

  const electronMock: any = {
    app: appMock,
    BrowserWindow: {
      getAllWindows: () => [windowMock],
    },
    dialog: dialogMock,
    ipcMain: {
      handle: (channel: string, listener: any) => {
        calls.push(`ipcMain.handle(${channel})`);
        ipcHandlers[channel] = listener;
      },
    },
  };

  let mockExitCode = 0;
  const processMock = Object.create(process);
  Object.defineProperty(processMock, 'exitCode', {
    get: () => mockExitCode,
    set: (code) => { mockExitCode = code; },
    configurable: true,
  });
  processMock.env = {
    ...process.env,
    A9_SMOKE_PRODUCT_MAIN: productMainPath,
    A9_SMOKE_MODE: options.smokeMode || 'first',
    A9_SMOKE_WORKSPACE: '/tmp/test-workspace',
    A9_SMOKE_DATAROOT: '/tmp/test-data',
    A9_SMOKE_FIXTURE_URL: 'http://127.0.0.1:9999',
    A9_SMOKE_OUT: options.smokeOutPath || '',
    A9_SMOKE_RETRY_CONVERSATION: options.retryConversation || '',
    A9_SMOKE_FORCE_STAGE_ERROR: options.forceStageError ? '1' : '0',
  };

  let writtenReport: any = null;
  const fsMock = {
    ...fs,
    mkdirSync: () => {},
    writeFileSync: (target: string, content: string) => {
      calls.push(`writeFileSync(${target})`);
      if (options.smokeOutPath && target === options.smokeOutPath) {
        try {
          writtenReport = JSON.parse(content);
        } catch (_e) {
          writtenReport = content;
        }
      }
    },
    existsSync: (p: string) => p.includes('a9-projection-contract.cjs') || fs.existsSync(p),
  };

  const localRequire = (id: string) => {
    if (id === 'electron') return electronMock;
    if (id === 'fs') return fsMock;
    if (id === productMainPath || id.endsWith('product/main.js')) {
      calls.push('require(productMain)');
      // Simulate productMain registering its IPC handler
      electronMock.ipcMain.handle('product:a9-request', async (_event: any, request: any) => {
        calls.push(`productHandler:${request?.action}`);
        return { ok: true, action: request?.action };
      });
      return {};
    }
    if (id.includes('a9-projection-contract.cjs')) {
      return {
        INSPECTOR_DISPLAY_RULE: 'bounded',
        INSPECTOR_DISPLAY_ROWS: 50,
        QUERY_EXPORT_KIND: 'test',
        DOM_EXPORT_KIND: 'test',
        QUERY_EXPORT_SCHEMA_VERSION: 1,
        DOM_EXPORT_SCHEMA_VERSION: 1,
        PRODUCT_FIRST_QUERY_LIMIT: 50,
        MAX_ERROR_HEAD: 120,
        MAX_COMMAND: 80,
        MAX_ARGS_FIELD: 400,
      };
    }
    return require(id);
  };

  const timers: NodeJS.Timeout[] = [];

  const context: any = {
    require: localRequire,
    __dirname: path.dirname(driverSourcePath),
    __filename: driverSourcePath,
    process: processMock,
    console,
    Buffer,
    setImmediate: (fn: any) => fn(),
    clearTimeout,
    setTimeout: (fn: any, ms?: number) => {
      const t = setTimeout(fn, ms || 1);
      timers.push(t);
      return t;
    },
    Promise,
    Date,
    Object,
    String,
    Number,
    Array,
    JSON,
    Error,
    module: { exports: {} },
    exports: {},
  };

  vm.runInNewContext(driverSource, context, { filename: driverSourcePath });

  return {
    calls,
    ipcHandlers,
    dialogMock,
    appMock,
    cleanup: () => {
      for (const t of timers) clearTimeout(t);
    },
    get reportWritten() { return writtenReport; },
  };
}

describe('WIN7-35 Driver entry lifecycle and exit contracts', () => {
  afterEach(() => {
    process.exitCode = 0;
  });
  test('1. Loads product entry before app readiness when app is not ready', () => {
    const harness = loadDriverHarness({
      appAlreadyReady: false,
      smokeMode: 'first',
    });

    // Verify ordering: require(productMain) MUST happen BEFORE app.whenReady
    const productMainIndex = harness.calls.indexOf('require(productMain)');
    const whenReadyIndex = harness.calls.indexOf('app.whenReady');

    expect(productMainIndex).toBeGreaterThanOrEqual(0);
    expect(whenReadyIndex).toBeGreaterThan(productMainIndex);

    // Verify dialog seam is pre-installed before window driving
    expect(typeof harness.dialogMock.showOpenDialog).toBe('function');
    harness.cleanup();
  });

  test('2. Rejects product entry load when app is already ready with A9_W35_DRIVER_PRODUCT_ENTRY_LATE_LOAD', () => {
    const tmpOut = path.join(os.tmpdir(), `a9-late-load-test-${Date.now()}.json`);
    const harness = loadDriverHarness({
      appAlreadyReady: true,
      smokeOutPath: tmpOut,
    });

    // Must NOT load productMain
    expect(harness.calls).not.toContain('require(productMain)');

    // Must call app.exit(1) or app.quit()
    expect(harness.calls.some((c) => c === 'app.exit(1)' || c === 'app.quit')).toBe(true);

    // Written report must reflect the stable error code
    expect(harness.reportWritten).toBeDefined();
    expect(harness.reportWritten.status).toBe('ERROR');
    expect(harness.reportWritten.error).toContain('A9_W35_DRIVER_PRODUCT_ENTRY_LATE_LOAD');
    expect(harness.reportWritten.cases.some((c: any) => c.id === 'A9_W35_DRIVER_PRODUCT_ENTRY_LATE_LOAD')).toBe(true);
    harness.cleanup();
  });

  test('3. Fault injection seam wraps ipcMain.handle BEFORE product IPC is registered', async () => {
    const harness = loadDriverHarness({
      appAlreadyReady: false,
      smokeMode: 'retry',
      retryConversation: 'conv-retry-123',
    });

    // Verify wrapped IPC handler was registered
    const wrappedHandler = harness.ipcHandlers['product:a9-request'];
    expect(typeof wrappedHandler).toBe('function');

    // First query on matching conversation triggers injected failure
    const req1 = { action: 'a9.events.query', payload: { conversationId: 'conv-retry-123' } };
    const res1 = await wrappedHandler({}, req1);
    expect(res1).toEqual({ ok: false, error: { code: 'A9_INJECTED_QUERY_FAILURE' } });

    // Subsequent call passes through to the underlying product handler
    const res2 = await wrappedHandler({}, req1);
    expect(res2).toEqual({ ok: true, action: 'a9.events.query' });
    harness.cleanup();
  });

  test('4. Controlled journey ERROR causes non-zero exit code and writes report without bypassing shutdown', async () => {
    const tmpOut = path.join(os.tmpdir(), `a9-force-error-test-${Date.now()}.json`);
    const harness = loadDriverHarness({
      appAlreadyReady: false,
      smokeMode: 'first',
      forceStageError: true,
      smokeOutPath: tmpOut,
      resolveWhenReady: true,
    });

    // Wait for the async journey promise chain to settle
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(harness.calls).toContain('app.quit');
    expect(harness.calls).toContain('app.exit(1)');

    expect(harness.reportWritten).toBeDefined();
    expect(harness.reportWritten.status).toBe('ERROR');
    expect(harness.reportWritten.error).toContain('A9_FORCED_STAGE_ERROR_FOR_TEST');
    harness.cleanup();
  });

  test('5. Parent smoke contract validator fails closed on contradictory exit / report states', () => {
    // Shared validation logic matching run-a9-06-electron-smoke.mjs & a9-win7-35-smoke.cjs
    function validatePhaseContract(exitCode: number, report: any, expectedMode: string) {
      const exitOk = exitCode === 0;
      const statusOk = report && report.status === 'PASS';
      const modeOk = expectedMode ? report && report.mode === expectedMode : true;
      const casesOk = report && Array.isArray(report.cases) && report.cases.length > 0 && report.cases.every((c: any) => c && c.passed === true);
      return Boolean(exitOk && statusOk && modeOk && casesOk && !report.error);
    }

    const passReport = { mode: 'first', status: 'PASS', cases: [{ id: 'TEST-1', passed: true }] };
    const errorReport = { mode: 'first', status: 'ERROR', error: 'TIMEOUT', cases: [] };

    // Consistent PASS: exit 0 + status PASS -> true
    expect(validatePhaseContract(0, passReport, 'first')).toBe(true);

    // Contradiction 1: exit 0 + status ERROR -> fail closed (false)
    expect(validatePhaseContract(0, errorReport, 'first')).toBe(false);

    // Contradiction 2: exit 1 + status PASS -> fail closed (false)
    expect(validatePhaseContract(1, passReport, 'first')).toBe(false);

    // Report missing or corrupted -> fail closed (false)
    expect(validatePhaseContract(0, null, 'first')).toBe(false);
    expect(validatePhaseContract(0, { status: 'PASS', cases: [] }, 'first')).toBe(false);
  });
});

describe('Node subprocess lifecycle counter-examples with Electron mocks', () => {
  test('Node mock counter-example 1: loading driver when app is already ready exits non-zero with A9_W35_DRIVER_PRODUCT_ENTRY_LATE_LOAD', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-counter-1-'));
    const reportOut = path.join(tmpDir, 'late-load-report.json');

    // Create a standalone harness script that sets up an already-ready electron mock and requires driver
    const runnerScript = path.join(tmpDir, 'run-late-load.js');
    fs.writeFileSync(runnerScript, `
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const appMock = new EventEmitter();
appMock.isReady = () => true;
appMock.whenReady = () => Promise.resolve();
appMock.quit = () => {
  appMock.emit('before-quit', { preventDefault() {} });
  appMock.emit('will-quit', { preventDefault() {} });
};
appMock.exit = (code) => { process.exit(code); };

const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === 'electron') {
    return {
      app: appMock,
      BrowserWindow: { getAllWindows: () => [] },
      dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
      ipcMain: { handle: () => {} },
    };
  }
  return originalRequire.apply(this, arguments);
};

process.env.A9_SMOKE_OUT = ${JSON.stringify(reportOut)};
process.env.A9_SMOKE_MODE = 'first';

try {
  require(${JSON.stringify(driverSourcePath)});
} catch (err) {
  process.exit(1);
}
`);

    const result = childProcess.spawnSync(process.execPath, [runnerScript], {
      encoding: 'utf8',
      timeout: 10000,
    });

    // 1. Process exit code MUST be non-zero (1)
    expect(result.status).toBe(1);

    // 2. Report MUST be written and contain A9_W35_DRIVER_PRODUCT_ENTRY_LATE_LOAD
    expect(fs.existsSync(reportOut)).toBe(true);
    const report = JSON.parse(fs.readFileSync(reportOut, 'utf8'));
    expect(report.status).toBe('ERROR');
    expect(report.error).toContain('A9_W35_DRIVER_PRODUCT_ENTRY_LATE_LOAD');
    expect(report.cases.some((c: any) => c.id === 'A9_W35_DRIVER_PRODUCT_ENTRY_LATE_LOAD')).toBe(true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('Node mock counter-example 2: forced stage ERROR returns non-zero after the mocked product will-quit cleanup', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-counter-2-'));
    const reportOut = path.join(tmpDir, 'forced-error-report.json');
    const cleanupMarker = path.join(tmpDir, 'mock-product-cleanup.txt');

    const runnerScript = path.join(tmpDir, 'run-forced-error.js');
    fs.writeFileSync(runnerScript, `
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const appMock = new EventEmitter();
appMock.isReady = () => false;
appMock.whenReady = () => Promise.resolve();
appMock.quit = () => {
  // Simulate main.js before-quit hook doing shutdown
  appMock.emit('before-quit', { preventDefault() {} });
  appMock.emit('will-quit', { preventDefault() {} });
};
appMock.exit = (code) => { process.exit(code); };

const windowMock = new EventEmitter();
windowMock.webContents = {
  getURL: () => 'file:///app/resources/app/product/renderer/workbench.html',
  executeJavaScript: async () => true,
};

const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === 'electron') {
    return {
      app: appMock,
      BrowserWindow: { getAllWindows: () => [windowMock] },
      dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: ['/tmp/ws'] }) },
      ipcMain: { handle: () => {} },
    };
  }
  if (id.includes('product/main.js')) {
    appMock.on('will-quit', () => fs.writeFileSync(${JSON.stringify(cleanupMarker)}, 'cleanup-ran', 'utf8'));
    return {};
  }
  if (id.includes('a9-projection-contract.cjs')) {
    return {
      INSPECTOR_DISPLAY_RULE: 'bounded',
      INSPECTOR_DISPLAY_ROWS: 50,
      QUERY_EXPORT_KIND: 'test',
      DOM_EXPORT_KIND: 'test',
      QUERY_EXPORT_SCHEMA_VERSION: 1,
      DOM_EXPORT_SCHEMA_VERSION: 1,
      PRODUCT_FIRST_QUERY_LIMIT: 50,
      MAX_ERROR_HEAD: 120,
      MAX_COMMAND: 80,
      MAX_ARGS_FIELD: 400,
    };
  }
  return originalRequire.apply(this, arguments);
};

process.env.A9_SMOKE_OUT = ${JSON.stringify(reportOut)};
process.env.A9_SMOKE_MODE = 'first';
process.env.A9_SMOKE_FORCE_STAGE_ERROR = '1';

require(${JSON.stringify(driverSourcePath)});
`);

    const result = childProcess.spawnSync(process.execPath, [runnerScript], {
      encoding: 'utf8',
      timeout: 10000,
    });

    // 1. Process exit code MUST be non-zero (1)
    expect(result.status).toBe(1);

    // 2. Report MUST be complete with status 'ERROR'
    expect(fs.existsSync(reportOut)).toBe(true);
    const report = JSON.parse(fs.readFileSync(reportOut, 'utf8'));
    expect(report.status).toBe('ERROR');
    expect(report.error).toContain('A9_FORCED_STAGE_ERROR_FOR_TEST');
    expect(fs.readFileSync(cleanupMarker, 'utf8')).toBe('cleanup-ran');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
