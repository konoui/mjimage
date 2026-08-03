import { Lexer } from "../core/lexer";

describe("Lexer", () => {
  test("readChar は 1 文字ずつ進み、終端で eof を返す", () => {
    const l = new Lexer("0123456789");
    expect(l.char).toBe("0"); // 現在位置は構築時から入っている

    const read: string[] = [];
    for (let i = 0; i < 9; i++) read.push(l.readChar());
    expect(read.join("")).toBe("123456789");
    expect(l.readChar()).toBe(l.eof);
  });

  test("peekCharN は位置を進めずに先を読む", () => {
    const l = new Lexer("0123456789");
    expect(l.peekCharN(2)).toBe("2");
    expect(l.peekCharN(10)).toBe(l.eof); // 終端を越えたら eof
    expect(l.char).toBe("0"); // 覗いただけでは進まない
  });
});
