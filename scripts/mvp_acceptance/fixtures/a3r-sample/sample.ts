export interface UserRecord {
  id: string;
  displayName: string;
}

export function normalizeDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function indexUsers(records: readonly UserRecord[]): Map<string, UserRecord> {
  const result = new Map<string, UserRecord>();
  for (const record of records) {
    result.set(record.id, {
      ...record,
      displayName: normalizeDisplayName(record.displayName),
    });
  }
  return result;
}
