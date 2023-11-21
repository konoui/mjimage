import { describe, test, expect } from "@jest/globals";

import { Lexer } from "./../lexer";

describe("lexer", () => {
  test("0123456789", () => {
    const l = new Lexer("0123456789");
    expect(l.char).toBe("0");
    expect(l.peekChar()).toBe("1");
    expect(l.readChar()).toBe("1");
    expect(l.prevChar()).toBe("0");
    expect(l.readChar()).toBe("2");
    l.readChar();
    l.readChar();
    l.readChar();
    l.readChar();
    l.readChar();
    l.readChar();
    expect(l.readChar()).toBe("9");
    expect(l.prevChar()).toBe("8");
    expect(l.peekChar()).toBe(l.eof);
    expect(l.readChar()).toBe(l.eof);
    // FIXME expect(l.prevChar()).toBe("9");
    expect(l.peekChar()).toBe(l.eof);
  });
});
