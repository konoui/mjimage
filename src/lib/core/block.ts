// barrel（./index.ts）は外向きの公開面。兄弟モジュールは実体を直接参照する。
import { BLOCK, INPUT_SEPARATOR, OP, TYPE, Type } from "./constants";
import {
  Tile,
  Separator,
  compareCalledTiles,
  compareTiles,
  is5Tile,
  scanTileSeparators,
} from "./tile";
import { assert } from "../assert";

/**
 * ブロックのモデルと、牌の並びからブロックを組み立てる規則。
 * 牌（tile.ts）だけに依存し、パーサ（parser.ts）には依存しない。
 */

/**
 * 入力の記法では区別できず、あがり計算の過程でだけ現れるブロック種別。
 * パーサはこれらを手牌として読むため、デシリアライズ時に種別を照合しない。
 */
const CALCULATED_BLOCK_TYPES: ReadonlySet<string> = new Set([
  BLOCK.PAIR,
  BLOCK.ISOLATED,
  BLOCK.THREE,
  BLOCK.RUN,
]);

export type BlockType = (typeof BLOCK)[keyof typeof BLOCK];

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
    const blocks = makeBlocks(scanTileSeparators(tiles));
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
    // 計算の過程でだけ現れる種別は、パーサが手牌として読むため型を照合しない。
    if (!CALCULATED_BLOCK_TYPES.has(v.type) && b.type != v.type)
      throw new Error(
        `expected type ${v.type} but got ${b.type}: ${v.tiles}`
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
   * 刻子もしくは槓子の場合 true を返す。
   * ポン・暗刻・暗槓・小明槓・大明槓が該当する。
   */
  isTriplet(): boolean {
    switch (this._type) {
      case BLOCK.PON:
      case BLOCK.THREE:
      case BLOCK.AN_KAN:
      case BLOCK.SHO_KAN:
      case BLOCK.DAI_KAN:
        return true;
      default:
        return false;
    }
  }

  /**
   * 槓子の場合 true を返す。
   */
  isQuad(): boolean {
    switch (this._type) {
      case BLOCK.AN_KAN:
      case BLOCK.SHO_KAN:
      case BLOCK.DAI_KAN:
        return true;
      default:
        return false;
    }
  }

  /**
   * 順子の場合 true を返す。手牌の順子とチーが該当する。
   */
  isSequence(): boolean {
    return this._type == BLOCK.RUN || this._type == BLOCK.CHI;
  }

  /**
   * 暗刻の場合 true を返す。暗槓を含み、ロン牌を含むものは除く。
   */
  isConcealedTriplet(): boolean {
    if (this._type != BLOCK.AN_KAN && this._type != BLOCK.THREE) return false;
    return !this.tiles.some((t) => t.has(OP.RON));
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
    // 何の牌をカンしたのか分からなくなるため、全てが裏牌の並びは受け付けない。
    assert(
      nonBacks.length > 0,
      `an-kan block must have at least one face-up tile: ${tiles.join("")}`
    );
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
    case BLOCK.CHI: {
      const h = tiles.find((t) => t.has(OP.HORIZONTAL));
      assert(h != null, `chi block does not have horizontal ops: ${tiles}`);
      const others = tiles.filter((t) => !t.has(OP.HORIZONTAL));
      return new BlockChi([h, others[0], others[1]]);
    }
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

  // ここに来る時点で numTsumoDora は 0（先頭で UNKNOWN として返している）
  return BLOCK.IMAGE_DISCARD;
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

/**
 * 走査結果を区切り文字ごとのブロックへ組み立てる。
 * Parser と Block.from が共用する（暗黙のツモブロックは Parser 側の関心）。
 */
export const makeBlocks = (
  tiles: readonly (Tile | Separator)[]
): readonly Block[] => {
  let cluster: Tile[] = [];
  const res: Block[] = [];

  if (tiles.length == 0) return res;

  // 区切り文字が先頭にある/連続している場合に牌ゼロ枚のブロックを作らない。
  // 空のブロックは描画時に tiles[0] を参照して落ちる。
  const push = (tiles: readonly Tile[]) => {
    if (tiles.length == 0) return;
    res.push(blockWrapper(tiles, detectBlockType(tiles)));
  };

  for (const t of tiles) {
    if (t == INPUT_SEPARATOR) {
      push(cluster);
      cluster = [];
      continue;
    }
    cluster.push(t);
  }

  // handle last block
  push(cluster);
  return res;
};
