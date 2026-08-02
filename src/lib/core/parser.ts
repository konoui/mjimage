// barrel（./index.ts）は外向きの公開面。兄弟モジュールは実体を直接参照する。
import { INPUT_SEPARATOR, OP } from "./constants";
import { Tile, Separator, scanTileSeparators } from "./tile";
import { Block, makeBlocks } from "./block";

/**
 * 文字列をパースし、牌やブロックを返すクラス
 * @param {boolean} options.enableImplicitTsumoBlock 手牌の中にツモオペレータがある場合、その牌をツモブロックとして扱う。
 * 手牌とは最初の区切り文字が現れるまでの牌の文字列を指す（区切り文字を使用したツモブロックが存在しないことが条件）。
 * ツモブロックは、手牌の次のブロックとなる（晒した牌の前となる）。
 */
export class Parser {
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
    return makeBlocks(this.tileSeparators());
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
    const res = scanTileSeparators(this.input);
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
    // ツモ牌以外に手牌がなければ切り出す必要がない。
    // そのまま進めると先頭に区切り文字が付き、空のブロックができてしまう。
    if (handEnd <= 1) return res;
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
}
