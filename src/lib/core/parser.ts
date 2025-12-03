import { Lexer } from "./lexer";
import { BLOCK, OP, TYPE, INPUT_SEPARATOR, Type, Operator } from "./";
import { assert } from "./../myassert";
type Separator = typeof INPUT_SEPARATOR;

/**
 * 各種牌と数字を比較する。
 * 手牌中の種類、牌のソート時に使用する。
 */
export const compareTiles = (i: Tile, j: Tile) => {
  if (i.t == j.t) {
    if (is5Tile(i) && is5Tile(j)) {
      if (i.has(OP.RED)) return -1;
      if (j.has(OP.RED)) return 1;
    }
    return i.n - j.n;
  }

  const typeOrder = [TYPE.M, TYPE.P, TYPE.S, TYPE.Z, TYPE.BACK];
  return typeOrder.indexOf(i.t) - typeOrder.indexOf(j.t);
};

/**
 * オペレータを比較する。
 * ソート時に使用する。
 */
const compareOperators = (i: Operator, j: Operator) => {
  const operatorOrder = [
    OP.HORIZONTAL,
    OP.TSUMO,
    OP.RON,
    OP.IMAGE_DORA,
    OP.COLOR_GRAYSCALE,
    OP.RED,
  ];
  return operatorOrder.indexOf(i) - operatorOrder.indexOf(j);
};

/**
 * 鳴いた牌をソートする。
 * 具体的に鳴いた牌の場所を維持しつつ、その他の牌をソートする。
 */
export const compareCalledTiles = (arr: readonly Tile[]) => {
  const indexes: number[] = [];
  arr.forEach((t, index) => {
    if (t.has(OP.HORIZONTAL)) {
      indexes.push(index);
    }
  });

  const sorted = arr.filter((v) => !v.has(OP.HORIZONTAL)).sort(compareTiles);

  indexes.forEach((index) => {
    sorted.splice(index, 0, arr[index]);
  });
  return sorted;
};

/**
 * 赤牌を含む 5m/5p/5s の場合 true を返す。
 */
export function is5Tile(t: Tile) {
  return t.isNum() && t.n == 5;
}

function isType(v: string): [Type, boolean] {
  const type = Object.values(TYPE).find((t) => t === v);
  return type ? [type, true] : [TYPE.BACK, false];
}

export class Tile {
  constructor(
    public readonly t: Type,
    public readonly n: number,
    public readonly ops: readonly Operator[] = []
  ) {}

  /**
   * 一つの牌を表す文字列から牌を返す。
   */
  static from(s: string) {
    const tiles = new Parser(s).tiles();
    if (tiles.length != 1) throw new Error(`input must be a single tile: ${s}`);
    return tiles[0];
  }

  /**
   * 文字列の牌を返す。
   */
  toString(): string {
    if (this.t === TYPE.BACK) return this.t;
    return `${[...this.ops].sort(compareOperators).join("")}${this.n}${this.t}`;
  }

  toJSON() {
    return this.toString();
  }

  /**
   * 牌の情報を上書きしたイミュータブルな新しい牌を返す。
   */
  clone(override?: {
    t?: Type;
    n?: number;
    remove?: Operator | Operator[];
    add?: Operator | Operator[];
    removeAll?: boolean;
  }) {
    const t = override?.t ?? this.t;
    const n = override?.n ?? this.n;

    const ops = override?.removeAll
      ? []
      : this.ops.filter((v) =>
          Array.isArray(override?.remove)
            ? !override.remove.includes(v)
            : override?.remove != v
        );

    const s = new Set([...ops]);
    if (override?.add) {
      if (Array.isArray(override.add)) override.add.forEach((op) => s.add(op));
      else s.add(override.add);
    }
    return new Tile(t, n, Array.from(s));
  }

  /**
   * 指定したオペレータを持つ場合 true を返す。
   */
  has(op: Operator) {
    return this.ops.includes(op);
  }

  /**
   * 数牌である場合 true を返す。
   * false の場合、字牌もしくは裏牌のどちらかとなる。
   */
  isNum() {
    return this.t == TYPE.M || this.t == TYPE.P || this.t == TYPE.S;
  }

  /**
   * 同じ牌の場合 true を返す。
   * オペレーターの比較判定は行わない。
   */
  equals(t: Tile): boolean {
    if (t.t == TYPE.BACK && this.t == TYPE.BACK) return true;
    return this.t == t.t && this.n == t.n;
  }
}

type BlockType = (typeof BLOCK)[keyof typeof BLOCK];

export type SerializedBlock = ReturnType<Block["serialize"]>;

export abstract class Block {
  private readonly _tiles: readonly Tile[];
  private readonly _type;

  constructor(tiles: readonly Tile[], type: BlockType) {
    this._tiles = tiles;
    this._type = type;
    if (this.isCalled()) {
      this._tiles = compareCalledTiles(this._tiles);
      return;
    }

    if (this._type != BLOCK.IMAGE_DISCARD) {
      this._tiles = [...this._tiles].sort(compareTiles);
      return;
    }
  }

  /**
   * 文字列からブロックを生成する。
   * 暗黙的なツモブロックには対応しない。
   */
  static from(tiles: string) {
    // Note controller pass tiles with tsumo op to deserialize run/three block of win result hand.
    // e.g.) win result hand: 1t23p123s132m77s, 1t23p is passed to run block.
    const blocks = new Parser(tiles, {
      enableImplicitTsumoBlock: false,
    }).parse();
    if (blocks.length != 1)
      throw new Error(
        `expected exactly 1 block but got ${blocks.length}: ${tiles}`
      );
    return blocks[0];
  }

  /**
   * シリアライズされた情報をデシリアライズしブロックを返す。
   */
  static deserialize(v: SerializedBlock) {
    const b = Block.from(v.tiles);
    const gotType = b.type;
    // TODO parse detect followings as hand
    if (
      !(
        v.type == BLOCK.PAIR ||
        v.type == BLOCK.ISOLATED ||
        v.type == BLOCK.THREE ||
        v.type == BLOCK.RUN
      )
    )
      if (gotType != v.type)
        throw new Error(
          `"expected type ${v.type} but got ${gotType}: ${v.tiles}`
        );
    return blockWrapper(b.tiles, v.type);
  }

  /**
   * 現在のブロックをシリアライズしその値を返す。
   */
  serialize() {
    return {
      tiles: this.toString(),
      type: this.type,
    };
  }

  toJSON() {
    return this.serialize();
  }

  /**
   * ブロックのタイプを返す。
   */
  get type() {
    return this._type;
  }

  /**
   * ブロックを構成する牌の配列を返す。
   */
  get tiles(): readonly Tile[] {
    return this._tiles;
  }

  /**
   * ブロックを文字列として返す。
   */
  abstract toString(): string;

  /**
   * 指定したブロックタイプの場合 true を返す。
   */
  is(type: BlockType): boolean {
    return this._type == type;
  }

  /**
   * 鳴いた（晒した）ブロックの場合 true を返す。
   */
  isCalled(): boolean {
    switch (this._type) {
      case BLOCK.PON:
      case BLOCK.CHI:
      case BLOCK.DAI_KAN:
      case BLOCK.SHO_KAN:
      case BLOCK.AN_KAN:
        return true;
      default:
        return false;
    }
  }

  /**
   * 同じイミュータブルな新しいブロックを生成する。
   * オペレータも同じになる。
   */
  clone(override?: {
    replace?: {
      idx: number;
      tile: Tile;
    };
  }) {
    const rp = override?.replace;
    const tiles = [...this.tiles];
    if (rp) tiles[rp.idx] = rp.tile;
    return blockWrapper(tiles, this._type);
  }
}

const toStringForSame = (tiles: readonly Tile[]) => {
  if (tiles[0].t === TYPE.BACK) return tiles.join("");
  const numbers = tiles.map((v) => v.toString().slice(0, -1)).join("");
  return `${numbers}${tiles[0].t}`;
};

const toStringForHand = (tiles: readonly Tile[]) => {
  if (tiles.length == 0) return "";
  let preType: Type = tiles[0].t;
  let ret = "";
  for (const tile of tiles) {
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

  static from(s: string) {
    return Block.deserialize({ tiles: s, type: BLOCK.CHI }) as BlockChi;
  }

  toString(): string {
    return toStringForSame(this.tiles);
  }
}

export class BlockPon extends Block {
  constructor(tiles: readonly [Tile, Tile, Tile]) {
    super(tiles, BLOCK.PON);
  }

  static from(s: string) {
    return Block.deserialize({ tiles: s, type: BLOCK.PON }) as BlockPon;
  }

  toString(): string {
    return toStringForSame(this.tiles);
  }
}

// BlockAnkan store tiles as number tiles
// if getting tiles including back tile, to use tilesWithBack
export class BlockAnKan extends Block {
  constructor(tiles: readonly Tile[]) {
    const nonBacks = tiles.filter((v) => v.t != TYPE.BACK);
    const s = nonBacks[0];
    // 内部では裏牌ではなく同じ牌として保持する。
    if (nonBacks.length < tiles.length) {
      if (is5Tile(s)) {
        const t = new Tile(s.t, 5);
        super([t.clone({ add: OP.RED }), t, t, t], BLOCK.AN_KAN);
        return;
      }
      super([s, s, s, s], BLOCK.AN_KAN);
      return;
    }
    super(tiles, BLOCK.AN_KAN);
  }

  /**
   * ブロックを構成する全て表向きの牌の配列を返す。
   */
  get tiles() {
    return super.tiles;
  }

  /**
   * ブロックを構成する裏返しの牌を含む牌の配列を返す。
   */
  get tilesWithBack() {
    const pick = this.tiles[0].clone({ remove: OP.RED });
    const sample = is5Tile(pick) ? pick.clone({ add: OP.RED }) : pick;
    return [new Tile(TYPE.BACK, 0), sample, pick, new Tile(TYPE.BACK, 0)];
  }

  static from(s: string) {
    return Block.deserialize({ tiles: s, type: BLOCK.AN_KAN }) as BlockAnKan;
  }

  toString(): string {
    return toStringForHand(this.tilesWithBack);
  }
}

export class BlockDaiKan extends Block {
  constructor(tiles: readonly Tile[]) {
    super(tiles, BLOCK.DAI_KAN);
  }

  static from(s: string) {
    return Block.deserialize({ tiles: s, type: BLOCK.DAI_KAN }) as BlockDaiKan;
  }

  toString(): string {
    return toStringForSame(this.tiles);
  }
}

/**
 * 小明槓のブロックを表す
 * new で生成する場合、ポンした牌の前にカカンした牌を追加する必要がある。
 * ポンブロックがある場合 fromPon を使用できる。
 */
export class BlockShoKan extends Block {
  constructor(tiles: readonly Tile[]) {
    super(tiles, BLOCK.SHO_KAN);
  }

  static from(s: string) {
    return Block.deserialize({ tiles: s, type: BLOCK.SHO_KAN }) as BlockShoKan;
  }

  /**
   * ポンしたブロックから小明槓を生成する。
   * カカンした牌はポンした牌の前に追加される。
   */
  static fromPon(b: BlockPon, t: Tile) {
    const idx = b.tiles.findIndex((t) => t.has(OP.HORIZONTAL));
    // add a tile to front of the pon tile
    const tiles = [...b.tiles];
    tiles.splice(idx, 0, t.clone({ add: OP.HORIZONTAL }));
    return new BlockShoKan(tiles);
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

  static from(s: string) {
    return Block.deserialize({ tiles: s, type: BLOCK.PAIR }) as BlockPair;
  }
}

export class BlockThree extends Block {
  constructor(tiles: readonly [Tile, Tile, Tile]) {
    super(tiles, BLOCK.THREE);
  }

  static from(s: string) {
    return Block.deserialize({ tiles: s, type: BLOCK.THREE }) as BlockThree;
  }

  toString(): string {
    return toStringForSame(this.tiles);
  }
}

export class BlockRun extends Block {
  constructor(tiles: readonly [Tile, Tile, Tile]) {
    super(tiles, BLOCK.RUN);
  }

  static from(s: string) {
    return Block.deserialize({ tiles: s, type: BLOCK.RUN }) as BlockRun;
  }

  toString(): string {
    return toStringForSame(this.tiles);
  }
}

export class BlockIsolated extends Block {
  constructor(tile: Tile) {
    super([tile], BLOCK.ISOLATED);
  }

  static from(s: string) {
    return Block.deserialize({
      tiles: s,
      type: BLOCK.ISOLATED,
    }) as BlockIsolated;
  }

  toString(): string {
    return this.tiles[0].toString();
  }
}

/**
 * TODO 計算時に使用する面前の手牌を想定しているが、SVG はそうではない。
 */
export class BlockHand extends Block {
  constructor(tiles: readonly Tile[]) {
    super(tiles, BLOCK.HAND);
  }

  static from(s: string) {
    return Block.deserialize({ tiles: s, type: BLOCK.HAND }) as BlockHand;
  }

  toString(): string {
    return toStringForHand(this.tiles);
  }
}

/**
 * ツモ・ドラといったその他のブロックを表す。
 */
export class BlockOther extends Block {
  constructor(tiles: readonly Tile[], type: BlockType) {
    super(tiles, type);
  }

  toString(): string {
    if (this.is(BLOCK.IMAGE_DISCARD)) return this.tiles.join("");
    return toStringForHand(this.tiles);
  }
}

const blockWrapper = (
  tiles: readonly Tile[],
  type: BlockType
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
      const h = tiles.find((t) => t.has(OP.HORIZONTAL));
      assert(h != null, `chi block does not have horizontal ops: ${tiles}`);
      const others = tiles.filter((t) => !t.has(OP.HORIZONTAL));
      return new BlockChi([h, others[0], others[1]]);
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

type TileBase = { n: number; ops?: readonly Operator[] };

/**
 * 文字列をパースし、牌やブロックを返すクラス
 * @param {boolean} options.enableImplicitTsumoBlock 手牌の中にツモオペレータがある場合、その牌をツモブロックとして扱う。
 * 手牌とは最初の区切り文字が現れるまでの牌の文字列を指す（区切り文字を使用したツモブロックが存在しないことが条件）。
 * ツモブロックは、手牌の次のブロックとなる（晒した牌の前となる）。
 */
export class Parser {
  readonly maxInputLength = 600;
  constructor(
    readonly input: string,
    readonly options: { enableImplicitTsumoBlock?: boolean } = {
      enableImplicitTsumoBlock: true,
    }
  ) {
    this.input = input.replace(/\s/g, "");
  }

  /**
   * パースしたブロックの配列を返す。
   */
  parse(): readonly Block[] {
    const parsed = this.tileSeparators();
    return this.makeBlocks(parsed);
  }

  /**
   * パースした牌の配列を返す。
   */
  tiles(): readonly Tile[] {
    return this.tileSeparators().filter((v) => v != INPUT_SEPARATOR);
  }

  /**
   * パースした牌もしくはセパレータ文字の配列を返す。
   * セパレータ前後は一つのブロックを意味する。
   */
  tileSeparators(): readonly (Tile | Separator)[] {
    const l = new Lexer(this.input);
    const res: (Tile | Separator)[] = [];
    let cluster: TileBase[] = [];

    this.validate(this.input);
    for (;;) {
      l.skipWhitespace();
      const char = l.char;
      if (char === l.eof) break;

      if (char == INPUT_SEPARATOR) {
        res.push(INPUT_SEPARATOR);
        l.readChar(); // for continue
        continue;
      }

      const [type, isType] = parseTypeOrAlias(char, cluster);
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
        if (!isNum) throw new Error(`expected a number but got: ${char}`);
        // dummy type
        cluster.push({ n });
      }
      l.readChar();
    }

    if (cluster.length > 0)
      throw new Error(`unexpected remaining values: ${cluster.toString()}`);
    return this.options.enableImplicitTsumoBlock ? this.reconstruct(res) : res;
  }

  private reconstruct(res: readonly (Tile | Separator)[]) {
    // 一般的な手牌数より多い場合処理しない。小さい場合は現状未定。
    if (res.length > 18) return res;
    const tIdx = res.findIndex((v) => v instanceof Tile && v.has(OP.TSUMO));
    if (tIdx < 0) return res;
    const sIdx = res.findIndex((v) => v === INPUT_SEPARATOR);
    // 最初の区切り文字が t op より後にあれば implicit block と判断できる。
    // それ以外の場合は、t op がツモブロックとして定義されていると判断できる。
    if (sIdx > -1 && tIdx > sIdx) return res;
    const handEnd = sIdx < 0 ? res.length : sIdx;
    const hand = res.slice(0, handEnd);
    const tsumo = hand[tIdx];
    // 横牌がある場合手牌ではない。
    if (hand.some((v) => v instanceof Tile && v.has(OP.HORIZONTAL))) return res;
    return [
      ...hand.slice(0, tIdx),
      ...hand.slice(tIdx + 1, handEnd),
      INPUT_SEPARATOR as Separator,
      tsumo,
      ...res.slice(handEnd),
    ];
  }

  private makeBlocks(tiles: readonly (Tile | Separator)[]): readonly Block[] {
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

  private validate(input: string) {
    if (input.length == 0) return;
    if (input.length > this.maxInputLength)
      throw new Error(`exceeded maximum input length (${input.length})`);
    const lastChar = input.charAt(input.length - 1);
    // Note: dummy tile for validation
    const [_, isKind] = parseTypeOrAlias(lastChar, [new Tile(TYPE.BACK, 1)]);
    if (!isKind)
      throw new Error(
        `last character must be a tile type: ${lastChar} in ${input}`
      );
  }
}

function detectBlockType(tiles: readonly Tile[]): BlockType {
  if (tiles.length === 0) return BLOCK.UNKNOWN;
  if (tiles.length === 1) {
    if (tiles[0].has(OP.IMAGE_DORA)) return BLOCK.IMAGE_DORA;
    if (tiles[0].has(OP.TSUMO)) return BLOCK.TSUMO;
    return BLOCK.HAND; // 単騎
  }

  const isAllSame = tiles.every((v) => v.equals(tiles[0]));
  const numHorizontals = tiles.filter((v) => v.has(OP.HORIZONTAL)).length;
  const numTsumoDora = tiles.filter(
    (v) => v.has(OP.TSUMO) || v.has(OP.IMAGE_DORA)
  ).length;
  const numBacks = tiles.filter((v) => v.t == TYPE.BACK).length;

  if (numTsumoDora > 0) return BLOCK.UNKNOWN;

  if (numHorizontals == 0 && numBacks == 0) return BLOCK.HAND;

  if (tiles.length === 3 && numBacks === 0) {
    if (isAllSame) return BLOCK.PON;
    if (numHorizontals == 1 && isConsecutiveSequence(tiles)) return BLOCK.CHI;
    return BLOCK.IMAGE_DISCARD;
  }

  if (tiles.length == 4 && numBacks == 2) return BLOCK.AN_KAN;
  if (tiles.length == 4 && isAllSame) {
    if (numHorizontals == 1) return BLOCK.DAI_KAN;
    if (numHorizontals == 2) return BLOCK.SHO_KAN;
  }

  if (numHorizontals == 1) return BLOCK.IMAGE_DISCARD;
  if (numTsumoDora == 0) return BLOCK.IMAGE_DISCARD;

  return BLOCK.UNKNOWN;
}

function isConsecutiveSequence(rtiles: readonly Tile[]): boolean {
  const tiles = [...rtiles].sort(compareTiles);
  if (tiles.some((t) => tiles[0].t != t.t)) return false;
  const numbers = tiles.map((t) => t.n);
  for (let i = 0; i < numbers.length - 1; i++) {
    if (numbers[i] != numbers[i + 1] - 1) return false;
  }
  return true;
}

function makeTiles(
  cluster: readonly TileBase[],
  k: Type
): readonly (Tile | Separator)[] {
  return cluster.map((v) => {
    let tile = new Tile(k, v.n, v.ops);
    // convert 0 alias to red operator
    if (tile.isNum() && tile.n == 0) tile = tile.clone({ n: 5, add: OP.RED });
    return tile;
  });
}

function parseTypeOrAlias(s: string, cluster: TileBase[]): [Type, boolean] {
  const [k, ok] = isType(s);
  if (ok) return [k, true];

  const isAlias = s === "w" || s === "d";
  if (isAlias && cluster.length > 0) {
    for (let i = 0; i < cluster.length; i++) {
      const t = cluster[i];
      if (s === "d") {
        cluster[i].n = t.n + 4;
      }
    }
    return [TYPE.Z, true];
  }
  return [TYPE.BACK, false];
}

function isNumber(v: string): [number, boolean] {
  const n = Number(v);
  const ok = 0 <= n && n <= 9;
  return [n, ok];
}

// isOperator will consume char if the next is an operator
function isOperator(l: Lexer): [TileBase, boolean] {
  const ops = Object.values(OP) as string[];
  if (!ops.includes(l.char)) return [new Tile(TYPE.BACK, 0), false];

  const found: Operator[] = [];
  // 4 is temporary value
  for (let i = 0; i < 4; i++) {
    const c = l.peekCharN(i);
    if (ops.includes(c)) found.push(c as Operator);
    else {
      const [n, ok] = isNumber(c);
      if (!ok) break;
      for (const _ of found) l.readChar();
      const tile = new Tile(TYPE.BACK, n, found);
      if (tile.has(OP.RED) && tile.n != 5)
        throw new Error(`red dora operator can only be used with 5, got: ${n}`);
      if (tile.has(OP.IMAGE_DORA) && tile.has(OP.TSUMO))
        throw new Error(`cannot specify both dora and tsumo operators`);
      return [tile, true];
    }
  }
  return [new Tile(TYPE.BACK, 0), false];
}
