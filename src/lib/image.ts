import assert from "assert";
import { Tile, Block } from "./parser";
import { Svg, G, Image, Text, Use, Symbol } from "@svgdotjs/svg.js";
import { FONT_FAMILY, TILE_CONTEXT, KIND, OPERATOR, BLOCK } from "./constants";

export interface ImageHelperConfig {
  scale?: number;
  imageHostPath?: string;
  imageHostUrl?: string;
  svgSprite?: boolean;
}

class BaseHelper {
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly diffTileHeightWidth: number;
  readonly textWidth: number;
  readonly image_host_path: string;
  readonly image_host_url: string;
  readonly scale: number;
  readonly svgSprite: boolean;
  constructor(props: ImageHelperConfig = {}) {
    this.scale = props.scale ?? 1;
    this.image_host_path = props.imageHostPath ?? "";
    this.image_host_url = props.imageHostUrl ?? "";
    this.tileWidth = TILE_CONTEXT.WIDTH * this.scale;
    this.tileHeight = TILE_CONTEXT.HEIGHT * this.scale;
    this.textWidth = this.tileWidth * 0.8; // sum of 4 string
    this.diffTileHeightWidth = (this.tileHeight - this.tileWidth) / 2;
    this.svgSprite = props.svgSprite ?? false;
  }

  // image wrapper
  private image(tile: Tile | 100 | 1000) {
    let img: Image | Use = new Image().load(this.buildURL(tile));
    if (this.svgSprite) {
      img = new Use().use(BaseHelper.buildID(tile));
    }

    if (tile instanceof Tile && tile.has(OPERATOR.COLOR_GRAYSCALE)) {
      img.css({ filter: "contrast(65%)" });
    }
    return img;
  }

  createImage(tile: Tile, x: number, y: number) {
    const image = this.image(tile)
      .dx(x)
      .dy(y)
      .size(this.tileWidth, this.tileHeight);
    return image;
  }

  createTextImage(tile: Tile, x: number, y: number, t: string) {
    const image = this.createImage(tile, x, y);

    const fontSize = this.tileHeight * 0.2;
    const textX = this.tileWidth;
    const textY = this.tileHeight;
    const text = new Text().text(t);
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

  createStackImage(baseTile: Tile, upTile: Tile, x: number, y: number) {
    const base = this.createRotate90Image(baseTile, 0, 0, true);
    const up = this.createRotate90Image(upTile, 0, this.tileWidth, true);
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

  createStick(v: 100 | 1000) {
    return this.image(v);
  }

  static buildID(tile: Tile | 100 | 1000) {
    if (tile == 100 || tile == 1000) {
      return tile == 100 ? "stick100" : "stick1000";
    }
    const n = tile.k == KIND.BACK ? 0 : tile.n;
    return `${tile.k}${n}`;
  }

  buildURL(tile: Tile | 100 | 1000) {
    const filename = `${BaseHelper.buildID(tile)}.svg`;
    if (this.image_host_url != "") {
      return `${this.image_host_url}${filename}`;
    }
    return `${this.image_host_path}${filename}`;
  }
}

export class ImageHelper extends BaseHelper {
  readonly blockMargin = this.tileWidth * 0.3;
  createBlockHandDiscard(tiles: Tile[]) {
    const g = new G();
    let pos = 0;
    for (let t of tiles) {
      if (t.has(OPERATOR.HORIZONTAL)) {
        const img = this.createRotate90Image(t, pos, this.diffTileHeightWidth);
        g.add(img);
        pos += this.tileHeight;
        continue;
      }
      const img = this.createImage(t, pos, 0);
      g.add(img);
      pos += this.tileWidth;
    }
    return g;
  }

  createBlockPonChiKan(block: Block) {
    const idx = block.tiles.findIndex((d) => d.has(OPERATOR.HORIZONTAL));

    let pos = 0;
    const g = new G();
    if (block.type == BLOCK.SHO_KAN) {
      const diff = this.tileWidth * 2 - this.tileHeight;

      let lastIdx = idx;
      let i = 0;
      for (let t of block.tiles) {
        if (t.has(OPERATOR.HORIZONTAL)) lastIdx = i;
        i++;
      }

      for (let i = 0; i < block.tiles.length; i++) {
        if (i == lastIdx) continue;
        if (i == idx) {
          // Note first index is added tile
          // TODO but first index is upper
          let img = this.createStackImage(
            block.tiles[idx],
            block.tiles[lastIdx],
            pos,
            0
          );
          pos += this.tileHeight;
          g.add(img);
          continue;
        }

        const img = this.createImage(block.tiles[i], pos, diff);
        pos += this.tileWidth;
        g.add(img);
      }
      return g;
    }

    if (block.type == BLOCK.CHI) {
      const img = this.createRotate90Image(
        block.tiles[idx],
        pos,
        this.diffTileHeightWidth
      );
      pos += this.tileHeight;
      g.add(img);

      for (let i = 0; i < block.tiles.length; i++) {
        if (i == idx) continue;
        const img = this.createImage(block.tiles[i], pos, 0);
        pos += this.tileWidth;
        g.add(img);
      }
      return g;
    }

    for (let i = 0; i < block.tiles.length; i++) {
      if (i == idx) {
        const img = this.createRotate90Image(
          block.tiles[i],
          pos,
          this.diffTileHeightWidth
        );
        pos += this.tileHeight;
        g.add(img);
        continue;
      }
      const img = this.createImage(block.tiles[1], pos, 0);
      pos += this.tileWidth;
      g.add(img);
    }
    return g;
  }
}

const getBlockCreators = (h: ImageHelper) => {
  const lookup = {
    [BLOCK.CHI]: function (block: Block) {
      const width = h.tileWidth * 2 + h.tileHeight;
      const height = h.tileHeight;
      const g = h.createBlockPonChiKan(block);
      return { width: width, height: height, e: g };
    },
    [BLOCK.PON]: function (block: Block) {
      const width = h.tileWidth * 2 + h.tileHeight;
      const height = h.tileHeight;
      const g = h.createBlockPonChiKan(block);
      return { width: width, height: height, e: g };
    },
    [BLOCK.DAI_KAN]: function (block: Block) {
      const width = h.tileWidth * 3 + h.tileHeight;
      const height = h.tileHeight;
      const g = h.createBlockPonChiKan(block);
      return { width: width, height: height, e: g };
    },
    [BLOCK.SHO_KAN]: function (block: Block) {
      const width = h.tileWidth * 2 + h.tileHeight;
      const height = h.tileWidth * 2;
      const g = h.createBlockPonChiKan(block);
      return { width: width, height: height, e: g };
    },
    [BLOCK.AN_KAN]: function (block: Block) {
      const width = h.tileWidth * 4;
      const height = h.tileHeight;
      const zp = block.tiles.filter((v) => {
        return v.k !== KIND.BACK;
      });
      assert(zp != null && zp.length == 2);
      const g = h.createBlockHandDiscard([
        new Tile(KIND.BACK, 0),
        zp[0],
        zp[1],
        new Tile(KIND.BACK, 0),
      ]);
      return { width: width, height: height, e: g };
    },
    [BLOCK.DORA]: function (block: Block) {
      const width = h.tileWidth + h.textWidth;
      const height = h.tileHeight; // note not contains text height
      const g = new G();
      const img = h.createTextImage(block.tiles[0], 0, 0, "(ドラ)");
      g.add(img);
      return { width: width, height: height, e: g };
    },
    [BLOCK.TSUMO]: function (block: Block) {
      const width = h.tileWidth + h.textWidth;
      const height = h.tileHeight; // note not contains text height
      const g = new G();
      const img = h.createTextImage(block.tiles[0], 0, 0, "(ツモ)");
      g.add(img);
      return { width: width, height: height, e: g };
    },
    [BLOCK.HAND]: function (block: Block) {
      const width = h.tileWidth * block.tiles.length;
      const height = h.tileHeight;
      const g = h.createBlockHandDiscard(block.tiles);
      return { width: width, height: height, e: g };
    },
    [BLOCK.DISCARD]: function (block: Block) {
      const width = block.tiles
        .map((v) => (v.has(OPERATOR.HORIZONTAL) ? h.tileHeight : h.tileWidth))
        .reduce((prev, v) => prev + v);
      const height = h.tileHeight;
      const g = h.createBlockHandDiscard(block.tiles);
      return { width: width, height: height, e: g };
    },
    [BLOCK.UNKNOWN]: function (block: Block) {
      const width = 0;
      const height = 0;
      const g = new G();
      throw new Error("found unknown block");
    },
    [BLOCK.PAIR]: function (block: Block) {
      throw new Error("unsupported");
    },
    [BLOCK.SET]: function (block: Block) {
      throw new Error("unsupported");
    },
    [BLOCK.ISOLATED]: function (block: Block) {
      throw new Error("unsupported");
    },
  };

  return lookup;
};

interface MySVGElement {
  e: G;
  width: number;
  height: number;
}

export const createHand = (helper: ImageHelper, blocks: Block[]) => {
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
  const hand = createHand(helper, blocks);
  svg.size(hand.width, hand.height);
  svg.add(hand.e);
};

const getValidIDs = () => {
  const values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const ids: string[] = [];
  for (let kind of Object.values(KIND)) {
    if (kind == KIND.BACK) {
      ids.push(BaseHelper.buildID(new Tile(kind, 0)));
      continue;
    }

    ids.push(
      ...values.map((v) => BaseHelper.buildID(new Tile(kind, v))).flat()
    );
  }
  return ids;
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
  });
  return usedIDs;
};

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
