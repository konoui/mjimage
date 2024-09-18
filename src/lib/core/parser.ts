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

function isType(v: string): [Type, boolean] {
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
    if (tiles.length != 1) throw new Error(`input is not a single tile ${s}`);
    return tiles[0];
  }

  toString(): string {
    if (this.t === TYPE.BACK) return this.t;
    return `${this.ops.join("")}${this.n}${this.t}`;
  }

  toJSON() {
    return this.toString();
  }

  clone(override?: {
    t?: Type;
    n?: number;
    remove?: Operator;
    add?: Operator;
  }) {
    const t = override?.t ?? this.t;
    const n = override?.n ?? this.n;
    const ops = this.ops.filter((v) => override?.remove != v);
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
    if (ignoreRed) ok ||= isNum5or0(this) && isNum5or0(t);
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

export function isNum5or0(t: Tile) {
  return isNum0(t) || isNum5(t);
}

export function isNum5(t: Tile) {
  return t.isNum() && t.n == 5;
}

export function isNum0(t: Tile) {
  return t.isNum() && t.n == 0;
}

type BLOCK = (typeof BLOCK)[keyof typeof BLOCK];

export type SerializedBlock = ReturnType<Block["serialize"]>;

// Block is a immutable object
export abstract class Block {
  private readonly _tiles: readonly Tile[];
  private readonly _type;
  constructor(tiles: readonly Tile[], type: BLOCK) {
    this._tiles = tiles;
    this._type = type;
    if (this._type == BLOCK.CHI) {
      this._tiles = [...this._tiles].sort((a: Tile, b: Tile) => {
        if (a.has(OPERATOR.HORIZONTAL)) return -1;
        if (b.has(OPERATOR.HORIZONTAL)) return 1;
        return tileSortFunc(a, b);
      });
      return;
    }
    if (this._type == BLOCK.SHO_KAN) {
      return;
    }
    if (this._type != BLOCK.IMAGE_DISCARD) {
      this._tiles = [...this._tiles].sort(tileSortFunc);
    }
  }

  static from(v: SerializedBlock) {
    const tiles = new Parser(v.tiles).tiles();
    return blockWrapper(tiles, v.type);
  }

  serialize() {
    return {
      tiles: this.toString(),
      type: this.type,
    };
  }

  toJSON() {
    return this.serialize();
  }

  get type() {
    return this._type;
  }

  get tiles(): readonly Tile[] {
    return this._tiles;
  }

  abstract toString(): string;

  is(type: BLOCK): boolean {
    return this._type == type;
  }

  isCalled(): boolean {
    return [
      BLOCK.PON.toString(),
      BLOCK.CHI.toString(),
      BLOCK.DAI_KAN.toString(),
      BLOCK.SHO_KAN.toString(),
      BLOCK.AN_KAN.toString(),
    ].includes(this._type.toString());
  }

  // clone the block with the operators
  clone(override?: {
    replace?: {
      idx: number;
      tile: Tile;
    };
  }) {
    const rp = override?.replace;
    let tiles = [...this.tiles];
    if (rp) tiles[rp.idx] = rp.tile;
    return blockWrapper(tiles, this._type);
  }

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

const toStringForSame = (tiles: readonly Tile[]) => {
  let ret = "";
  for (let v of tiles) {
    if (v.t == TYPE.BACK) return tiles.join("");
    ret += v.toString().slice(0, -1);
  }
  return `${ret}${tiles[0].t}`;
};

const toStringForHand = (tiles: readonly Tile[]) => {
  let preType: Type = tiles[0].t;
  let ret = "";
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    const type = tile.t;
    const nop =
      type == TYPE.BACK ? tile.toString() : tile.toString().slice(0, -1);

    if (type != preType) if (preType != TYPE.BACK) ret += preType;

    preType = type;
    ret += nop;
  }

  const last = tiles.at(-1)!;
  if (last.t != TYPE.BACK) ret += last.t;
  return ret;
};

export class BlockChi extends Block {
  constructor(tiles: readonly [Tile, Tile, Tile]) {
    super(tiles, BLOCK.CHI);
  }
  toString(): string {
    return toStringForSame(this.tiles);
  }
}

export class BlockPon extends Block {
  constructor(tiles: readonly [Tile, Tile, Tile]) {
    super(tiles, BLOCK.PON);
  }
  toString(): string {
    return toStringForSame(this.tiles);
  }
}

// BlockAnkan store tiles for number tiles
// if getting tiles with back tile, to use tilesWithBack
export class BlockAnKan extends Block {
  constructor(tiles: readonly Tile[]) {
    const ftiles = tiles.filter((v) => v.t != TYPE.BACK);
    const sample = ftiles[0];
    if (ftiles.length < tiles.length) {
      if (isNum5or0(sample)) {
        const t = new Tile(sample.t, 5);
        super([new Tile(sample.t, 0), t, t, t], BLOCK.AN_KAN);
        return;
      }
      super([sample, sample, sample, sample], BLOCK.AN_KAN);
      return;
    }
    super(tiles, BLOCK.AN_KAN);
  }

  get tilesWithBack() {
    const sample = this.tiles[0];
    if (isNum5or0(sample)) {
      return [
        new Tile(TYPE.BACK, 0),
        new Tile(sample.t, 0),
        new Tile(sample.t, 5),
        new Tile(TYPE.BACK, 0),
      ];
    }
    return [new Tile(TYPE.BACK, 0), sample, sample, new Tile(TYPE.BACK, 0)];
  }

  static override from(v: SerializedBlock) {
    return super.from(v) as BlockAnKan;
  }

  toString(): string {
    return toStringForHand(this.tilesWithBack);
  }
}

export class BlockDaiKan extends Block {
  constructor(tiles: readonly Tile[]) {
    super(tiles, BLOCK.DAI_KAN);
  }
  toString(): string {
    return toStringForSame(this.tiles);
  }
}

export class BlockShoKan extends Block {
  constructor(tiles: readonly Tile[]) {
    super(tiles, BLOCK.SHO_KAN);
  }
  toString(): string {
    return toStringForSame(this.tiles);
  }
}

export class BlockPair extends Block {
  constructor(tile1: Tile, tile2: Tile) {
    super([tile1, tile2], BLOCK.PAIR);
  }
  toString(): string {
    return toStringForSame(this.tiles);
  }
}

export class BlockThree extends Block {
  constructor(tiles: readonly [Tile, Tile, Tile]) {
    super(tiles, BLOCK.THREE);
  }
  toString(): string {
    return toStringForSame(this.tiles);
  }
}

export class BlockRun extends Block {
  constructor(tiles: readonly [Tile, Tile, Tile]) {
    super(tiles, BLOCK.RUN);
  }
  toString(): string {
    return toStringForSame(this.tiles);
  }
}

export class BlockIsolated extends Block {
  constructor(tile: Tile) {
    super([tile], BLOCK.ISOLATED);
  }
  toString(): string {
    return this.tiles[0].toString();
  }
}

export class BlockHand extends Block {
  constructor(tiles: readonly Tile[]) {
    super(tiles, BLOCK.HAND);
  }
  toString(): string {
    return toStringForHand(this.tiles);
  }
}

// block other means tsumo/dora etc...
export class BlockOther extends Block {
  constructor(tiles: readonly Tile[], type: BLOCK) {
    super(tiles, type);
  }

  toString(): string {
    if (this.is(BLOCK.IMAGE_DISCARD)) return this.tiles.join("");
    return toStringForHand(this.tiles);
  }
}

const blockWrapper = (
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
  | BlockRun
  | BlockThree
  | BlockHand
  | BlockIsolated
  | BlockOther => {
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
    case BLOCK.THREE:
      return new BlockThree(tiles as [Tile, Tile, Tile]);
    case BLOCK.RUN:
      return new BlockRun(tiles as [Tile, Tile, Tile]);
    case BLOCK.PAIR:
      return new BlockPair(tiles[0], tiles[1]);
    case BLOCK.ISOLATED:
      return new BlockIsolated(tiles[0]);
    case BLOCK.HAND:
      return new BlockHand(tiles);
    default:
      return new BlockOther(tiles, type);
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
      | BlockHand
      | BlockOther
      | BlockChi
      | BlockPon
      | BlockAnKan
      | BlockDaiKan
      | BlockShoKan
      | BlockThree
      | BlockRun
      | BlockIsolated
      | BlockPair
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
    if (tiles[0].has(OPERATOR.DORA)) return BLOCK.IMAGE_DORA;
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
    return BLOCK.IMAGE_DISCARD;
  }

  if (tiles.length == 4 && numOfBackTiles == 2) return BLOCK.AN_KAN;
  if (tiles.length == 4 && sameAll) {
    if (numOfHorizontals == 1) return BLOCK.DAI_KAN;
    if (numOfHorizontals == 2) return BLOCK.SHO_KAN;
  }

  if (numOfHorizontals == 1) return BLOCK.IMAGE_DISCARD;

  return BLOCK.UNKNOWN;
}

function areConsecutiveTiles(tiles: Tile[]): boolean {
  tiles = [...tiles].sort(tileSortFunc);
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
      const t = cluster[i];
      if (s === "d") {
        cluster[i] = t.clone({ n: t.n + 4 });
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
