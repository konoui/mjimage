import { Tile, Block, BlockAnKan, BlockHand, BlockType } from "../core/parser";
import { assert } from "../assert";
import {
  Svg,
  G,
  Image,
  Text,
  Use,
  Symbol,
  round,
  Placeable,
} from "../svgjs/svg";
import { TILE_NUMBERS, TYPE, OP, BLOCK, Operator } from "../core";
import { FONT_FAMILY, TILE_CONTEXT } from "./constants";

/**
 * 描画の設定。画像の出所・寸法・書体と、注記の有無をまとめて受け取る。
 * 層（render / createHand / createTable）によらず同じ形にする。
 */
export interface RenderOptions {
  scale?: number;
  /**
   * svg/webp 形式の画像をホストしているパスを含む URL
   * e.g.) example.com/svg/
   * 空の場合はファイル名だけの相対パスになる。
   * svgSprite が true の場合は使われない。
   */
  imageHostUrl?: string;
  /**
   * 牌の画像の拡張子
   * デフォルトは svg
   * svgSprite が true の場合は使われない。
   */
  imageExt?: "svg" | "webp";
  /**
   * svg スプライトの有効化・無効化オプション
   * デフォルトは false
   * 有効化する場合、牌の svg を Svg.importSymbol() で読み込んでおく必要がある。
   * 有効な場合、imageHostUrl と imageExt は参照されない。
   */
  svgSprite?: boolean;
  /**
   * 文字（ドラ・ツモの注記、卓の点数表示など）に使うフォント。
   * デフォルトは FONT_FAMILY。
   * 全角 1 文字が 1em で描かれる前提でレイアウトするため、日本語を含むフォントを指定する。
   */
  fontFamily?: string;
  /**
   * ドラ牌の文字表示の有効化・無効化オプション。
   * デフォルトは有効。
   */
  enableDoraText?: boolean;
  /**
   * ツモ牌の文字表示の有効化・無効化オプション。
   * デフォルトは有効。
   */
  enableTsumoText?: boolean;
}

/**
 * 牌の実寸。ブロック内部の座標計算とコンテナの寸法計算で同じ値を使うため、
 * 丸めを含めてここに一本化する。実寸を使う側は helper の tileSize / blockSize を通す。
 */
const scaledTileWidth = (scale: number) =>
  parseFloat((TILE_CONTEXT.WIDTH * scale).toPrecision(5));
const scaledTileHeight = (scale: number) =>
  parseFloat((TILE_CONTEXT.HEIGHT * scale).toPrecision(5));

/**
 * 文字列の幅を em 単位で見積もる。半角は 0.5em、全角は 1em として数える。
 * 注記が牌の右に確保した幅へ収まるフォントサイズを決めるために使う。
 */
const textEmWidth = (text: string) =>
  [...text].reduce((w, c) => w + (c.charCodeAt(0) < 0x100 ? 0.5 : 1), 0);

/**
 * 解決済みの描画設定。RenderOptions の全項目をここに集約し、
 * 組み立ての各層へはヘルパだけを引き回す（設定の受け渡し経路を 1 本にする）。
 */
class BaseHelper {
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly imageHostUrl: string;
  readonly imageExt: "svg" | "webp";
  readonly scale: number;
  readonly svgSprite: boolean;
  readonly fontFamily: string;
  readonly enableDoraText: boolean;
  readonly enableTsumoText: boolean;
  constructor(props: RenderOptions = {}) {
    this.scale = props.scale ?? 1;
    this.imageHostUrl = props.imageHostUrl ?? "";
    this.imageExt = props.imageExt ?? "svg";
    this.tileWidth = scaledTileWidth(this.scale);
    this.tileHeight = scaledTileHeight(this.scale);
    this.svgSprite = props.svgSprite ?? false;
    this.fontFamily = props.fontFamily ?? FONT_FAMILY;
    this.enableDoraText = props.enableDoraText ?? true;
    this.enableTsumoText = props.enableTsumoText ?? true;
  }

  /**
   * 牌 1 枚の実寸。base* は向きに関係ない牌そのものの寸法で、
   * width/height は横向き・注記を反映した占有寸法となる。
   */
  tileSize(tile: Tile): {
    width: number;
    height: number;
    baseWidth: number;
    baseHeight: number;
  } {
    const w = this.tileWidth;
    const h = this.tileHeight;
    const size = tile.has(OP.HORIZONTAL)
      ? { width: h, height: w, baseWidth: w, baseHeight: h }
      : { width: w, height: h, baseWidth: w, baseHeight: h };
    // 牌の右に注記（(ドラ)/(ツモ)）を置く分。文字はこの幅に収まるよう縮められる。
    if (tile.has(OP.TSUMO) || tile.has(OP.IMAGE_DORA))
      size.width += w * TILE_CONTEXT.TEXT_SCALE;
    return size;
  }

  /**
   * ブロック 1 つの実寸。牌を横に並べた大きさで、小明槓だけは 2 段に積む。
   */
  blockSize(block: Block): { width: number; height: number } {
    const { baseWidth: bw, baseHeight: bh } = this.tileSize(block.tiles[0]);
    if (block.is(BLOCK.SHO_KAN))
      return { width: bw * 2 + bh, height: Math.max(bw * 2, bh) };

    const maxHeight = block.tiles.reduce(
      (max, t) => Math.max(max, this.tileSize(t).height),
      0,
    );
    const sumWidth = block.tiles.reduce(
      (sum, t) => sum + this.tileSize(t).width,
      0,
    );
    return { width: sumWidth, height: maxHeight };
  }

  // 横向き牌を縦向き牌と水平に揃えるためのY座標オフセットを計算
  protected getHorizontalTileYOffset(t: Tile) {
    const size = this.tileSize(t);
    return (size.baseHeight - size.baseWidth) / 2;
  }

  // image wrapper
  private image(tile: Tile | 100 | 1000) {
    let img = this.svgSprite
      ? new Use().use(BaseHelper.buildID(tile))
      : new Image().load(this.buildURL(tile));
    // ツモ切りの表現。README の「牌の色が暗くなる」に対応する。
    // グレースケール化ではなくコントラストを落としている（OP 名とはずれる）。
    if (tile instanceof Tile && tile.has(OP.COLOR_GRAYSCALE))
      img.css({ filter: "contrast(65%)" });
    return img;
  }

  createImage(tile: Tile, x: number, y: number) {
    const size = this.tileSize(tile);
    const image = this.image(tile)
      .dx(x)
      .dy(y)
      .size(size.baseWidth, size.baseHeight);
    return image;
  }

  createTextImage(tile: Tile, x: number, y: number, t: string) {
    const size = this.tileSize(tile);
    // tileSize が牌の右に足している幅にちょうど収まる大きさにする。
    const reservedWidth = size.baseWidth * TILE_CONTEXT.TEXT_SCALE;
    const fontSize = reservedWidth / textEmWidth(t);

    // g 側で (x, y) へ移動するので、中身は原点基準で組む。
    const image = this.createImage(tile, 0, 0);
    const text = new Text()
      .plain(t)
      .font({ family: this.fontFamily, size: fontSize })
      // ディセンダが牌の下辺より下へ出ないよう字面の下端で揃える。
      .attr({ "dominant-baseline": "text-after-edge" })
      .x(size.baseWidth)
      .y(size.baseHeight);

    const g = new G();
    g.add(image).add(text).translate(x, y);
    return g;
  }

  createRotate90Image(
    tile: Tile,
    x: number,
    y: number,
    adjustY: boolean = false
  ) {
    const img = this.createImage(tile, 0, 0);

    const size = this.tileSize(tile);
    const centerX = size.baseWidth / 2;
    const centerY = size.baseHeight / 2;
    const translatedX = x + this.getHorizontalTileYOffset(tile);
    const translatedY = adjustY ? y - this.getHorizontalTileYOffset(tile) : y;
    const g = new G();
    g.add(img).translate(translatedX, translatedY).rotate(90, centerX, centerY);
    return g;
  }

  createStick(v: 100 | 1000) {
    return this.image(v);
  }

  static buildID(tile: Tile | 100 | 1000) {
    if (tile === 100) return "stick100";
    if (tile === 1000) return "stick1000";

    // original file is 0s/0m/0p
    const n = tile.t == TYPE.BACK || tile.has(OP.RED) ? 0 : tile.n;
    return `${tile.t}${n}`;
  }

  buildURL(tile: Tile | 100 | 1000) {
    const filename = `${BaseHelper.buildID(tile)}.${this.imageExt}`;
    if (this.imageHostUrl != "") return `${this.imageHostUrl}${filename}`;
    return filename;
  }
}

/**
 * 基本的な麻雀牌の SVG 要素を作成するヘルパークラス
 */
export class ImageHelper extends BaseHelper {
  readonly blockMargin =
    TILE_CONTEXT.WIDTH * TILE_CONTEXT.BLOCK_MARGIN_SCALE * this.scale;
  /**
   * 捨て牌のブロックから SVG 要素を作る。
   * よくわからな場合（Unknown）も使用する。
   */
  createBlockDiscard(block: Block) {
    return this.createHorizontalBlock(block.tiles);
  }

  /**
   * 手牌のブロックから SVG 要素を作る。
   */
  createBlockHand(block: Block) {
    return this.createHorizontalBlock(block.tiles);
  }

  /**
   * チーブロックから SVG 要素を作る
   */
  createBlockChi(block: Block) {
    this.assertHasHorizontal(block);
    return this.createHorizontalBlock(block.tiles);
  }

  /**
   * ポンのブロックから SVG 要素を作る
   */
  createBlockPon(block: Block) {
    this.assertHasHorizontal(block);
    return this.createHorizontalBlock(block.tiles);
  }

  /**
   * 小明槓ブロックから SVG 要素を作る
   */
  createBlockShoKan(block: Block) {
    const firstIdx = this.findHorizontalIndex(block);
    let pos = 0;
    const g = new G();

    // horizontal が 2 つあることは BlockShokan が保証する
    const lastIdx = block.tiles.reduce(
      (last, tile, i) => (tile.has(OP.HORIZONTAL) ? i : last),
      firstIdx
    );

    for (let i = 0; i < block.tiles.length; i++) {
      const size = this.tileSize(block.tiles[i]);
      if (i == lastIdx) continue;
      if (i == firstIdx) {
        const baseTile = block.tiles[firstIdx];
        const upperTile = block.tiles[lastIdx];

        const size = this.tileSize(baseTile);
        const baseImg = this.createRotate90Image(baseTile, 0, 0, true);
        const upImg = this.createRotate90Image(upperTile, 0, size.height, true);
        g.add(new G().translate(pos, 0).add(baseImg).add(upImg));
        pos += size.width;
        continue;
      }

      const diff = size.width * 2 - size.height;
      const img = this.createImage(block.tiles[i], pos, diff);
      pos += size.width;
      g.add(img);
    }
    return g;
  }

  /**
   * 大明槓のブロックから SVG 要素を作る
   */
  createBlockDaiKan(block: Block) {
    this.assertHasHorizontal(block);
    return this.createHorizontalBlock(block.tiles);
  }

  /**
   * 暗槓のブロックから SVG 要素を作る。
   */
  createBlockAnKan(block: BlockAnKan) {
    return this.createHorizontalBlock(block.tilesWithBack);
  }

  /**
   * ドラのブロックを作成する。
   * enableText が true の場合、オペレータは削除された状態で渡す必要がある。
   */
  createBlockDora(block: Block, enableText = true) {
    return this.createBlockSingleText(block, "(ドラ)", enableText);
  }

  /**
   * ツモのブロックを作成する。
   * enableText が true の場合、オペレータは削除された状態で渡す必要がある。
   */
  createBlockTsumo(block: Block, enableText = true) {
    return this.createBlockSingleText(block, "(ツモ)", enableText);
  }

  protected createBlockSingleText(
    block: Block,
    text: string,
    enableText = true
  ) {
    const g = new G();
    const img =
      enableText === false
        ? this.createImage(block.tiles[0], 0, 0)
        : this.createTextImage(block.tiles[0], 0, 0, text);
    g.add(img);
    return g;
  }

  /**
   * HORIZONTAL Operator があった場合は、牌を横にし SVG 要素を作る。
   * オペレーターの存在は検証されない。
   */
  protected createHorizontalBlock(tiles: readonly Tile[]) {
    let pos = 0;
    const g = new G();

    for (const t of tiles) {
      const size = this.tileSize(t);
      let img;
      if (t.has(OP.HORIZONTAL)) {
        const y = this.getHorizontalTileYOffset(t);
        img = this.createRotate90Image(t, pos, y);
      } else img = this.createImage(t, pos, 0);
      g.add(img);
      pos += size.width;
    }
    return g;
  }

  /**
   * 横向きの牌の位置を返す。無ければ例外を投げる。
   */
  protected findHorizontalIndex(block: Block) {
    const idx = block.tiles.findIndex((d) => d.has(OP.HORIZONTAL));
    if (idx < 0) {
      throw new Error(`unable to find horizontal operator in block: ${block}`);
    }
    return idx;
  }

  /**
   * 鳴いたブロックに横向きの牌があることを確かめる。
   * 位置は使わないが、無い入力は描かずに弾く（BlockPon などの構築時には検証されない）。
   */
  protected assertHasHorizontal(block: Block) {
    this.findHorizontalIndex(block);
  }
}

/**
 * 組み上げた要素に、そのブロックの実寸を添えて返す。
 */
const sized = (h: ImageHelper, b: Block, element: G): BuiltFragment => ({
  ...h.blockSize(b),
  element,
});

/**
 * 注記（(ドラ)/(ツモ)）付きの 1 枚のブロックを組む。
 * 注記を描かない場合はオペレータを外した牌で寸法を取り直すので、
 * tileSize が注記のために確保する幅が空いたままにならない。
 */
const buildAnnotated = (
  b: Block,
  h: ImageHelper,
  enabled: boolean,
  op: Operator,
  create: (block: Block, enabled: boolean) => G
): BuiltFragment => {
  const block = enabled ? b : new BlockHand([b.tiles[0].clone({ remove: op })]);
  return sized(h, block, create(block, enabled));
};

/**
 * 描き方の無いブロック種別。あがり計算の過程でだけ現れるものがここに来る。
 */
const unsupported: BlockRenderer = (b) => {
  throw new Error(`unsupported block type. type: ${b.type}, block: ${b}`);
};

type BlockRenderer = (b: Block, h: ImageHelper) => BuiltFragment;

/**
 * ブロック種別ごとの描き方。
 * 種別を足したときに直すのはこの表だけで済むよう、全種別を必ず埋める
 * （Record なので、BLOCK に値を足すとここが型エラーになる）。
 */
const BLOCK_RENDERERS: Record<BlockType, BlockRenderer> = {
  [BLOCK.PON]: (b, h) => sized(h, b, h.createBlockPon(b)),
  [BLOCK.CHI]: (b, h) => sized(h, b, h.createBlockChi(b)),
  [BLOCK.AN_KAN]: (b, h) => {
    // 裏返しの牌を含む並びは BlockAnKan だけが知っている。
    assert(b instanceof BlockAnKan, `an-kan block is not a BlockAnKan: ${b}`);
    return sized(h, b, h.createBlockAnKan(b));
  },
  [BLOCK.SHO_KAN]: (b, h) => sized(h, b, h.createBlockShoKan(b)),
  [BLOCK.DAI_KAN]: (b, h) => sized(h, b, h.createBlockDaiKan(b)),
  [BLOCK.HAND]: (b, h) => sized(h, b, h.createBlockHand(b)),
  [BLOCK.IMAGE_DISCARD]: (b, h) => sized(h, b, h.createBlockDiscard(b)),
  [BLOCK.IMAGE_DORA]: (b, h) =>
    buildAnnotated(b, h, h.enableDoraText, OP.IMAGE_DORA, (block, enabled) =>
      h.createBlockDora(block, enabled)
    ),
  [BLOCK.TSUMO]: (b, h) =>
    buildAnnotated(b, h, h.enableTsumoText, OP.TSUMO, (block, enabled) =>
      h.createBlockTsumo(block, enabled)
    ),
  // 計算の過程でだけ現れる種別。入力の記法では書けないので描き方も無い。
  [BLOCK.PAIR]: unsupported,
  [BLOCK.ISOLATED]: unsupported,
  [BLOCK.THREE]: unsupported,
  [BLOCK.RUN]: unsupported,
  // 記法から種別を決められなかったブロック。捨て牌と同じ並べ方にする。
  [BLOCK.UNKNOWN]: (b, h) => {
    // 注記は置き場所（牌の右）が種別で決まるので、種別が不明なままでは描けない。
    if (b.tiles.some((t) => t.has(OP.TSUMO) || t.has(OP.IMAGE_DORA)))
      throw new Error(
        `found an unknown block with operator tiles. block: ${b}, type: ${b.type}`
      );
    return sized(h, b, h.createBlockDiscard(b));
  },
};

/**
 * ブロックのタイプに応じて SVG の要素を作成する。
 */
function createBlock(b: Block, h: ImageHelper): BuiltFragment {
  return BLOCK_RENDERERS[b.type](b, h);
}

/**
 * 配置できる SVG の断片と、その寸法。
 * 呼び出し側が element を自分の SVG に置いて合成できるようにするため、
 * 寸法（＝縦横比・牌の枚数）を一緒に返す。
 */
export interface SVGFragment {
  element: Placeable;
  width: number;
  height: number;
}

/**
 * 組み立て中の断片。内部の合成では具象の G を扱う必要があるため、
 * 公開する SVGFragment とは別に持つ（G は Placeable を満たす）。
 */
export interface BuiltFragment {
  element: G;
  width: number;
  height: number;
}

/**
 * 返す寸法を SVG に出力される値（viewBox）と一致させる。
 * 内部の座標計算は生の値で行い、公開する境界だけで丸める。
 */
export const roundSize = <T extends { width: number; height: number }>(
  size: T
): T => ({ ...size, width: round(size.width), height: round(size.height) });

/**
 * 晒した牌やツモ・ドラを含む手牌など様々なブロックから SVG 要素を作成する。
 * 一般的には、晒した牌を含む手牌に使用する。
 */
export const createHand = (
  blocks: readonly Block[],
  options: RenderOptions = {}
): SVGFragment => roundSize(buildHand(new ImageHelper(options), blocks));

/**
 * 手牌を組み立てる。ヘルパを共有したい内部の合成（卓など）から使う。
 * 描画の設定はヘルパが解決済みで持つため、ここでは受け取らない。
 */
export const buildHand = (
  helper: ImageHelper,
  blocks: readonly Block[]
): BuiltFragment => {
  const elms = blocks.map((block) => createBlock(block, helper));
  const sumWidth = elms.reduce((sum, elm) => sum + elm.width, 0);
  const maxHeight = elms.reduce((max, elm) => Math.max(max, elm.height), 0);

  const viewBoxHeight = maxHeight;
  // ブロック間の余白はブロックの隙間の数だけ。ブロックが無い場合は 0（負の幅にしない）。
  const viewBoxWidth =
    sumWidth + Math.max(0, blocks.length - 1) * helper.blockMargin;

  const hand = new G();
  let pos = 0;
  for (const elm of elms) {
    const diff = viewBoxHeight - elm.height;
    const g = new G().translate(pos, diff);
    g.add(elm.element);
    hand.add(g);
    pos += elm.width + helper.blockMargin;
  }
  return { element: hand, width: viewBoxWidth, height: viewBoxHeight };
};

/**
 * 画像として存在しうる ID の一覧。入力の検証と同じ値域定義を使う。
 * 牌のほかに供託棒も symbol として参照されるので、両方を含める。
 * 落ちると卓から供託棒だけが消えるため、optimizeSVG の対象と揃える。
 */
const getValidIDs = () => {
  const tiles = Object.values(TYPE).flatMap((t) =>
    TILE_NUMBERS[t].map((v) => BaseHelper.buildID(new Tile(t, v)))
  );
  return [...tiles, BaseHelper.buildID(100), BaseHelper.buildID(1000)];
};

const findUsedIDs = (draw: Svg) => {
  const validIDs = getValidIDs();
  const usedIDs: string[] = [];
  draw.each((idx, children) => {
    const node = children[idx];
    if (node instanceof Use) {
      // https://github.com/svgdotjs/svg.js/blob/3.2.0/src/elements/Use.js#L14
      const hrefAttr: string = node.attr("href");
      const id = hrefAttr.substring(1);
      if (validIDs.includes(id)) usedIDs.push(id);
    }
  }, true);
  return usedIDs;
};

/**
 * SVG スプライトにおいて、使用していない牌の Symbol 要素を削除する（参照している牌の SVG 要素のみを残す）。
 * SVG に Symbol として麻雀牌の SVG 要素を読み込んでおり、Use を使用して麻雀牌の SVG 要素を参照していることが前提となる。
 */
export const optimizeSVG = (draw: Svg) => {
  const validIDs = getValidIDs();
  const usedIDs = findUsedIDs(draw);
  draw.each((idx, children) => {
    const node = children[idx];
    if (node instanceof Symbol) {
      const isUsed =
        validIDs.includes(node.id()) && usedIDs.includes(node.id());
      if (!isUsed) node.remove();
    }
  }, true);
};
