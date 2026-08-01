import { BLOCK, TYPE, OP, Type, INPUT_SEPARATOR } from "../core";
import {
  Tile,
  Parser,
  BlockPon,
  BlockChi,
  BlockShoKan,
  BlockAnKan,
  BlockDaiKan,
  Block,
  BlockHand,
  is5Tile,
} from "../core/parser";
import { assert } from "../assert";
import {
  TileCounts,
  cloneTileCounts,
  countsOf,
  emptyTileCounts,
  tilesOf,
} from "./counts";
import { forHand } from "./tile";

export interface HandData {
  counts: TileCounts;
  /** 裏牌の枚数。牌の種類が分からないので数字ごとには持たない。 */
  backCount: number;
  called: readonly (
    BlockChi | BlockPon | BlockAnKan | BlockDaiKan | BlockShoKan
  )[];
  tsumo: Tile | null;
  reached: boolean;
}

export class Hand {
  protected data: HandData;
  constructor(input: string | readonly Block[], allowBackBlock = false) {
    this.data = {
      counts: emptyTileCounts(),
      backCount: 0,
      called: [],
      reached: false,
      tsumo: null,
    };
    this.init(input, allowBackBlock);
  }
  private init(input: string | readonly Block[], allowBackBlock: boolean) {
    const blocks =
      typeof input === "string" ? new Parser(input).parse() : input;
    for (const b of blocks) {
      if (b.isCalled()) {
        this.data.called = [...this.called, b];
        continue;
      } else if (b.is(BLOCK.TSUMO)) {
        const t = b.tiles[0];
        this.inc([t]);
        this.data.tsumo = t;
        continue;
      } else if (b.is(BLOCK.HAND)) {
        this.inc(b.tiles);
        continue;
      } else if (
        typeof input === "string" &&
        input.split("").every((v) => v === TYPE.BACK)
      ) {
        this.inc(b.tiles);
        continue;
      } else if (allowBackBlock) {
        this.inc(b.tiles);
        continue;
      }
      throw new Error(`unexpected block ${b.type} ${b.toString()}`);
    }
  }
  /**
   * 手の内の牌の配列を返す。晒された牌は含まれない。
   */
  get hands() {
    const tiles = tilesOf(countsOf(this));
    if (this.drawn != null) {
      const drawn = this.drawn;
      const idx = tiles.findIndex(
        (t) => t.equals(drawn) && drawn.has(OP.RED) == t.has(OP.RED),
      );
      assert(
        idx >= 0,
        `drawn tile ${this.drawn} not found in hand: ${tiles.join("")}`,
      );
      tiles[idx] = tiles[idx].clone({ add: OP.TSUMO });
    }
    return tiles;
  }
  /**
   * 晒された牌を含む手牌を整形した文字列で返す。
   */
  toString() {
    const called =
      this.called.length > 0
        ? `${INPUT_SEPARATOR}${this.called.join(INPUT_SEPARATOR)}`
        : "";

    const tsumo = this.drawn
      ? `${INPUT_SEPARATOR}${this.drawn.toString()}`
      : "";

    const tiles = this.hands.filter((v) => !v.has(OP.TSUMO));
    const b = new BlockHand(tiles).toString();
    return `${b}${tsumo}${called}`;
  }
  /**
   * 晒したブロックの配列を返す。
   * 晒したブロック順となる。
   */
  get called() {
    return this.data.called;
  }
  /**
   * リーチ中かどうかを返す。
   */
  get reached() {
    return this.data.reached;
  }
  /**
   * ツモ牌を返す。打牌後は null を返す。
   */
  get drawn() {
    return this.data.tsumo;
  }
  /**
   * 面前かどうかを返す。
   */
  get menzen() {
    return !this.called.some((v) => !(v instanceof BlockAnKan));
  }
  /**
   * 手牌において、指定した牌の種類の合計枚数を返す
   */
  sum(type: Type) {
    return Array.from(forHand({ filterBy: [type] })).reduce(
      (sum, [t, n]) => sum + this.get(t, n),
      0,
    );
  }
  /**
   * 手牌において、牌の合計枚数を返す。
   * 赤のみを取得する場合は n に 0 を指定する。
   */
  get(t: Type, n: number) {
    if (t == TYPE.BACK) return this.data.backCount;
    return this.data.counts[t][n];
  }
  /**
   * 指定した牌を手牌に加える。draw に比べプリミティブな操作となる。
   */
  inc(tiles: readonly Tile[]): readonly Tile[] {
    const backup: Tile[] = [];
    for (const t of tiles) {
      const isInvalidCount = t.t != TYPE.BACK && this.get(t.t, t.n) >= 4;
      const isInvalidRed = t.has(OP.RED) && this.get(t.t, 0) > 0;
      if (isInvalidCount || isInvalidRed) {
        this.dec(backup);
        const msg = isInvalidCount
          ? `tile ${t} exists more than 4 times`
          : `red tile ${t} appears more than once`;
        throw new Error(`invalid hand: ${msg} in hand: ${this.toString()}`);
      }

      backup.push(t);

      if (t.t == TYPE.BACK) this.data.backCount += 1;
      else {
        this.data.counts[t.t][t.n] += 1;
        if (t.has(OP.RED)) this.data.counts[t.t][0] += 1;
      }
    }
    return backup;
  }
  /**
   * 指定した牌を手牌からなくす。discard に比べプリミティブな操作となる。
   */
  dec(tiles: readonly Tile[]): readonly Tile[] {
    const backup: Tile[] = [];
    for (const t of tiles) {
      const isInvalidCount = this.get(t.t, t.n) < 1;
      const isInvalidRed = t.has(OP.RED) && this.get(t.t, 0) <= 0;
      if (isInvalidCount || isInvalidRed) {
        this.inc(backup);
        const msg = isInvalidCount
          ? `tile ${t} does not exist`
          : `red tile ${t} does not exist`;
        throw new Error(`invalid hand: ${msg} in hand: ${this.toString()}`);
      }

      backup.push(t);

      if (t.t == TYPE.BACK) {
        this.data.backCount -= 1;
        continue;
      }

      const counts = this.data.counts[t.t];
      counts[t.n] -= 1;
      if (t.has(OP.RED)) counts[0] -= 1;

      // r5 ではなく 5 で減算される際に最後の牌が red であれば red を 0 にする。
      if (is5Tile(t) && this.get(t.t, 5) == 0 && this.get(t.t, 0) > 0) {
        counts[0] = 0;
        const c = backup.pop()!.clone({ add: OP.RED });
        backup.push(c);
      }
    }

    return backup;
  }
  /**
   * ツモ牌として手牌に加える。
   */
  draw(t: Tile) {
    const ts = t.clone({ add: OP.TSUMO });
    this.inc([ts]);
    this.data.tsumo = ts;
    return;
  }
  /**
   * 打牌として手牌から捨てる
   */
  discard(t: Tile) {
    this.dec([t]);
    this.data.tsumo = null;
    return;
  }
  /**
   * リーチ宣言をする
   */
  reach() {
    if (!this.menzen) throw new Error("cannot declare reach due to called");
    if (this.data.reached) throw new Error("already declared reach");
    this.data.reached = true;
  }
  /**
   * 他家の打牌を指定したブロックで鳴く。鳴く牌はブロック内で表現する。
   */
  call(b: BlockPon | BlockChi | BlockDaiKan) {
    const toRemove = b.tiles.filter((v) => !v.has(OP.HORIZONTAL));
    if (toRemove.length != b.tiles.length - 1)
      throw new Error(`invalid block: removal tiles: ${toRemove}, block: ${b}`);

    this.dec(toRemove);
    // 末尾に追加する
    this.data.called = [...this.called, b];
    this.data.tsumo = null;
    return;
  }
  /**
   * ツモした牌を指定したブロックでカンする。鳴く牌はブロック内で表現する。
   */
  kan(b: BlockAnKan | BlockShoKan) {
    if (b instanceof BlockAnKan) {
      this.dec(b.tiles);
      this.data.called = [...this.called, b];
      this.data.tsumo = null;
      return;
    }

    if (b instanceof BlockShoKan) {
      const idx = this.data.called.findIndex(
        (v) => v.is(BLOCK.PON) && v.tiles[0].equals(b.tiles[0]),
      );
      if (idx == -1)
        throw new Error(
          `cannot find pon block ${b.tiles[0]} to call shokan: ${b}`,
        );
      let t = b.tiles[0];
      // 適当に選んだ牌が red であればエラーが発生しないように red を削除して dec する
      t = is5Tile(t) ? t.clone({ remove: OP.RED }) : t;
      this.dec([t]);
      // remove an existing pon block and add kakan block
      this.data.called = [
        ...this.called.slice(0, idx),
        ...this.called.slice(idx + 1),
        b,
      ];
      this.data.tsumo = null;
      return;
    }

    throw new Error(`unexpected block type ${b}`);
  }
  /**
   * 手牌の写しを返す。
   *
   * 直列化を挟まず data をそのまま複製するので、`toString()` の再パースを通らない。
   * 派生クラス（ActorHand など）から呼んでも自分の型が返る。
   */
  clone(): this {
    const ctor = this.constructor as new (
      input: string | readonly Block[],
    ) => this;
    const c = new ctor("");
    c.data = {
      counts: cloneTileCounts(this.data.counts),
      backCount: this.data.backCount,
      // ブロックと牌は作り直されるだけで書き換わらないので、参照を写せばよい。
      called: [...this.data.called],
      tsumo: this.data.tsumo,
      reached: this.data.reached,
    };
    return c;
  }
}
