import {
  Tile,
  Block,
  BlockAnKan,
  BlockHand,
  BlockPon,
  BlockChi,
  BlockShoKan,
  BlockDaiKan,
  BlockOther,
} from "../core/parser";
import { Svg, G, Image, Text, Use, Symbol } from "../svgjs/svg";
import { FONT_FAMILY, TILE_CONTEXT, TYPE, OP, BLOCK } from "../core";

export interface ImageHelperConfig {
  scale?: number;
  /**
   * svg/webp 形式の画像をホストしているパスを含む URL
   * e.g.) example.com/svg/
   */
  imageHostUrl?: string;
  /**
   * 牌の画像の拡張子
   * デフォルトは svg
   */
  imageExt?: "svg" | "webp";
  /**
   * svg スプライトの有効化・無効化オプション
   * デフォルトは false
   * 有効化する場合、手動で牌の svg を読み込み参照する必要がある。
   */
  svgSprite?: boolean;
  /**
   * 文字（ドラ・ツモの注記、卓の点数表示など）に使うフォント。
   * デフォルトは FONT_FAMILY。
   * 全角 1 文字が 1em で描かれる前提でレイアウトするため、日本語を含むフォントを指定する。
   */
  fontFamily?: string;
}

export interface DrawOptions {
  /**
   * ドラ牌の文字表示の有効化・無効化オプション
   */
  enableDoraText?: boolean;
  /**
   * ツモ牌の文字表示の有効化・無効化オプション
   */
  enableTsumoText?: boolean;
}

const blockImageSize = (b: Block, scale: number) => {
  const size = tileImageSize(b.tiles[0], scale);
  const bh = size.baseHeight;
  const bw = size.baseWidth;
  if (b.is(BLOCK.SHO_KAN))
    return { width: bw * 2 + bh, height: Math.max(bw * 2, bh) };

  const maxHeight = b.tiles.reduce((max: number, t: Tile) => {
    const h = tileImageSize(t, scale).height;
    return h > max ? h : max;
  }, 0);
  const sumWidth = b.tiles.reduce((sum: number, t: Tile) => {
    return sum + tileImageSize(t, scale).width;
  }, 0);
  return { width: sumWidth, height: maxHeight };
};

/**
 * 牌の実寸。ブロック内部の座標計算とコンテナの寸法計算で同じ値を使うため、
 * 丸めを含めてここに一本化する。
 */
export const scaledTileWidth = (scale: number) =>
  parseFloat((TILE_CONTEXT.WIDTH * scale).toPrecision(5));
export const scaledTileHeight = (scale: number) =>
  parseFloat((TILE_CONTEXT.HEIGHT * scale).toPrecision(5));

const tileImageSize = (
  tile: Tile,
  scale: number
): {
  width: number;
  height: number;
  baseWidth: number;
  baseHeight: number;
} => {
  const h = scaledTileHeight(scale);
  const w = scaledTileWidth(scale);
  const size = tile.has(OP.HORIZONTAL)
    ? { width: h, height: w, baseWidth: w, baseHeight: h }
    : { width: w, height: h, w, baseWidth: w, baseHeight: h };
  // 牌の右に注記（(ドラ)/(ツモ)）を置く分。文字はこの幅に収まるよう縮められる。
  if (tile.has(OP.TSUMO) || tile.has(OP.IMAGE_DORA))
    size.width += w * TILE_CONTEXT.TEXT_SCALE;
  return size;
};

/**
 * 文字列の幅を em 単位で見積もる。半角は 0.5em、全角は 1em として数える。
 * 注記が牌の右に確保した幅へ収まるフォントサイズを決めるために使う。
 */
const textEmWidth = (text: string) =>
  [...text].reduce((w, c) => w + (c.charCodeAt(0) < 0x100 ? 0.5 : 1), 0);

class BaseHelper {
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly imageHostUrl: string;
  readonly imageExt: "svg" | "webp";
  readonly scale: number;
  readonly svgSprite: boolean;
  readonly fontFamily: string;
  constructor(props: ImageHelperConfig = {}) {
    this.scale = props.scale ?? 1;
    this.imageHostUrl = props.imageHostUrl ?? "";
    this.imageExt = props.imageExt ?? "svg";
    this.tileWidth = scaledTileWidth(this.scale);
    this.tileHeight = scaledTileHeight(this.scale);
    this.svgSprite = props.svgSprite ?? false;
    this.fontFamily = props.fontFamily ?? FONT_FAMILY;
  }

  // 横向き牌を縦向き牌と水平に揃えるためのY座標オフセットを計算
  protected getHorizontalTileYOffset(t: Tile) {
    const size = tileImageSize(t, this.scale);
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
    const size = tileImageSize(tile, this.scale);
    const image = this.image(tile)
      .dx(x)
      .dy(y)
      .size(size.baseWidth, size.baseHeight);
    return image;
  }

  createTextImage(tile: Tile, x: number, y: number, t: string) {
    const size = tileImageSize(tile, this.scale);
    // tileImageSize が牌の右に足している幅にちょうど収まる大きさにする。
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

    const size = tileImageSize(tile, this.scale);
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
  createBlockDiscard(block: BlockOther) {
    return this.createHorizontalBlock(block.tiles);
  }

  /**
   * 手牌のブロックから SVG 要素を作る。
   */
  createBlockHand(block: BlockHand) {
    return this.createHorizontalBlock(block.tiles);
  }

  /**
   * チーブロックから SVG 要素を作る
   */
  createBlockChi(block: BlockChi) {
    this.findHorizontalIndex(block);
    // 先頭が Horizontal であることは BlockChi が保証する。
    return this.createHorizontalBlock(block.tiles);
  }

  /**
   * ポンのブロックから SVG 要素を作る
   */
  createBlockPon(block: BlockPon) {
    this.findHorizontalIndex(block);
    return this.createHorizontalBlock(block.tiles);
  }

  /**
   * 小明槓ブロックから SVG 要素を作る
   */
  createBlockShoKan(block: BlockShoKan) {
    const firstIdx = this.findHorizontalIndex(block);
    let pos = 0;
    const g = new G();

    // horizontal が 2 つあることは BlockShokan が保証する
    const lastIdx = block.tiles.reduce(
      (last, tile, i) => (tile.has(OP.HORIZONTAL) ? i : last),
      firstIdx
    );

    for (let i = 0; i < block.tiles.length; i++) {
      const size = tileImageSize(block.tiles[i], this.scale);
      if (i == lastIdx) continue;
      if (i == firstIdx) {
        const baseTile = block.tiles[firstIdx];
        const upperTile = block.tiles[lastIdx];

        const size = tileImageSize(baseTile, this.scale);
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
  createBlockDaiKan(block: BlockDaiKan) {
    this.findHorizontalIndex(block);
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
  createBlockDora(block: BlockOther, enableText = true) {
    return this.createBlockSingleText(block, "(ドラ)", enableText);
  }

  /**
   * ツモのブロックを作成する。
   * enableText が true の場合、オペレータは削除された状態で渡す必要がある。
   */
  createBlockTsumo(block: BlockOther, enableText = true) {
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
      const size = tileImageSize(t, this.scale);
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

  protected findHorizontalIndex(block: Block) {
    const idx = block.tiles.findIndex((d) => d.has(OP.HORIZONTAL));
    if (idx < 0) {
      throw new Error(`unable to find horizontal operator in block: ${block}`);
    }
    return idx;
  }
}

/**
 * ブロックのタイプに応じて SVG の要素を作成する。
 */
function createBlock(
  b: Block,
  h: ImageHelper,
  options: DrawOptions
): MySVGElement {
  const { enableDoraText, enableTsumoText } = options;
  let size = blockImageSize(b, h.scale);
  let g: G;
  if (b instanceof BlockPon) g = h.createBlockPon(b);
  else if (b instanceof BlockChi) g = h.createBlockChi(b);
  else if (b instanceof BlockAnKan) g = h.createBlockAnKan(b);
  else if (b instanceof BlockShoKan) g = h.createBlockShoKan(b);
  else if (b instanceof BlockDaiKan) g = h.createBlockDaiKan(b);
  else if (b instanceof BlockHand) g = h.createBlockHand(b);
  else if (b instanceof BlockOther) {
    switch (b.type) {
      case BLOCK.IMAGE_DISCARD:
        g = h.createBlockDiscard(b);
        break;
      case BLOCK.IMAGE_DORA: {
        // Operator を削除したサイズを計算する
        const mBlock =
          enableDoraText == false
            ? new BlockHand([b.tiles[0].clone({ remove: OP.IMAGE_DORA })])
            : b;
        size = blockImageSize(mBlock, h.scale);
        g = h.createBlockDora(mBlock, enableDoraText);
        break;
      }
      case BLOCK.TSUMO: {
        const mBlock =
          enableTsumoText == false
            ? new BlockHand([b.tiles[0].clone({ remove: OP.TSUMO })])
            : b;
        size = blockImageSize(mBlock, h.scale);
        g = h.createBlockTsumo(mBlock, enableTsumoText);
        break;
      }
      default:
        // unknown case
        // unable to draw tsumo/dora
        if (b.tiles.some((t) => t.has(OP.TSUMO) || t.has(OP.IMAGE_DORA)))
          throw new Error(
            `found an unknown block with operator tiles. block: ${b}, type: ${b.type}`
          );
        g = h.createBlockDiscard(b);
    }
  } else {
    throw new Error(
      `unsupported block type. type: ${b.type}, block: ${b}, instance ${b.constructor.name}`
    );
  }
  return { ...size, e: g };
}

export interface MySVGElement {
  e: G;
  width: number;
  height: number;
}

/**
 * 晒した牌やツモ・ドラを含む手牌など様々なブロックから SVG 要素を作成する。
 * 一般的には、晒した牌を含む手牌に使用する。
 */
export const createBlockHand = (
  helper: ImageHelper,
  blocks: readonly Block[],
  options: DrawOptions = defaultDrawOptions
): MySVGElement => {
  const elms = blocks.map((block) => createBlock(block, helper, options));
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
    g.add(elm.e);
    hand.add(g);
    pos += elm.width + helper.blockMargin;
  }
  return { e: hand, width: viewBoxWidth, height: viewBoxHeight };
};

const defaultDrawOptions: DrawOptions = {
  enableDoraText: true,
  enableTsumoText: true,
};

/**
 * 晒した牌やツモ・ドラを含む手牌の様々なブロックから SVG 要素を作成し、SVG に描画する。
 * レスポンシブが false の場合、SVG の width/height として絶対値で指定される。
 * viewBox はレスポンシブに関わらず設定される。
 */
export const drawBlocks = (
  svg: Svg,
  blocks: readonly Block[],
  config: ImageHelperConfig = {},
  options: { responsive?: boolean } & DrawOptions = defaultDrawOptions
) => {
  const helper = new ImageHelper(config);
  const hand = createBlockHand(helper, blocks, options);
  if (!options.responsive) svg.size(hand.width, hand.height);
  svg.viewbox(0, 0, hand.width, hand.height);
  svg.add(hand.e);
};

const getValidIDs = () => {
  const values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  return Object.values(TYPE).flatMap((t) => {
    if (t === TYPE.BACK) {
      return [BaseHelper.buildID(new Tile(t, 0))];
    }
    return values.map((v) => BaseHelper.buildID(new Tile(t, v)));
  });
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
