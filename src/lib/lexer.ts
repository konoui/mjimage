export class Lexer {
  public input: string;
  public position: number;
  private nextPosition: number;
  public char: string;
  public readonly eof = "\0"; // Use '\0' to represent EOF
  constructor(input: string) {
    this.input = input;
    this.position = 0;
    this.nextPosition = 0;
    this.char = this.readChar();
  }

  public readChar(): string {
    if (this.nextPosition >= this.input.length) {
      // EOF
      this.char = this.eof;
      return this.char;
    } else {
      this.char = this.input[this.nextPosition];
    }
    this.position = this.nextPosition;
    this.nextPosition++;
    return this.char;
  }

  public peekChar(): string {
    if (this.nextPosition >= this.input.length) return this.eof;
    return this.input[this.nextPosition];
  }

  public peekCharN(n: number): string {
    if (n < 0) throw new Error("arg must be positive value");
    if (this.position + n >= this.input.length) return this.eof;
    return this.input[this.position + n];
  }

  public prevChar(): string {
    if (this.position >= this.input.length) return this.eof;

    if (this.position > 0) return this.input[this.position - 1];
    // unexpected case
    return this.eof;
  }

  public skipWhitespace(): void {
    while (this.isWhitespace(this.char)) {
      this.readChar();
    }
  }

  private isWhitespace(char: string): boolean {
    return /\s/.test(char);
  }
}
