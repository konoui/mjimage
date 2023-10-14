import assert from "assert";
import { Tile, Operator, Block, BlockType, Kind } from "./parser";
import { Svg, G, Image, Text } from "@svgdotjs/svg.js";
import { FONT_FAMILY } from "./constants";
export const tileContext = { width: 66, height: 90 };

export interface ImageHelperConfig {
  scale?: number;
  imageHostPath?: string;
  imageHostUrl?: string;
}

class BaseHelper {
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly diffTileHeightWidth: number;
  readonly textWidth: number;
  readonly image_host_path: string;
  readonly image_host_url: string;
  readonly scale: number;
  constructor(props: ImageHelperConfig = {}) {
    this.scale = props.scale ? props.scale : 1;
    this.image_host_path = props.imageHostPath ?? "";
    this.image_host_url = props.imageHostUrl ?? "";
    this.tileWidth = tileContext.width * this.scale;
    this.tileHeight = tileContext.height * this.scale;
    this.textWidth = this.tileWidth * 0.8; // sum of 4 string
    this.diffTileHeightWidth = (this.tileHeight - this.tileWidth) / 2;
  }

  createImage(tile: Tile, x: number, y: number) {
    const image = new Image().load(this.makeImageTileHref(tile));
    image.dx(x).dy(y).size(this.tileWidth, this.tileHeight);
    return image;
  }

  createTextImage(tile: Tile, x: number, y: number, t: string) {
    const image = this.createImage(tile, x, y);

    const fontSize = this.tileHeight * 0.2;
    // FIXME
    // const textWidth = text.getComputedTextLength();
    const textX = this.tileWidth;
    const textY = this.tileHeight;
    const text = new Text().text(t);
    // FIXME merge table font
    text
      .width(this.tileWidth)
      .height(this.tileHeight)
      .font({
        family: FONT_FAMILY,
        size: fontSize,
      })
      .dx(textX)
      .dy(textY);

    const g = new G();
    g.add(image).add(text).translate(x, y);
    return g;
  }

  createStackImage(tile: Tile, x: number, y: number) {
    const base = this.createRotate90Image(tile, 0, 0, true);
    const up = this.createRotate90Image(tile, 0, this.tileWidth, true);
    const g = new G().translate(x, y).add(base).add(up);
    return g;
  }

  createRotate90Image(
    tile: Tile,
    x: number,
    y: number,
    adjustY: boolean = false
  ) {
    const image = this.createImage(tile, 0, 0);

    const centerX = this.tileWidth / 2;
    const centerY = this.tileHeight / 2;
    const translatedX = x + this.diffTileHeightWidth;
    const translatedY = adjustY ? y - this.diffTileHeightWidth : y;
    const g = new G();
    g.add(image)
      .translate(translatedX, translatedY)
      .rotate(90, centerX, centerY);
    return g;
  }

  makeImageTileHref(tile: Tile) {
    return this.makeImageHref(`${tile.k}${tile.n}.svg`);
  }

  makeImageHref(filename: string) {
    if (this.image_host_url != "") {
      return `${this.image_host_url}${filename}`;
    }
    return `${this.image_host_path}${filename}`;
  }
}

export class ImageHelper extends BaseHelper {
  readonly blockMargin = this.tileWidth * 0.3;
  createBlockOther(pp: Tile[]) {
    const g = new G();
    let pos = 0;
    for (let p of pp) {
      const img = this.createImage(p, pos, 0);
      g.add(img);
      pos += this.tileWidth;
    }
    return g;
  }

  createBlockPonChiKan(block: Block) {
    const idx = block.p.findIndex((d) => {
      return d.op === Operator.Horizontal;
    });

    if (block.type == BlockType.ShoKan) {
      let pos = 0;
      const diff = this.tileWidth * 2 - this.tileHeight;
      const g = new G();
      for (let i = 0; i < block.p.length; i++) {
        if (i == idx + 1) continue;
        if (i == idx) {
          let img = this.createStackImage(block.p[idx], pos, 0);
          pos += this.tileHeight;
          g.add(img);
          continue;
        }

        const img = this.createImage(block.p[i], pos, diff);
        pos += this.tileWidth;
        g.add(img);
      }
      return g;
    }

    const g = new G();
    let pos = 0;
    for (let i = 0; i < block.p.length; i++) {
      if (i == idx) {
        const img = this.createRotate90Image(
          block.p[i],
          pos,
          this.diffTileHeightWidth
        );
        pos += this.tileHeight;
        g.add(img);
        continue;
      }
      const img = this.createImage(block.p[1], pos, 0);
      pos += this.tileWidth;
      g.add(img);
    }
    return g;
  }
}

const getBlockCreators = (h: ImageHelper) => {
  const lookup = {
    [BlockType.Chi]: function (block: Block) {
      const width = h.tileWidth * 2 + h.tileHeight;
      const height = h.tileHeight;
      const g = h.createBlockPonChiKan(block);
      return { width: width, height: height, e: g };
    },
    [BlockType.Pon]: function (block: Block) {
      const width = h.tileWidth * 2 + h.tileHeight;
      const height = h.tileHeight;
      const g = h.createBlockPonChiKan(block);
      return { width: width, height: height, e: g };
    },
    [BlockType.DaiKan]: function (block: Block) {
      const width = h.tileWidth * 3 + h.tileHeight;
      const height = h.tileHeight;
      const g = h.createBlockPonChiKan(block);
      return { width: width, height: height, e: g };
    },
    [BlockType.ShoKan]: function (block: Block) {
      const width = h.tileWidth * 2 + h.tileHeight;
      const height = h.tileWidth * 2;
      const g = h.createBlockPonChiKan(block);
      return { width: width, height: height, e: g };
    },
    [BlockType.AnKan]: function (block: Block) {
      const width = h.tileWidth * 4;
      const height = h.tileHeight;
      const zp = block.p.find((v) => {
        return v.k !== Kind.Back;
      });
      assert(zp != null);
      const g = h.createBlockOther([
        new Tile(Kind.Back, 0),
        zp,
        zp,
        new Tile(Kind.Back, 0),
      ]);
      return { width: width, height: height, e: g };
    },
    [BlockType.Dora]: function (block: Block) {
      const width = h.tileWidth + h.textWidth;
      const height = h.tileHeight; // note not contains text height
      const g = new G();
      const img = h.createTextImage(block.p[0], 0, 0, "(ドラ)");
      g.add(img);
      return { width: width, height: height, e: g };
    },
    [BlockType.Tsumo]: function (block: Block) {
      const width = h.tileWidth + h.textWidth;
      const height = h.tileHeight; // note not contains text height
      const g = new G();
      const img = h.createTextImage(block.p[0], 0, 0, "(ツモ)");
      g.add(img);
      return { width: width, height: height, e: g };
    },
    [BlockType.Other]: function (block: Block) {
      const width = h.tileWidth * block.p.length;
      const height = h.tileHeight;
      const g = h.createBlockOther(block.p);
      return { width: width, height: height, e: g };
    },
    [BlockType.Unknown]: function (block: Block) {
      const width = 0;
      const height = 0;
      const g = new G();
      throw new Error("found unknown block");
    },
  };

  return lookup;
};

interface MySVGElement {
  e: G;
  width: number;
  height: number;
}

export const createHand = (blocks: Block[], helper: ImageHelper) => {
  const creators = getBlockCreators(helper);

  let baseHeight = helper.tileWidth;
  let sumOfWidth = 0;
  const elms: MySVGElement[] = [];
  for (let block of blocks) {
    const fn = creators[block.type];
    const elm = fn(block);
    elms.push(elm);
    sumOfWidth += elm.width;
    if (elm.height > baseHeight) baseHeight = elm.height;
  }

  const sizeHeight = baseHeight;
  const sizeWidth = sumOfWidth + (blocks.length - 1) * helper.blockMargin;
  const hand = new G();

  let pos = 0;
  for (let elm of elms) {
    const diff = baseHeight - elm.height;
    // TODO elm.e.translate(pos, diff);
    const g = new G().translate(pos, diff);
    g.add(elm.e);
    hand.add(g);
    pos += elm.width + helper.blockMargin;
  }
  return { e: hand, width: sizeWidth, height: sizeHeight };
};

export const drawBlocks = (
  svg: Svg,
  blocks: Block[],
  config: ImageHelperConfig = {}
) => {
  const helper = new ImageHelper(config);
  const hand = createHand(blocks, helper);
  svg.size(hand.width, hand.height);
  svg.add(hand.e);
};
