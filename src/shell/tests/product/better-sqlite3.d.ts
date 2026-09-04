// 测试专用类型声明：真实 better-sqlite3 adapter（D-014，dev 测试用途）。
declare module 'better-sqlite3' {
  interface DatabaseConstructor {
    new (databasePath: string, options?: { readonly?: boolean; [key: string]: unknown }): {
      close(): void;
      exec(sql: string): unknown;
      prepare(sql: string): {
        run(...params: unknown[]): { changes: number | bigint };
        get(...params: unknown[]): unknown;
        all(...params: unknown[]): unknown[];
      };
    };
  }
  const Database: DatabaseConstructor;
  export default Database;
}
