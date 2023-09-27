import assert from "assert";
import { Pai, Operator, Block, BlockType, Kind } from "./parser";
import { Svg, G } from "@svgdotjs/svg.js";

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

  createImage(draw: Svg, pai: Pai, x: number, y: number) {
    const image = draw.image(this.makeImageHref(pai));
    image.dx(x).dy(y).size(this.paiWidth, this.paiHeight);
    return image;
  }

  createTextImage(draw: Svg, pai: Pai, x: number, y: number, t: string) {
    const image = this.createImage(draw, pai, x, y);

    const fontSize = this.paiHeight * 0.2;
    // FIXME
    // const textWidth = text.getComputedTextLength();
    const textX = this.paiWidth;
    const textY = this.paiHeight;
    const text = draw.text(t);
    text
      .width(this.paiWidth)
      .height(this.paiHeight)
      .font({
        family: "メイリオ,ＭＳ Ｐゴシック,sans-serif",
        size: fontSize,
      })
      .dx(textX)
      .dy(textY);

    const g = draw.group();
    g.add(image).add(text).translate(x, y);
    return g;
  }

  createStackImage(draw: Svg, pai: Pai, x: number, y: number) {
    const base = this.createRotate90Image(draw, pai, 0, 0, true);
    const up = this.createRotate90Image(draw, pai, 0, this.paiWidth, true);
    const g = draw.group().translate(x, y).add(base).add(up);
    return g;
  }

  createRotate90Image(
    draw: Svg,
    pai: Pai,
    x: number,
    y: number,
    adjustY: boolean = false
  ) {
    const image = this.createImage(draw, pai, 0, 0);

    const centerX = this.paiWidth / 2;
    const centerY = this.paiHeight / 2;
    const translatedX = x + this.diffPaiHeightWidth;
    const translatedY = adjustY ? y - this.diffPaiHeightWidth : y;
    const g = draw.group();
    g.add(image)
      .translate(translatedX, translatedY)
      .rotate(90, centerX, centerY);
    return g;
  }

  makeImageHref(pai: Pai) {
    const file = `${pai.k}${pai.n}.svg`;
    if (this.image_host_url != "") {
      return `${this.image_host_url.toString()}${file}`;
    }
    return `${this.image_host_path}${file}`;
  }
}

class ImageHelper extends BaseHelper {
  readonly blockMargin = this.paiWidth * 0.3;
  createBlockOther(draw: Svg, pp: Pai[]) {
    const g = draw.group();
    let pos = 0;
    for (let p of pp) {
      const img = this.createImage(draw, p, pos, 0);
      g.add(img);
      pos += this.paiWidth;
    }
    return g;
  }

  createBlockPonChiKan(draw: Svg, block: Block) {
    const idx = block.p.findIndex((d) => {
      return d.op === Operator.Horizontal;
    });

    if (block.type == BlockType.ShoKan) {
      let pos = 0;
      const diff = this.paiWidth * 2 - this.paiHeight;
      const g = draw.group();
      for (let i = 0; i < block.p.length; i++) {
        if (i == idx + 1) continue;
        if (i == idx) {
          let img = this.createStackImage(draw, block.p[idx], pos, 0);
          pos += this.paiHeight;
          g.add(img);
          continue;
        }

        const img = this.createImage(draw, block.p[i], pos, diff);
        pos += this.paiWidth;
        g.add(img);
      }
      return g;
    }

    const g = draw.group();
    let pos = 0;
    for (let i = 0; i < block.p.length; i++) {
      if (i == idx) {
        const img = this.createRotate90Image(
          draw,
          block.p[i],
          pos,
          this.diffPaiHeightWidth
        );
        pos += this.paiHeight;
        g.add(img);
        continue;
      }
      const img = this.createImage(draw, block.p[1], pos, 0);
      pos += this.paiWidth;
      g.add(img);
    }
    return g;
  }
}

const getBlockDrawers = (draw: Svg, h: ImageHelper) => {
  const lookup = {
    [BlockType.Chi]: function (block: Block) {
      const width = h.paiWidth * 2 + h.paiHeight;
      const height = h.paiHeight;
      const g = h.createBlockPonChiKan(draw, block);
      return { width: width, height: height, e: g };
    },
    [BlockType.Pon]: function (block: Block) {
      const width = h.paiWidth * 2 + h.paiHeight;
      const height = h.paiHeight;
      const g = h.createBlockPonChiKan(draw, block);
      return { width: width, height: height, e: g };
    },
    [BlockType.DaiKan]: function (block: Block) {
      const width = h.paiWidth * 3 + h.paiHeight;
      const height = h.paiHeight;
      const g = h.createBlockPonChiKan(draw, block);
      return { width: width, height: height, e: g };
    },
    [BlockType.ShoKan]: function (block: Block) {
      const width = h.paiWidth * 2 + h.paiHeight;
      const height = h.paiWidth * 2;
      const g = h.createBlockPonChiKan(draw, block);
      return { width: width, height: height, e: g };
    },
    [BlockType.AnKan]: function (block: Block) {
      const width = h.paiWidth * 4;
      const height = h.paiHeight;
      const zp = block.p.find((v) => {
        return v.k !== Kind.Back;
      });
      assert(zp != null);
      const g = h.createBlockOther(draw, [
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
      const g = draw.group();
      const img = h.createTextImage(draw, block.p[0], 0, 0, "(ツモ)");
      g.add(img);
      return { width: width, height: height, e: g };
    },
    [BlockType.Tsumo]: function (block: Block) {
      const width = h.paiWidth + h.textWidth;
      const height = h.paiHeight; // note not contains text height
      const g = draw.group();
      const img = h.createTextImage(draw, block.p[0], 0, 0, "(ドラ)");
      g.add(img);
      return { width: width, height: height, e: g };
    },
    [BlockType.Other]: function (block: Block) {
      const width = h.paiWidth * block.p.length;
      const height = h.paiHeight;
      const g = h.createBlockOther(draw, block.p);
      return { width: width, height: height, e: g };
    },
    [BlockType.Unknown]: function (block: Block) {
      const width = 0;
      const height = 0;
      const g = draw.group();
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

export const drawBlocks = (
  svg: Svg,
  blocks: Block[],
  config: ImageHelperConfig = {}
) => {
  const helper = new ImageHelper(config);
  const lookup = getBlockDrawers(svg, helper);

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

  const maxHeight = baseHeight;
  svg.size(sumOfWidth + (blocks.length - 1) * helper.blockMargin, maxHeight);

  let pos = 0;
  for (let elm of elms) {
    const diff = baseHeight - elm.height;
    // TODO elm.e.translate(pos, diff);
    const g = svg.group().translate(pos, diff);
    g.add(elm.e);
    svg.add(g);
    pos += elm.width + helper.blockMargin;
  }
};
