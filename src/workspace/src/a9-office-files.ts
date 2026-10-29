import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
export const MAX_OFFICE_BYTES = 4 * 1024 * 1024;
function fail(code: string): never { throw Object.assign(new Error(code), { code }); }
export function officePath(root: string, target: string, newFile = false): { absolute: string; relative: string } {
  if (typeof target !== 'string' || !target || target.length > 4096 || target.includes('\0')) fail('A9_OFFICE_PATH_INVALID');
  const realRoot = fs.realpathSync(root);
  const requested = path.resolve(realRoot, target);
  const absolute = newFile ? path.join(fs.realpathSync(path.dirname(requested)), path.basename(requested)) : fs.realpathSync(requested);
  const relative = path.relative(realRoot, absolute);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) fail('A9_OFFICE_OUTSIDE_WORKSPACE');
  if (newFile ? fs.existsSync(absolute) : fs.lstatSync(requested).isSymbolicLink()) fail('A9_OFFICE_TARGET_EXISTS_OR_LINK');
  return { absolute, relative: relative.replace(/\\/g, '/') };
}
export async function readOfficeFile(root: string, target: string, signal?: AbortSignal): Promise<{ path: string; sha256: string; bytes: number; buffer: Buffer }> {
  const cancelled = () => { if (signal?.aborted) fail('A9_OFFICE_CANCELLED'); };
  cancelled();
  const resolved = officePath(root, target);
  const before = await fs.promises.stat(resolved.absolute);
  if (!before.isFile()) fail('A9_OFFICE_NOT_FILE');
  if (before.size > MAX_OFFICE_BYTES) fail('A9_OFFICE_BYTE_LIMIT');
  const handle = await fs.promises.open(resolved.absolute, 'r');
  const same = (a: fs.Stats, b: fs.Stats) => a.isFile() && b.isFile() && a.dev === b.dev && a.ino === b.ino &&
    a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
  try {
    if (!same(before, await handle.stat())) fail('A9_OFFICE_CHANGED');
    const buffer = Buffer.alloc(before.size); let offset = 0;
    while (offset < buffer.length) {
      cancelled();
      const { bytesRead } = await handle.read(buffer, offset, Math.min(65536, buffer.length - offset), offset);
      if (!bytesRead) fail('A9_OFFICE_CHANGED');
      offset += bytesRead;
    }
    if (!same(before, await handle.stat()) || !same(before, await fs.promises.lstat(resolved.absolute)) ||
      fs.realpathSync(resolved.absolute) !== resolved.absolute) fail('A9_OFFICE_CHANGED');
    cancelled();
    return { path: resolved.relative, sha256: crypto.createHash('sha256').update(buffer).digest('hex'), bytes: buffer.length, buffer };
  } finally { await handle.close(); }
}
/** Exclusive publication of a complete sibling file; a raced-in target cannot be replaced. */
export function createOfficeCopy(root: string, target: string, buffer: Buffer): string {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_OFFICE_BYTES) fail('A9_OFFICE_BYTE_LIMIT');
  const resolved = officePath(root, target, true);
  const temporary = path.join(path.dirname(resolved.absolute), `.office-${crypto.randomBytes(16).toString('hex')}.tmp`);
  let created = false;
  try {
    fs.writeFileSync(temporary, buffer, { flag: 'wx' }); created = true;
    if (officePath(root, target, true).absolute !== resolved.absolute) fail('A9_OFFICE_CHANGED');
    fs.linkSync(temporary, resolved.absolute);
    return resolved.relative;
  } finally { if (created) fs.unlinkSync(temporary); }
}
