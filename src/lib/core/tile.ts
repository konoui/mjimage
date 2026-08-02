import { Lexer } from "./lexer";
// barrel（./index.ts）は外向きの公開面。兄弟モジュールは実体を直接参照する。
import {
  OP,
  TYPE,
  TILE_NUMBERS,
  INPUT_SEPARATOR,
  Type,
  Operator,
} from "./constants";

/**
 * 牌の値と、その書き方（牌 1 枚単位の字句解析）。
 *
 * 「牌が何か」と「牌をどう書くか」を別のモジュールにすると、文字列から牌を作る
 * Tile.from が字句解析側を必要とし、字句解析側が Tile を必要とするため循環する。
 * この 2 つはここにまとめ、ブロック（block.ts）とパーサ（parser.ts）がこれを使う。
 */

/** ブロックの区切りを表す印。走査結果には牌に混ざってこれが現れる。 */
export type Separator = typeof INPUT_SEPARATOR;

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

/**
 * 文字が牌種を表す場合はその牌種を返す。エイリアス（w/d）は含まない。
 */
function tileTypeOf(c: string): Type | null {
  return Object.values(TYPE).find((t) => t === c) ?? null;
}

/**
 * オペレータを集合として正規化する。重複を畳み、並びを固定する。
 * 同じ牌が常に同じ並びを持つので、文字列にしたときの比較が安定する。
 */
const normalizeOperators = (ops: readonly Operator[]): readonly Operator[] =>
  [...new Set(ops)].sort(compareOperators);

export class Tile {
  readonly ops: readonly Operator[];
  constructor(
    public readonly t: Type,
    public readonly n: number,
    ops: readonly Operator[] = []
  ) {
    // 0 個・1 個なら畳む必要がない。牌は探索中に大量に作られるので、その分は避ける。
    this.ops = ops.length > 1 ? normalizeOperators(ops) : ops;
  }


  /**
   * 一つの牌を表す文字列から牌を返す。
   */
  static from(s: string) {
    const tiles = scanTileSeparators(s).filter((v) => v != INPUT_SEPARATOR);
    if (tiles.length != 1) throw new Error(`input must be a single tile: ${s}`);
    return tiles[0];
  }
  /**
   * 文字列の牌を返す。
   */
  toString(): string {
    if (this.t === TYPE.BACK) return this.t;
    // 並びはコンストラクタで固定済み。
    return `${this.ops.join("")}${this.n}${this.t}`;
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

/** パーサが受け付ける入力の最大長。 */
const MAX_INPUT_LENGTH = 600;

type TileBase = { n: number; ops?: readonly Operator[] };

/**
 * 入力が牌の並びとして読める形かを、走査を始める前に確かめる。
 */
function validateInput(input: string) {
  if (input.length == 0) return;
  if (input.length > MAX_INPUT_LENGTH)
    throw new Error(`exceeded maximum input length (${input.length})`);
  const lastChar = input.charAt(input.length - 1);
  if (tileTypeOf(lastChar) == null && aliasOffset(lastChar) == null)
    throw new Error(
      `last character must be a tile type: ${lastChar} in ${input}`
    );
}

/**
 * 文字列を走査し、牌と区切り文字の並びを返す。
 *
 * 牌の数字は牌種（末尾の m/p/s/z/_ とそのエイリアス）が現れて初めて確定するので、
 * 確定するまでは cluster に溜めておく。
 * 区切り文字はそのまま残す。ブロックへの組み立ては block.ts が行う。
 */
export const scanTileSeparators = (
  input: string
): readonly (Tile | Separator)[] => {
  const l = new Lexer(input);
  const res: (Tile | Separator)[] = [];
  let cluster: TileBase[] = [];

  validateInput(input);
  for (;;) {
    l.skipWhitespace();
    const char = l.char;
    if (char === l.eof) break;

    if (char == INPUT_SEPARATOR) {
      res.push(INPUT_SEPARATOR);
      l.readChar(); // for continue
      continue;
    }

    const resolved = resolveType(char, cluster);
    if (resolved != null) {
      if (resolved.type == TYPE.BACK) {
        res.push(new Tile(resolved.type, 0));
        l.readChar(); // for continue
        continue;
      }

      res.push(...makeTiles(resolved.cluster, resolved.type));
      cluster = []; // clear for zero length slice
      l.readChar(); // for continue
      continue;
    } else {
      const t = operatorTileAt(l);
      if (t != null) {
        cluster.push(t);
        l.readChar(); // for continue
        continue;
      }
      const n = numberOf(char);
      if (n == null) throw new Error(`expected a number but got: ${char}`);
      // dummy type
      cluster.push({ n });
    }
    l.readChar();
  }

  if (cluster.length > 0)
    throw new Error(`unexpected remaining values: ${cluster.toString()}`);
  return res;
};

/**
 * 牌種が確定した時点で値域を検証する。
 * パース中は型が未確定のプレースホルダ（TYPE.BACK）を使うため、数字だけでは
 * 8z のような存在しない牌を弾けない。ここが利用者の入力に対する唯一の関門になる。
 */
function validateTile(tile: Tile) {
  const numbers: readonly number[] = TILE_NUMBERS[tile.t];
  if (!numbers.includes(tile.n))
    throw new Error(`invalid tile: ${tile.n}${tile.t}`);
  // 赤ドラは数牌にしかない（赤5白のような牌は存在しない）
  if (tile.has(OP.RED) && !tile.isNum())
    throw new Error(
      `red dora operator can only be used with a number tile, got: ${tile.n}${tile.t}`
    );
}

function makeTiles(
  cluster: readonly TileBase[],
  k: Type
): readonly (Tile | Separator)[] {
  return cluster.map((v) => {
    let tile = new Tile(k, v.n, v.ops);
    validateTile(tile);
    // convert 0 alias to red operator
    if (tile.isNum() && tile.n == 0) tile = tile.clone({ n: 5, add: OP.RED });
    return tile;
  });
}

/**
 * 字牌のエイリアスが数字に足す値を返す。
 * w は風牌（1w-4w = 1z-4z）、d は三元牌（1d-3d = 5z-7z）を表す。
 */
function aliasOffset(c: string): number | null {
  if (c === "w") return 0;
  if (c === "d") return 4;
  return null;
}

/**
 * 文字が牌種（またはそのエイリアス）であれば、牌種と確定した牌の配列を返す。
 * エイリアスの場合は数字を字牌の位置へ寄せた新しい配列を返す（入力は書き換えない）。
 */
function resolveType(
  c: string,
  cluster: readonly TileBase[]
): { type: Type; cluster: readonly TileBase[] } | null {
  const type = tileTypeOf(c);
  if (type != null) return { type, cluster };

  const offset = aliasOffset(c);
  // 数字が先行していない w/d は牌種として扱わない
  if (offset == null || cluster.length == 0) return null;
  return {
    type: TYPE.Z,
    cluster: cluster.map((t) => ({ ...t, n: t.n + offset })),
  };
}

/**
 * 文字が牌の数字であれば返す。
 */
function numberOf(c: string): number | null {
  const n = Number(c);
  return 0 <= n && n <= 9 ? n : null;
}


/**
 * 現在位置がオペレータであれば、それを持つ牌を返す。オペレータの分だけ読み進める。
 * オペレータは種類の数だけ重ねられる（`-^r5m` など）。重複は Tile が畳む。
 */
function operatorTileAt(l: Lexer): TileBase | null {
  const ops = Object.values(OP) as string[];
  if (!ops.includes(l.char)) return null;

  const found: Operator[] = [];
  // 1 枚の牌に付けられるのは高々「オペレータの種類の数」。その次に数字が来る。
  for (let i = 0; i <= ops.length; i++) {
    const c = l.peekCharN(i);
    if (ops.includes(c)) {
      found.push(c as Operator);
      continue;
    }

    const n = numberOf(c);
    // オペレータの後ろが数字でなければ、牌ではない（牌種のエイリアスなど）
    if (n == null) return null;

    for (const _ of found) l.readChar();
    const tile = new Tile(TYPE.BACK, n, found);
    if (tile.has(OP.RED) && tile.n != 5)
      throw new Error(`red dora operator can only be used with 5, got: ${n}`);
    if (tile.has(OP.IMAGE_DORA) && tile.has(OP.TSUMO))
      throw new Error(`cannot specify both dora and tsumo operators`);
    return tile;
  }
  throw new Error(
    `too many operators for a tile: ${found.join("")} in ${l.input}`
  );
}
