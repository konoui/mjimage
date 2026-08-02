/**
 * 対局の進行ログの出し先。
 * 既定は console だが、テストや組み込み先の都合で差し替えられる。
 */
export interface Logger {
  debug(...args: readonly unknown[]): void;
  warn(...args: readonly unknown[]): void;
  error(...args: readonly unknown[]): void;
}

export const consoleLogger: Logger = {
  debug: (...args) => console.debug(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};

/** 何も出さないロガー。 */
export const silentLogger: Logger = {
  debug: () => {},
  warn: () => {},
  error: () => {},
};
