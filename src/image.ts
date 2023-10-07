import assert from "assert";
import { Pai, Operator, Block, BlockType, Kind } from "./parser";
import { Svg, G, Image, Text } from "@svgdotjs/svg.js";

export const paiContext = { width: 66, height: 90 };

export interface ImageHelperConfig {
  scale?: number;
  imageHostPath?: string;
  imageHostUrl?: string;
}

class BaseHelper {
  readonly paiWidth: number;
  readonly paiHeight: number;
  readonly diffPaiHeightWidth: number;
  readonly textWidth: number;
  readonly image_host_path: string;
  readonly image_host_url: string;
  constructor(props: ImageHelperConfig = {}) {
    const scale = props.scale ? props.scale : 1;
    this.image_host_path = props.imageHostPath ? props.imageHostPath : "";
    this.image_host_url = props.imageHostUrl ? props.imageHostUrl : "";
    this.paiWidth = paiContext.width * scale;
    this.paiHeight = paiContext.height * scale;
    this.textWidth = this.paiWidth * 0.8; // sum of 4 string
    this.diffPaiHeightWidth = (this.paiHeight - this.paiWidth) / 2;
  }

  createImage(pai: Pai, x: number, y: number) {
    const image = new Image().load(this.makeImagePaiHref(pai));
    image.dx(x).dy(y).size(this.paiWidth, this.paiHeight);
    return image;
  }

  createTextImage(pai: Pai, x: number, y: number, t: string) {
    const image = this.createImage(pai, x, y);

    const fontSize = this.paiHeight * 0.2;
    // FIXME
    // const textWidth = text.getComputedTextLength();
    const textX = this.paiWidth;
    const textY = this.paiHeight;
    const text = new Text().text(t);
    text
      .width(this.paiWidth)
      .height(this.paiHeight)
      .font({
        family: "メイリオ,ＭＳ Ｐゴシック,sans-serif",
        size: fontSize,
      })
      .dx(textX)
      .dy(textY);

    const g = new G();
    g.add(image).add(text).translate(x, y);
    return g;
  }

  createStackImage(pai: Pai, x: number, y: number) {
    const base = this.createRotate90Image(pai, 0, 0, true);
    const up = this.createRotate90Image(pai, 0, this.paiWidth, true);
    const g = new G().translate(x, y).add(base).add(up);
    return g;
  }

  createRotate90Image(
    pai: Pai,
    x: number,
    y: number,
    adjustY: boolean = false
  ) {
    const image = this.createImage(pai, 0, 0);

    const centerX = this.paiWidth / 2;
    const centerY = this.paiHeight / 2;
    const translatedX = x + this.diffPaiHeightWidth;
    const translatedY = adjustY ? y - this.diffPaiHeightWidth : y;
    const g = new G();
    g.add(image)
      .translate(translatedX, translatedY)
      .rotate(90, centerX, centerY);
    return g;
  }

  makeImagePaiHref(pai: Pai) {
    return this.makeImageHref(`${pai.k}${pai.n}.svg`);
  }

  makeImageHref(filename: string) {
    if (this.image_host_url != "") {
      return `${this.image_host_url.toString()}${filename}`;
    }
    return `${this.image_host_path}${filename}`;
  }
}

export class ImageHelper extends BaseHelper {
  readonly blockMargin = this.paiWidth * 0.3;
  createBlockOther(pp: Pai[]) {
    const g = new G();
    let pos = 0;
    for (let p of pp) {
      const img = this.createImage(p, pos, 0);
      g.add(img);
      pos += this.paiWidth;
    }
    return g;
  }

  createBlockPonChiKan(block: Block) {
    const idx = block.p.findIndex((d) => {
      return d.op === Operator.Horizontal;
    });

    if (block.type == BlockType.ShoKan) {
      let pos = 0;
      const diff = this.paiWidth * 2 - this.paiHeight;
      const g = new G();
      for (let i = 0; i < block.p.length; i++) {
        if (i == idx + 1) continue;
        if (i == idx) {
          let img = this.createStackImage(block.p[idx], pos, 0);
          pos += this.paiHeight;
          g.add(img);
          continue;
        }

        const img = this.createImage(block.p[i], pos, diff);
        pos += this.paiWidth;
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
          this.diffPaiHeightWidth
        );
        pos += this.paiHeight;
        g.add(img);
        continue;
      }
      const img = this.createImage(block.p[1], pos, 0);
      pos += this.paiWidth;
      g.add(img);
    }
    return g;
  }
}

const getBlockDrawers = (h: ImageHelper) => {
  const lookup = {
    [BlockType.Chi]: function (block: Block) {
      const width = h.paiWidth * 2 + h.paiHeight;
      const height = h.paiHeight;
      const g = h.createBlockPonChiKan(block);
      return { width: width, height: height, e: g };
    },
    [BlockType.Pon]: function (block: Block) {
      const width = h.paiWidth * 2 + h.paiHeight;
      const height = h.paiHeight;
      const g = h.createBlockPonChiKan(block);
      return { width: width, height: height, e: g };
    },
    [BlockType.DaiKan]: function (block: Block) {
      const width = h.paiWidth * 3 + h.paiHeight;
      const height = h.paiHeight;
      const g = h.createBlockPonChiKan(block);
      return { width: width, height: height, e: g };
    },
    [BlockType.ShoKan]: function (block: Block) {
      const width = h.paiWidth * 2 + h.paiHeight;
      const height = h.paiWidth * 2;
      const g = h.createBlockPonChiKan(block);
      return { width: width, height: height, e: g };
    },
    [BlockType.AnKan]: function (block: Block) {
      const width = h.paiWidth * 4;
      const height = h.paiHeight;
      const zp = block.p.find((v) => {
        return v.k !== Kind.Back;
      });
      assert(zp != null);
      const g = h.createBlockOther([
        new Pai(Kind.Back, 0),
        zp,
        zp,
        new Pai(Kind.Back, 0),
      ]);
      return { width: width, height: height, e: g };
    },
    [BlockType.Dora]: function (block: Block) {
      const width = h.paiWidth + h.textWidth;
      const height = h.paiHeight; // note not contains text height
      const g = new G();
      const img = h.createTextImage(block.p[0], 0, 0, "(ドラ)");
      g.add(img);
      return { width: width, height: height, e: g };
    },
    [BlockType.Tsumo]: function (block: Block) {
      const width = h.paiWidth + h.textWidth;
      const height = h.paiHeight; // note not contains text height
      const g = new G();
      const img = h.createTextImage(block.p[0], 0, 0, "(ツモ)");
      g.add(img);
      return { width: width, height: height, e: g };
    },
    [BlockType.Other]: function (block: Block) {
      const width = h.paiWidth * block.p.length;
      const height = h.paiHeight;
      const g = h.createBlockOther(block.p);
      return { width: width, height: height, e: g };
    },
    [BlockType.Unknown]: function (block: Block) {
      const width = 0;
      const height = 0;
      const g = new G();
      return { width: width, height: height, e: g };
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
  const lookup = getBlockDrawers(helper);

  let baseHeight = helper.paiWidth;
  let sumOfWidth = 0;
  const elms: MySVGElement[] = [];
  for (let block of blocks) {
    const fn = lookup[block.type];
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
