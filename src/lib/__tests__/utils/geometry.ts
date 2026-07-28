/**
 * 出力された SVG から「何がどこに描かれたか」だけを読み取る。
 *
 * 不変条件テストが、全文スナップショットの代わりに配置そのものを確かめられるようにする。
 * g の transform を合成して外接矩形を出すので、入れ子の深さや途中の g が増えても壊れない。
 */

type Matrix = readonly [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

const compose = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];

const attrOf = (attrs: string, name: string) =>
  attrs.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

const numOf = (attrs: string, name: string) => Number(attrOf(attrs, name) ?? 0);

/**
 * 描かれた牌 1 枚。座標はルートの svg から見た外接矩形。
 */
export interface PlacedTile {
  /** 画像の URL。スプライトの場合は "#m1" のような参照 */
  href: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 縦横が入れ替わる向き（90/270 度）で置かれているか */
  rotated: boolean;
  /** style 属性。ツモ切りの減光など */
  style: string;
}

/**
 * SVG 文字列に含まれる牌の画像を、描かれた順に返す。
 */
export const placedTiles = (svg: string): PlacedTile[] => {
  const stack: Matrix[] = [IDENTITY];
  const tiles: PlacedTile[] = [];
  for (const m of svg.matchAll(/<(\/?)(g|image|use)\b([^>]*)>/g)) {
    const [, close, tag, attrs] = m;
    if (tag === "g") {
      // 中身の無い g は空要素として畳まれるので、そこでは深さが変わらない。
      if (close) stack.pop();
      else if (!attrs.trimEnd().endsWith("/")) {
        const t = attrs.match(/matrix\(([^)]*)\)/);
        const mm = (t ? t[1].split(",").map(Number) : IDENTITY) as Matrix;
        stack.push(compose(stack[stack.length - 1], mm));
      }
      continue;
    }
    if (close) continue;

    const cm = stack[stack.length - 1];
    const x = numOf(attrs, "x");
    const y = numOf(attrs, "y");
    const w = numOf(attrs, "width");
    const h = numOf(attrs, "height");
    const xs: number[] = [];
    const ys: number[] = [];
    for (const [px, py] of [
      [x, y],
      [x + w, y],
      [x, y + h],
      [x + w, y + h],
    ]) {
      xs.push(cm[0] * px + cm[2] * py + cm[4]);
      ys.push(cm[1] * px + cm[3] * py + cm[5]);
    }
    tiles.push({
      href: attrOf(attrs, "href") ?? "",
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
      rotated: Math.abs(cm[1]) > 1e-9,
      style: attrOf(attrs, "style") ?? "",
    });
  }
  return tiles;
};

/**
 * 条件に合う牌をまとめた外接矩形。牌が 1 枚も無い場合は空を表す ±Infinity になる。
 */
export const boundsOf = (svg: string, match: (href: string) => boolean) => {
  const tiles = placedTiles(svg).filter((t) => match(t.href));
  return {
    minX: Math.min(...tiles.map((t) => t.x)),
    maxX: Math.max(...tiles.map((t) => t.x + t.width)),
    minY: Math.min(...tiles.map((t) => t.y)),
    maxY: Math.max(...tiles.map((t) => t.y + t.height)),
  };
};
