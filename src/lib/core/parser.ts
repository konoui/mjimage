import { Lexer } from "./lexer";
import { BLOCK, OPERATOR, TYPE, INPUT_SEPARATOR, TILE_CONTEXT } from "./";

type Separator = typeof INPUT_SEPARATOR;

export const tileSortFunc = (i: Tile, j: Tile) => {
  if (i.t == j.t) {
    if (i.n == 0) return 5 - j.n;
    if (j.n == 0) return i.n - 5;
    return i.n - j.n;
  }

  const lookup: Record<Type, number> = {
    [TYPE.M]: 1,
    [TYPE.P]: 2,
    [TYPE.S]: 3,
    [TYPE.Z]: 4,
    [TYPE.BACK]: 5,
  };
  return lookup[i.t] - lookup[j.t];
};

export type Type = (typeof TYPE)[keyof typeof TYPE];

export function isType(v: string): [Type, boolean] {
  for (let t of Object.values(TYPE)) {
    if (t == v) {
      return [t, true];
    }
  }
  return [TYPE.BACK, false];
}

type Operator = (typeof OPERATOR)[keyof typeof OPERATOR];

// Tile is a immutable object
export class Tile {
  constructor(
    public readonly t: Type,
    public readonly n: number,
    public readonly ops: Operator[] = []
  ) {}

  static from(s: string) {
    const tiles = new Parser(s).tiles();
    if (tiles.length != 1) throw new Error(`input is not single tile ${s}`);
    return tiles[0];
  }

  toString(): string {
    if (this.t === TYPE.BACK) return this.t;
    return `${this.ops.join("")}${this.n}${this.t}`;
  }

  clone(override?: {
    t?: Type;
    n?: number;
    remove?: Operator;
    add?: Operator;
  }) {
    const t = override?.t ?? this.t;
    const n = override?.n ?? this.n;
    const ops = this.ops.filter((v) => !override?.remove?.includes(v));
    const s = new Set([...ops]);
    if (override?.add) s.add(override.add);
    return new Tile(t, n, Array.from(s));
  }

  has(op: Operator) {
    return this.ops.includes(op);
  }

  isNum() {
    return this.t == TYPE.M || this.t == TYPE.P || this.t == TYPE.S;
  }

  equals(t: Tile, ignoreRed: boolean = false): boolean {
    let ok = this.n == t.n;
    if (ignoreRed)
      ok ||= (this.n == 5 && t.n == 0) || (this.n == 0 && t.n == 5);
    return this.t == t.t && ok;
  }

  imageSize(scale: number): {
    width: number;
    height: number;
    baseWidth: number;
    baseHeight: number;
  } {
    const h = parseFloat((TILE_CONTEXT.HEIGHT * scale).toPrecision(5));
    const w = parseFloat((TILE_CONTEXT.WIDTH * scale).toPrecision(5));
    const size = this.has(OPERATOR.HORIZONTAL)
      ? { width: h, height: w, baseWidth: w, baseHeight: h }
      : { width: w, height: h, w, baseWidth: w, baseHeight: h };
    if (this.has(OPERATOR.TSUMO) || this.has(OPERATOR.DORA))
      size.width += w * TILE_CONTEXT.TEXT_SCALE; // note not contains text height
    return size;
  }
}

type BLOCK = (typeof BLOCK)[keyof typeof BLOCK];

export class Block {
  constructor(public tiles: Tile[], public type: BLOCK) {
    if (type == BLOCK.CHI) {
      tiles.sort((a: Tile, b: Tile) => {
        if (a.has(OPERATOR.HORIZONTAL)) return -1;
        if (b.has(OPERATOR.HORIZONTAL)) return 1;
        return tileSortFunc(a, b);
      });
      return;
    }
    if (type == BLOCK.SHO_KAN) {
      return;
    }
    if (type != BLOCK.DISCARD) {
      tiles.sort(tileSortFunc);
    }
  }

  toString(): string {
    const sameType = this.tiles.every((v) => v.t == this.tiles[0].t);

    let ret = "";
    if (sameType) {
      if (this.tiles[0].t == TYPE.BACK) return this.tiles.join("");
      for (let v of this.tiles) {
        ret += v.toString().slice(0, -1);
      }
      return `${ret}${this.tiles[0].t}`;
    }
    for (const t of this.tiles) ret += t.toString();
    return ret;
  }

  is(type: BLOCK): boolean {
    return this.type == type;
  }

  isCalled(): boolean {
    return [
      BLOCK.PON.toString(),
      BLOCK.CHI.toString(),
      BLOCK.AN_KAN.toString(),
      BLOCK.DAI_KAN.toString(),
      BLOCK.SHO_KAN.toString(),
    ].includes(this.type.toString());
  }

  minTile(): Tile {
    if (this.is(BLOCK.CHI)) return this.clone().tiles.sort(tileSortFunc)[0];
    if (this.is(BLOCK.HAND))
      throw new Error(`[debug] mintile() is called with ${this.toString()}`);
    return this.tiles[0];
  }

  // clone the block with the operators
  clone() {
    const tiles = this.tiles.map((t) => new Tile(t.t, t.n, [...t.ops]));
    return blockWrapper(tiles, this.type);
  }

  // user must multiple scale
  // TODO scale is optional
  imageSize(scale: number): { width: number; height: number } {
    const bh = this.tiles[0].imageSize(scale).baseHeight;
    const bw = this.tiles[0].imageSize(scale).baseWidth;
    if (this.is(BLOCK.SHO_KAN))
      return { width: bw * 2 + bh, height: Math.max(bw * 2, bh) };

    const maxHeight = this.tiles.reduce((max: number, t: Tile) => {
      const h = t.imageSize(scale).height;
      return h > max ? h : max;
    }, 0);
    const sumWidth = this.tiles.reduce((sum: number, t: Tile) => {
      return sum + t.imageSize(scale).width;
    }, 0);
    return { width: sumWidth, height: maxHeight };
  }
}

export class BlockChi extends Block {
  constructor(tiles: [Tile, Tile, Tile]) {
    super(tiles, BLOCK.CHI);
  }
}

export class BlockPon extends Block {
  constructor(tiles: [Tile, Tile, Tile]) {
    super(tiles, BLOCK.PON);
  }
}

// FIXME red handling
// TODO consider tiles should return back tiles or original non back tiles
// when using hand to inc with tiles, returned tile must be original tile.
export class BlockAnKan extends Block {
  constructor(tiles: Tile[]) {
    super(tiles, BLOCK.AN_KAN);
  }

  toString() {
    const tiles = this.tiles.map((t) => t.clone());
    if (!tiles.some((v) => v.t == TYPE.BACK)) {
      tiles[0] = new Tile(TYPE.BACK, 0);
      tiles[3] = new Tile(TYPE.BACK, 0);
    }
    return tiles.reduce((s: string, t: Tile) => {
      return `${s}${t.toString()}`;
    }, "");
  }
}

export class BlockDaiKan extends Block {
  constructor(tiles: Tile[]) {
    super(tiles, BLOCK.DAI_KAN);
  }
}

export class BlockShoKan extends Block {
  constructor(tiles: Tile[]) {
    super(tiles, BLOCK.SHO_KAN);
  }
}

export class BlockPair extends Block {
  constructor(tile1: Tile, tile2: Tile) {
    super([tile1, tile2], BLOCK.PAIR);
  }
}

class BlockSet extends Block {
  constructor(tiles: [Tile, Tile, Tile]) {
    super(tiles, BLOCK.SET);
  }
}

export class BlockThree extends BlockSet {
  constructor(tiles: [Tile, Tile, Tile]) {
    super(tiles);
  }
}

export class BlockRun extends BlockSet {
  constructor(tiles: [Tile, Tile, Tile]) {
    super(tiles);
  }
}

export class BlockIsolated extends Block {
  constructor(tile: Tile) {
    super([tile], BLOCK.ISOLATED);
  }
}

export const blockWrapper = (
  tiles: Tile[],
  type: BLOCK
):
  | Block
  | BlockChi
  | BlockPon
  | BlockAnKan
  | BlockDaiKan
  | BlockShoKan
  | BlockPair
  | BlockSet
  | BlockIsolated => {
  switch (type) {
    case BLOCK.CHI:
      return new BlockChi([tiles[0], tiles[1], tiles[2]]);
    case BLOCK.PON:
      return new BlockPon([tiles[0], tiles[1], tiles[2]]);
    case BLOCK.AN_KAN:
      return new BlockAnKan(tiles);
    case BLOCK.DAI_KAN:
      return new BlockDaiKan(tiles);
    case BLOCK.SHO_KAN:
      return new BlockShoKan(tiles);
    case BLOCK.SET:
      if (tiles[0].equals(tiles[1], true))
        return new BlockThree(tiles as [Tile, Tile, Tile]);
      return new BlockRun(tiles as [Tile, Tile, Tile]);
    case BLOCK.PAIR:
      return new BlockPair(tiles[0], tiles[1]);
    case BLOCK.ISOLATED:
      return new BlockIsolated(tiles[0]);
    default:
      return new Block(tiles, type);
  }
};

export class Parser {
  readonly maxInputLength = 600;
  constructor(readonly input: string) {
    this.input = input.replace(/\s/g, "");
  }

  parse() {
    const parsed = this.tileSeparators();
    return this.makeBlocks(parsed);
  }

  tiles(): Tile[] {
    return this.tileSeparators().filter((v) => v != INPUT_SEPARATOR) as Tile[];
  }

  tileSeparators(): (Tile | Separator)[] {
    const l = new Lexer(this.input);
    const res: (Tile | Separator)[] = [];
    let cluster: Tile[] = [];

    this.validate(this.input);
    for (;;) {
      l.skipWhitespace();
      let char = l.char;
      if (char === l.eof) break;

      if (char == INPUT_SEPARATOR) {
        res.push(INPUT_SEPARATOR);
        l.readChar(); // for continue
        continue;
      }

      let [type, isType] = isTypeAlias(char, cluster);
      if (isType) {
        if (type == TYPE.BACK) {
          res.push(new Tile(type, 0));
          l.readChar(); // for continue
          continue;
        }

        res.push(...makeTiles(cluster, type));
        cluster = []; // clear for zero length slice
        l.readChar(); // for continue
        continue;
      } else {
        const [t, isOp] = isOperator(l);
        if (isOp) {
          cluster.push(t);
          l.readChar(); // for continue
          continue;
        }
        const [n, isNum] = isNumber(char);
        if (!isNum)
          throw new Error(
            `encounter unexpected number. n: ${n}, current: ${char}, input: ${l.input}`
          );
        // dummy type
        cluster.push(new Tile(TYPE.BACK, n));
      }
      l.readChar();
    }

    if (cluster.length > 0)
      throw new Error(`remaining values ${cluster.toString()}`);
    return res;
  }

  private makeBlocks(tiles: (Tile | Separator)[]) {
    let cluster: Tile[] = [];
    const res: (
      | Block
      | BlockChi
      | BlockPon
      | BlockAnKan
      | BlockDaiKan
      | BlockShoKan
    )[] = [];

    if (tiles.length == 0) return res;

    for (const t of tiles) {
      if (t == INPUT_SEPARATOR) {
        const type = detectBlockType(cluster);
        const b = blockWrapper(cluster, type);
        res.push(b);
        cluster = [];
        continue;
      }
      cluster.push(t);
    }

    // handle last block
    const type = detectBlockType(cluster);
    const b = blockWrapper(cluster, type);
    res.push(b);
    cluster = [];
    return res;
  }

  validate(input: string) {
    if (input.length == 0) return;
    if (input.length > this.maxInputLength)
      throw new Error(`exceeded maximum input length(${input.length})`);
    const lastChar = input.charAt(input.length - 1);
    // Note: dummy tile for validation
    const [_, isKind] = isTypeAlias(lastChar, [new Tile(TYPE.BACK, 1)]);
    if (!isKind)
      throw new Error(`last character(${lastChar}) is not type value`);
  }
}

function detectBlockType(tiles: Tile[]): BLOCK {
  if (tiles.length === 0) return BLOCK.UNKNOWN;
  if (tiles.length === 1) {
    if (tiles[0].has(OPERATOR.DORA)) return BLOCK.DORA;
    if (tiles[0].has(OPERATOR.TSUMO)) return BLOCK.TSUMO;
    return BLOCK.HAND; // 単騎
  }

  const sameAll = tiles.every((v) => v.equals(tiles[0], true));
  const numOfHorizontals = tiles.filter((v) =>
    v.has(OPERATOR.HORIZONTAL)
  ).length;
  const numOfTsumoDoraTiles = tiles.filter(
    (v) => v.has(OPERATOR.TSUMO) || v.has(OPERATOR.DORA)
  ).length;
  const numOfBackTiles = tiles.filter((v) => v.t == TYPE.BACK).length;

  if (numOfTsumoDoraTiles > 0) return BLOCK.UNKNOWN;

  if (numOfHorizontals == 0 && numOfBackTiles == 0) return BLOCK.HAND;

  if (tiles.length === 3 && numOfBackTiles === 0) {
    if (sameAll) return BLOCK.PON;
    if (numOfHorizontals == 1 && areConsecutiveTiles(tiles)) return BLOCK.CHI;
    return BLOCK.DISCARD;
  }

  if (tiles.length == 4 && numOfBackTiles == 2) return BLOCK.AN_KAN;
  if (tiles.length == 4 && sameAll) {
    if (numOfHorizontals == 1) return BLOCK.DAI_KAN;
    if (numOfHorizontals == 2) return BLOCK.SHO_KAN;
  }

  if (numOfHorizontals == 1) return BLOCK.DISCARD;

  return BLOCK.UNKNOWN;
}

function areConsecutiveTiles(tiles: Tile[]): boolean {
  tiles = tiles.map((t) => t.clone()).sort(tileSortFunc);
  for (let i = 0; i < tiles.length - 1; i++) {
    let n = tiles[i].n,
      np = tiles[i + 1].n;
    const type = tiles[i].t,
      kp = tiles[i + 1].t;
    if (n == 0) n = 5;
    if (np == 0) np = 5;
    if (type !== kp) return false;
    if (n + 1 !== np) return false;
  }
  return true;
}

function makeTiles(cluster: Tile[], k: Type): Tile[] {
  return cluster.map((v) => {
    return new Tile(k, v.n, v.ops);
  });
}

function isTypeAlias(s: string, cluster: Tile[]): [Type, boolean] {
  const [k, ok] = isType(s);
  if (ok) return [k, true];

  const isAlias = s === "w" || s === "d";
  if (isAlias && cluster.length > 0) {
    for (let i = 0; i < cluster.length; i++) {
      // convert alias
      if (s === "d") {
        cluster[i] = cluster[i].clone({ n: cluster[i].n + 4 });
      }
    }
    return [TYPE.Z, true];
  }
  return [TYPE.BACK, false];
}

function isNumber(v: string): [number, boolean] {
  const valid = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
  return [Number(v), valid.includes(v)];
}

// isOperator will consume char if the next is an operator
function isOperator(l: Lexer): [Tile, boolean] {
  const ops = Object.values(OPERATOR) as string[];
  if (!ops.includes(l.char)) return [new Tile(TYPE.BACK, 0), false];

  const found: Operator[] = [];
  // 4 is temporary value
  for (let i = 0; i < 4; i++) {
    const c = l.peekCharN(i);
    if (ops.includes(c)) found.push(c as Operator);
    else {
      const [n, ok] = isNumber(c);
      if (!ok) break;
      for (let i = 0; i < found.length; i++) l.readChar();
      return [new Tile(TYPE.BACK, n, found), true];
    }
  }
  return [new Tile(TYPE.BACK, 0), false];
}
