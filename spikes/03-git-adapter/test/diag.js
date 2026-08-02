'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { GitAdapter } = require('../adapter/adapter.js');

const GIT = 'C:\\acceptance\\git\\cmd\\git.exe';
const N02_REPO = 'C:\\acceptance\\spike03-work\\malicious\\attack_N02';
const SENT_FWD = 'C:/acceptance/pwned/N02.txt';      // 正斜杠
const SENT_BAK = 'C:\\acceptance\\pwned\\N02.txt';    // 反斜杠

// 建一个确定会写文件的 filter payload（sh -c 上下文，正斜杠）
const evilCmd = 'cmd.exe /c "echo pwned > ' + SENT_FWD + '"';
console.log('EVIL_CMD=' + evilCmd);

// 设置恶意 filter 到 N02 仓库本地配置（用真实 git，非隔离）
spawnSync(GIT, ['config', 'filter.malicious.process', evilCmd], { cwd: N02_REPO, env: process.env, shell: false });
spawnSync(GIT, ['config', 'filter.malicious.required', 'true'], { cwd: N02_REPO, env: process.env, shell: false });

// 清空哨兵
for (const p of [SENT_FWD, SENT_BAK]) { try { fs.unlinkSync(p); } catch (_) {} }

const adapter = new GitAdapter({ gitBinary: GIT, isolation: true });
let prepared;
try { prepared = adapter.prepare({ command: 'add', args: ['sample.txt'], workDir: N02_REPO }); }
catch (e) { console.log('PREPARE_THREW:' + e.message); process.exit(2); }

console.log('ISOLATED_ARGS=' + JSON.stringify(prepared.args));
console.log('ISOLATED_HOME=' + prepared.config.envOverlay['HOME']);
console.log('HAS_FILTER_OVERRIDE=' + prepared.args.some(a => a.indexOf('filter.') >= 0));

const res = spawnSync(prepared.command, prepared.args, {
  cwd: prepared.config.workDir, env: prepared.config.envOverlay,
  shell: false, encoding: 'utf8', timeout: 30000, maxBuffer: 32 * 1024 * 1024, windowsHide: true,
});
console.log('EXIT=' + res.status);
console.log('STDOUT=' + (res.stdout || '').slice(0, 800));
console.log('STDERR=' + (res.stderr || '').slice(0, 1200));
console.log('SENTINEL_FWD_EXISTS=' + fs.existsSync(SENT_FWD));
console.log('SENTINEL_BAK_EXISTS=' + fs.existsSync(SENT_BAK));
// 列出 pwned 目录
try { console.log('PWNED_DIR=' + JSON.stringify(fs.readdirSync('C:\\acceptance\\pwned'))); } catch (e) { console.log('PWNED_DIR_ERR=' + e.message); }
process.exit(0);
