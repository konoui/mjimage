import {
  Rand,
  Wall,
  WallProps,
  createSeededRand,
  shuffle,
} from "../../controller";
import { Parser, Tile, WindMap, createWindMap } from "../../core";
import { OP, TYPE, WIND } from "../../core/constants";

// 台本つきの山を「先に組み立てる」ための道具。
// 山の振る舞いを上書きするのではなく、136 枚の並びを台本どおりに作って本物の Wall に渡す。
// ツモ・カン・ドラ表示牌・王牌の扱いはすべて本物のまま動くので、局を最後まで回せる。

/**
 * ドラが台本の手牌に乗らない表示牌（中→白 / 發→中 / 白→發 / 北→東）。
 * 5 枚目（カン 4 回目のドラ）は山の余りから埋まる。そこまでカンする台本は今のところ無い。
 */
export const HARMLESS_DORA = ["7z", "6z", "5z", "4z"];

/** 136 枚すべて（赤 5 を 1 枚ずつ含む）。Wall の組み立てと同じ。 */
const allTiles = (): string[] => {
  const tiles: string[] = [];
  for (const t of Object.values(TYPE)) {
    if (t == TYPE.BACK) continue;
    const values =
      t == TYPE.Z ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5, 6, 7, 8, 9];
    for (let i = 0; i < 4; i++) {
      for (const n of values) {
        let tile = new Tile(t, n);
        if (t != TYPE.Z && i == 3 && n == 5) tile = tile.clone({ add: OP.RED });
        tiles.push(tile.toString());
      }
    }
  }
  return tiles;
};

const parse = (hand: string) =>
  new Parser(hand).tiles().map((t) => t.toString());

export interface WallScript {
  /** 配牌。13 枚に満たない分と、指定しなかった家には残りから配る。 */
  hands?: Partial<WindMap<string>>;
  /** 配牌のあとのツモ順。使い切ったら残りから引く。 */
  draws?: readonly string[];
  /** ドラ表示牌。先頭が最初の表示牌で、以降はカンごとにめくられる。 */
  doraIndicators?: readonly string[];
  /**
   * 裏ドラ表示牌。既定は表と同じ牌（点数を動かさないため）。
   * 表と同じ牌を指すだけなので、山の枚数には数えない。
   */
  hiddenDoraIndicators?: readonly string[];
  /** 嶺上牌。先頭が最初のカンで引かれる。 */
  replacement?: readonly string[];
  /** 対局に出さない牌。王牌に沈めるので、誰の手にも山にも現れない。 */
  exclude?: readonly string[];
  /** 台本で埋まらない部分に使う乱数。 */
  rand?: Rand;
}

/**
 * 台本から `WallProps` を組み立てる。
 *
 * 配牌は 4-4-4-1 の順に配られるので、`hands` で指定した牌がその家に渡るよう
 * 山の並びを逆算する。台本で使った牌は先に山から取り除くので、
 * 指定しなかった家に同じ牌が混ざることはない（5 枚目にならない）。
 */
export const buildWall = (script: WallScript = {}): WallProps => {
  const rand = script.rand ?? createSeededRand(20260801);
  const pool = allTiles();

  const take = (tiles: readonly string[], where: string) => {
    for (const t of tiles) {
      const i = pool.indexOf(t);
      if (i < 0)
        throw new Error(
          `[wall] ${where} の ${t} が山に残っていない（同じ牌を 5 枚使っている）`
        );
      pool.splice(i, 1);
    }
    return [...tiles];
  };

  const hands = createWindMap(() => [] as string[]);
  for (const w of Object.values(WIND)) {
    const scripted = script.hands?.[w];
    if (scripted == null) continue;
    const tiles = parse(scripted);
    if (tiles.length > 13)
      throw new Error(`[wall] ${w} の配牌が 13 枚を超えている`);
    hands[w] = take(tiles, `${w} の配牌`);
  }

  const draws = take(script.draws ?? [], "ツモ");
  const doraIndicators = take(script.doraIndicators ?? [], "ドラ表示牌");
  const replacement = take(script.replacement ?? [], "嶺上牌");
  const excluded = take(script.exclude ?? [], "除外牌");

  shuffle(pool, rand);

  // 足りない配牌を残りから埋める
  for (const w of Object.values(WIND))
    while (hands[w].length < 13) hands[w].push(pool.pop()!);

  const pad = (tiles: string[], size: number, fallback?: readonly string[]) => {
    while (tiles.length < size)
      tiles.push(fallback?.[tiles.length] ?? pool.pop()!);
    return tiles;
  };
  // 本物の Wall と同じ内訳（表ドラ 5 / 裏ドラ 5 / 嶺上 4）にする。
  const dora = pad(doraIndicators, 5);
  // 裏ドラは既定で表と同じ牌を指す。山からは抜かない（BaseActor が数えるのは表だけ）。
  const hidden = pad([...(script.hiddenDoraIndicators ?? [])], 5, dora);
  const rinshan = pad(replacement, 4);

  // 配牌が配られる順（4 枚ずつ 3 周 + 1 枚ずつ）
  const order: string[] = [];
  for (let round = 0; round < 3; round++)
    for (const w of Object.values(WIND))
      order.push(...hands[w].slice(round * 4, round * 4 + 4));
  for (const w of Object.values(WIND)) order.push(hands[w][12]);
  order.push(...draws);

  const rest = 122 - order.length;
  if (rest < 0) throw new Error(`[wall] 台本のツモが多すぎる（残り ${rest}）`);
  order.push(...pool.splice(0, rest));

  return {
    // Wall.draw は末尾から取るので、引かれる順の逆に積む
    drawable: order.reverse(),
    dead: [...pool, ...excluded],
    doraIndicators: dora,
    hiddenDoraIndicators: hidden,
    // Wall.kan も末尾から取る
    replacement: rinshan.reverse(),
  };
};

/**
 * 台本つきの山。進行を見ながらツモを差し込みたいときに使う。
 * 差し込みは山にある牌を並べ替えるだけなので、枚数は変わらない。
 */
export class ScriptedWall extends Wall {
  constructor(script: WallScript = {}) {
    super(buildWall(script));
  }

  /**
   * 指定した牌が次に引かれるようにする。
   * 山にあれば積み直し、王牌にあれば山の一番上と入れ替える。
   * どちらの場合も枚数は変わらない（誰かの手牌にある牌は差し込めない）。
   */
  injectNextDraw(...tiles: readonly string[]) {
    for (const t of tiles) {
      const i = this.walls.drawable.indexOf(t);
      if (i >= 0) {
        this.walls.drawable.splice(i, 1);
        this.walls.drawable.push(t);
        continue;
      }
      const j = this.walls.dead.indexOf(t);
      if (j < 0)
        throw new Error(
          `[wall] ${t} は山にも王牌にも無いので差し込めない（誰かの手牌にある）`
        );
      // 山の一番上（次に引かれる牌）と入れ替える
      this.walls.dead.splice(j, 1, this.walls.drawable.pop()!);
      this.walls.drawable.push(t);
    }
  }

  /** これまでにめくられたドラ表示牌の枚数。 */
  get revealedDoraCount() {
    return this.doraIndicators.length;
  }
}
