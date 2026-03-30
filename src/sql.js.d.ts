declare module "sql.js" {
  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer | null) => Database;
  }

  interface Database {
    prepare(sql: string): Statement;
    close(): void;
  }

  interface Statement {
    bind(params?: Record<string, number | string | null>): boolean;
    step(): boolean;
    getAsObject(): Record<string, number | string | null>;
    free(): boolean;
  }

  interface InitSqlJsOptions {
    wasmBinary?: ArrayLike<number> | Buffer;
  }

  export default function initSqlJs(options?: InitSqlJsOptions): Promise<SqlJsStatic>;
  export { Database, Statement, SqlJsStatic };
}
