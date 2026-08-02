import { listDirectory, readText, searchText } from './readonly';

/** Structural port consumed by Core without introducing a package cycle. */
export function createReadonlyWorkspacePort(workspaceRoot: string) {
  return {
    listDirectory: (input: Record<string, unknown>) => listDirectory({
      workspaceRoot,
      path: optionalString(input.path),
      maxEntries: optionalNumber(input.maxEntries),
      maxOutputBytes: optionalNumber(input.maxOutputBytes),
    }),
    readText: (input: Record<string, unknown>) => readText({
      workspaceRoot,
      path: requiredString(input.path, 'path'),
      encoding: optionalEncoding(input.encoding),
      startLine: optionalNumber(input.startLine),
      maxLines: optionalNumber(input.maxLines),
      maxOutputBytes: optionalNumber(input.maxOutputBytes),
    }),
    searchText: (input: Record<string, unknown>) => searchText({
      workspaceRoot,
      path: optionalString(input.path),
      pattern: requiredString(input.pattern, 'pattern'),
      maxMatches: optionalNumber(input.maxMatches),
      contextLines: optionalNumber(input.contextLines),
      maxOutputBytes: optionalNumber(input.maxOutputBytes),
    }),
  };
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new TypeError(`${name} must be a string`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return value === undefined ? undefined : requiredString(value, 'value');
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number') throw new TypeError('value must be a number');
  return value;
}

function optionalEncoding(value: unknown): 'utf-8' | 'gbk' | undefined {
  if (value === undefined) return undefined;
  if (value !== 'utf-8' && value !== 'gbk') throw new TypeError('encoding must be utf-8 or gbk');
  return value;
}
