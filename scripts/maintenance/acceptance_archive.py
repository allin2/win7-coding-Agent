#!/usr/bin/env python3
"""Locate and restore this project's offline archives on macOS; never deletes."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import plistlib
import stat
import subprocess
import sys


REPO = Path(__file__).resolve().parents[2]
REGISTRY = REPO / 'docs/acceptance/EXTERNAL_ARCHIVE.json'


class ArchiveError(RuntimeError):
    pass


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def no_links(path):
    if not path.is_absolute() or '..' in path.parts:
        raise ArchiveError('UNSAFE_PATH')
    for part in [path, *path.parents]:
        if part.is_symlink():
            raise ArchiveError('SYMLINK_PATH_REFUSED')


def child(root, relative):
    rel = PurePosixPath(relative)
    if rel.is_absolute() or '..' in rel.parts or not rel.parts:
        raise ArchiveError('UNSAFE_ARCHIVE_PATH')
    path = root.joinpath(*rel.parts)
    no_links(path)
    return path


def sha256(path):
    no_links(path)
    before = path.stat()
    if not stat.S_ISREG(before.st_mode):
        raise ArchiveError('REGULAR_FILE_REQUIRED')
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
        after = os.fstat(stream.fileno())
    if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (
            after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns):
        raise ArchiveError('FILE_CHANGED_DURING_READ')
    return digest.hexdigest()


def disk_info(volume_uuid):
    try:
        result = subprocess.run(
            ['/usr/sbin/diskutil', 'info', '-plist', volume_uuid],
            capture_output=True, timeout=10, stdin=subprocess.DEVNULL)
        if result.returncode:
            raise ArchiveError('ARCHIVE_VOLUME_OFFLINE: 请接入登记的相机盘后重试')
        return plistlib.loads(result.stdout)
    except (subprocess.TimeoutExpired, plistlib.InvalidFileException) as exc:
        raise ArchiveError('ARCHIVE_VOLUME_STATE_UNKNOWN') from exc


def locate(registry):
    info = disk_info(registry['volume_uuid'])
    if str(info.get('VolumeUUID', '')).upper() != registry['volume_uuid'].upper():
        raise ArchiveError('WRONG_VOLUME_UUID')
    if not info.get('MountPoint'):
        raise ArchiveError('ARCHIVE_VOLUME_NOT_MOUNTED: 请先挂载相机盘')
    mount = Path(info['MountPoint'])
    no_links(mount)
    if not os.path.ismount(mount) or info.get('Internal') is not False:
        raise ArchiveError('EXTERNAL_MOUNT_REQUIRED')
    root = child(mount, registry['relative_root'])
    if not root.is_dir() or root.stat().st_dev != mount.stat().st_dev:
        raise ArchiveError('ARCHIVE_ROOT_MISSING_OR_WRONG_DEVICE')
    marker = child(root, registry['marker_file'])
    if sha256(marker) != registry['marker_sha256']:
        raise ArchiveError('ARCHIVE_MARKER_MISMATCH')
    return root


def catalog_for(registry, root, batch, group):
    try:
        spec = registry['batches'][batch]
        pin = spec['catalogs'][group]
    except KeyError as exc:
        raise ArchiveError('UNKNOWN_BATCH_OR_GROUP') from exc
    base = child(root, spec['relative_path'])
    path = child(base, pin['path'])
    if sha256(path) != pin['sha256']:
        raise ArchiveError('CATALOG_SHA256_MISMATCH')
    catalog = read_json(path)
    if catalog.get('schema_version') != 2 or catalog.get('group') != group:
        raise ArchiveError('CATALOG_SCHEMA_OR_GROUP_MISMATCH')
    return spec, base, path, catalog


def run(args):
    registry = read_json(REGISTRY)
    if registry.get('schema_version') != 1:
        raise ArchiveError('REGISTRY_SCHEMA_UNSUPPORTED')
    root = locate(registry)
    if args.command == 'status':
        return {'status': 'PASS', 'archive_root': str(root),
                'volume_uuid': registry['volume_uuid'],
                'batches': list(registry['batches']), 'deletion': 'NOT_PERFORMED'}
    if not args.batch or not args.group:
        raise ArchiveError('--batch AND --group REQUIRED')
    spec, base, catalog_path, catalog = catalog_for(
        registry, root, args.batch, args.group)
    if args.command == 'list':
        return {'status': 'PASS', 'group': args.group,
                'candidates': [row['candidate'] for row in catalog['candidates']]}
    if not args.candidate or not args.output:
        raise ArchiveError('--candidate AND --output REQUIRED')
    selected = [row for row in catalog['candidates'] if row['candidate'] == args.candidate]
    if len(selected) != 1:
        raise ArchiveError('UNKNOWN_OR_DUPLICATE_CANDIDATE')
    downloads = child(base, 'out')
    for asset in [catalog['shared_objects'], selected[0]['archive']]:
        path = child(downloads, asset['asset'])
        if path.stat().st_size != asset['bytes'] or sha256(path) != asset['sha256']:
            raise ArchiveError('ARCHIVE_ASSET_SHA256_MISMATCH')
    tool = child(base, spec['restore_tool']['path'])
    if sha256(tool) != spec['restore_tool']['sha256']:
        raise ArchiveError('RESTORE_TOOL_SHA256_MISMATCH')
    output = Path(args.output).absolute()
    no_links(output)
    if output.exists() or output.is_relative_to(Path('/Volumes')):
        raise ArchiveError('NEW_LOCAL_OUTPUT_REQUIRED')
    key = Path(args.key_file or catalog['key_file_local_only']).absolute()
    no_links(key)
    mode = key.stat()
    if (not stat.S_ISREG(mode.st_mode) or mode.st_uid != os.getuid()
            or stat.S_IMODE(mode.st_mode) != 0o600 or key.is_relative_to(Path('/Volumes'))):
        raise ArchiveError('LOCAL_OWNER_ONLY_0600_KEY_REQUIRED')
    if locate(registry) != root:
        raise ArchiveError('VOLUME_CHANGED_BEFORE_RESTORE')
    result = subprocess.run([
        sys.executable, str(tool), '--catalog', str(catalog_path),
        '--download-dir', str(downloads), '--candidate', args.candidate,
        '--key', str(key), '--output', str(output)], stdin=subprocess.DEVNULL)
    if result.returncode:
        raise ArchiveError('RESTORE_FAILED: 保留本机部分输出供诊断；重新接盘后使用新的输出目录')
    if locate(registry) != root:
        raise ArchiveError('VOLUME_CHANGED_AFTER_RESTORE: 本机输出待复核')
    report_path = output / (args.candidate + '.verification.json')
    report = read_json(report_path)
    if (report.get('status') != 'DECRYPT_EXTRACT_RECONSTRUCT_SHA256_PASS'
            or report.get('asset_sha256') != selected[0]['archive']['sha256']
            or report.get('shared_asset_sha256') != catalog['shared_objects']['sha256']):
        raise ArchiveError('RESTORE_REPORT_BINDING_MISMATCH')
    return {'status': 'PASS', 'restore_report': str(report_path),
            'restored_directory': str(output / 'restored' / args.candidate),
            'volume_uuid': registry['volume_uuid'], 'deletion': 'NOT_PERFORMED'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['status', 'list', 'restore'])
    parser.add_argument('--batch')
    parser.add_argument('--group')
    parser.add_argument('--candidate')
    parser.add_argument('--output')
    parser.add_argument('--key-file', help='Local mode-0600 key; never copied to the drive')
    args = parser.parse_args()
    try:
        print(json.dumps(run(args), ensure_ascii=False, indent=2))
        return 0
    except (ArchiveError, OSError, KeyError, ValueError) as exc:
        print(json.dumps({'status': 'BLOCKED', 'reason': str(exc)[:500],
                          'deletion': 'NOT_PERFORMED'}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
