/**
 * 条件が満たされない場合に例外を投げる。
 * message を省くと理由の分からない Error になるため、既定の文言を持たせる。
 */
export function assert(
  condition: unknown,
  message = "assertion failed"
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
