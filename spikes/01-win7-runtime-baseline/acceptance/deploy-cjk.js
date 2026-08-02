'use strict';
// 由 electron.exe 运行，利用 Node 原生 UTF-8 路径支持，将 ASCII 部署目录
// 复制到中文+空格路径，供 T03 / C10 实机验证。
const fs = require('fs');
const path = require('path');

const src = 'C:\\acceptance\\spike01';
const dst = 'C:\\测试 目录\\spike01';

function copyDir(s, d) {
  fs.mkdirSync(d, { recursive: true });
  for (const e of fs.readdirSync(s, { withFileTypes: true })) {
    const sp = path.join(s, e.name);
    const dp = path.join(d, e.name);
    if (e.isDirectory()) copyDir(sp, dp);
    else fs.copyFileSync(sp, dp);
  }
}

copyDir(src, dst);
fs.writeFileSync(path.join(dst, '.copied_ok'), 'ok');
console.log('COPIED_TO:' + dst);
console.log('EXISTS:' + fs.existsSync(path.join(dst, 'win7-acceptance.js')));
process.exit(0);
