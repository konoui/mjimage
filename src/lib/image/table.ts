import { Tile, BLOCK, BlockOther, WIND_MAP, OP, Wind } from "../core/";
import { STICK_CONTEXT, TABLE_CONTEXT } from "./constants";
import {
  ImageHelper,
  buildHand,
  RenderOptions,
  SVGFragment,
  BuiltFragment,
  roundSize,
} from "./image";
import { Text, G, Rect, SvgNode } from "../svgjs/svg";
import { ScoreBoard, TableInput } from "../input";
import { Seats, mapSeats, maxOfSeats, seatWinds } from "../input/seats";

const chunkTilesForDisplay = (
  input: readonly Tile[],
  chunkSize: number = TABLE_CONTEXT.RIVER_ROW_SIZE,
) => {
  return Array.from({ length: Math.ceil(input.length / chunkSize) }, (_, i) =>
    input.slice(i * chunkSize, (i + 1) * chunkSize),
  );
};

/**
 * 卓に描く文字の寸法。牌のスケールから導く。
 *
 * レイアウトが文字に対して要求するのは「全角 1 文字分の隙間」と「1 行分の高さ」だけで、
 * どちらも全角 1 文字 = 1em なので実測を必要としない
 * （実測しても全角の送り幅は font-size と同じ値になる）。
 */
interface TableFont {
  font: { family: string; size: number };
  /** 全角 1 文字分 = 1em */
  em: number;
}

const tableFont = (helper: ImageHelper): TableFont => {
  const size = TABLE_CONTEXT.BASE * helper.scale;
  return { font: { family: helper.fontFamily, size }, em: size };
};

/**
 * 要素を [0,width]x[0,height] の矩形とみなして回転させる。
 * 回転後も同じ矩形を占めるよう平行移動を合わせる。
 */
const simpleRotate = (
  e: SvgNode,
  width: number,
  height: number,
  degree: 0 | 90 | 180 | 270,
) => {
  const g = new G().add(e);
  if (degree == 90) {
    g.rotate(degree, 0, height).translate(0, -height);
    return new G().add(g);
  }
  if (degree == 180) {
    g.rotate(degree, 0, height).translate(width, -height);
    return new G().add(g);
  }
  if (degree == 270) {
    g.rotate(degree, 0, height).translate(height, width - height);
    return new G().add(g);
  }

  // 0
  return new G().add(g);
};

/**
 * 河の一行分の幅。鳴かれた牌は横向きになり縦向きより幅を取るため、実際に並べて測る。
 */
const riverRowWidth = (tiles: readonly Tile[], helper: ImageHelper) =>
  tiles.reduce(
    (sum, t) => sum + (t.has(OP.HORIZONTAL) ? helper.tileHeight : helper.tileWidth),
    0,
  );

const createDiscardArea = (
  tiles: readonly Tile[],
  helper: ImageHelper,
): BuiltFragment => {
  const g = new G();
  const chunks = chunkTilesForDisplay(tiles);

  let width = 0;
  for (let i = 0; i < chunks.length; i++) {
    const tiles = chunks[i];
    const posY = i * helper.tileHeight;
    width = Math.max(width, riverRowWidth(tiles, helper));
    const e = helper
      .createBlockDiscard(new BlockOther(tiles, BLOCK.IMAGE_DISCARD))
      .translate(0, posY);
    g.add(e);
  }
  return {
    element: g,
    width: width,
    height: helper.tileHeight * chunks.length,
  };
};

/**
 * ドラ表示牌の枠数。入力が空でも中央のボードの大きさが変わらないよう最低 1 枠は確保する。
 */
const doraSlotCount = (scoreBoard: ScoreBoard) =>
  Math.max(1, scoreBoard.doraIndicators.length);

/**
 * 中央のボード（局・供託棒・ドラ表示牌）の幅。
 * 要素を組み立てる前に卓の大きさを決めるために使うので、寸法だけを別に計算できるようにする。
 */
const stickAndDoraWidth = (
  helper: ImageHelper,
  tf: TableFont,
  scoreBoard: ScoreBoard,
) =>
  STICK_CONTEXT.WIDTH * helper.scale +
  tf.em +
  helper.tileWidth * doraSlotCount(scoreBoard);

const createStickAndDora = (
  helper: ImageHelper,
  tf: TableFont,
  scoreBoard: ScoreBoard,
): BuiltFragment => {
  const font = tf.font;
  const em = tf.em;

  const num100 = scoreBoard.sticks.dead;
  const num1000 = scoreBoard.sticks.reach;
  const stickWidth = STICK_CONTEXT.WIDTH * helper.scale;
  const stickHeight = STICK_CONTEXT.HEIGHT * helper.scale;

  const width = stickAndDoraWidth(helper, tf, scoreBoard);
  const roundHeight = em * (1 + TABLE_CONTEXT.ROUND_MARGIN_SCALE);

  // 局は text-anchor で中央に寄せる。文字列の実幅を推定しないため、
  // 全角・半角が混ざっても位置がずれない。
  // またベースラインは alphabetic なので、y に文字の高さを与えないと
  // 確保した領域の上へはみ出してボード全体が上にずれる。
  const roundText = new Text()
    .plain(scoreBoard.round)
    .font(font)
    .x(width / 2)
    .y(em)
    .attr({ "text-anchor": "middle" });

  const stickGroupHeight = helper.tileHeight;
  const stickGroup = new G()
    .size(stickWidth, stickGroupHeight)
    .translate(0, roundHeight);

  const stickFont = { family: font.family, size: font.size * 0.7 }; // FIXME STICK_CONTEXT.HEIGHT
  const stick1000 = helper
    .createStick(1000)
    .size(stickWidth, stickHeight)
    .x(0)
    .y(0);
  const text1000 = new Text()
    .plain(num1000.toString())
    .font(stickFont)
    .dx(stickWidth)
    .dy(stickHeight);

  const stick100 = helper
    .createStick(100)
    .size(stickWidth, stickHeight)
    .x(0)
    .y(stickHeight + stickHeight);
  const text100 = new Text()
    .plain(num100.toString())
    .font(stickFont)
    .dx(stickWidth)
    .dy(stickHeight * 3);

  stickGroup.add(stick1000);
  stickGroup.add(text1000);
  stickGroup.add(stick100);
  stickGroup.add(text100);

  // 指定された表示牌をすべて描く。空の場合は枠だけ残して何も描かない。
  scoreBoard.doraIndicators.forEach((tile, i) => {
    const doraImg = helper
      .createImage(tile, 0, 0)
      .x(stickWidth + em + helper.tileWidth * i)
      .y(0);
    stickGroup.add(doraImg);
  });

  const g = new G();
  g.add(roundText);
  g.add(stickGroup);

  return {
    element: g,
    width: width,
    height: roundHeight + helper.tileHeight,
  };
};

/**
 * 4 家の要素を正方形の各辺に貼り付ける。
 * 要素は自分の辺に接し（辺からの距離は offset）、辺に沿っては中央寄せする。
 * 各要素は自分自身の実寸で配置するので、他家の大きさに引きずられない。
 */
const layoutSeats = (
  areas: Seats<BuiltFragment>,
  sizeWidth: number,
  offset: number,
): G => {
  const { front: fe, right: re, opposite: oe, left: le } = areas;
  const along = (width: number) => (sizeWidth - width) / 2;

  const front = simpleRotate(fe.element, fe.width, fe.height, 0).translate(
    along(fe.width),
    sizeWidth - offset - fe.height,
  );
  const right = simpleRotate(re.element, re.width, re.height, 270).translate(
    sizeWidth - offset - re.height,
    along(re.width),
  );
  const opposite = simpleRotate(oe.element, oe.width, oe.height, 180).translate(
    along(oe.width),
    offset,
  );
  const left = simpleRotate(le.element, le.width, le.height, 90).translate(
    offset,
    along(le.width),
  );

  const g = new G().size(sizeWidth, sizeWidth);
  g.add(front);
  g.add(right);
  g.add(opposite);
  g.add(left);
  return g;
};

const createScoreBoard = (
  helper: ImageHelper,
  tf: TableFont,
  scoreBoard: ScoreBoard,
  sizeWidth: number,
): BuiltFragment => {
  const font = tf.font;
  const boardRect = createStickAndDora(helper, tf, scoreBoard);
  boardRect.element.translate(
    sizeWidth / 2 - boardRect.width / 2,
    sizeWidth / 2 - boardRect.height / 2,
  );

  /**
   * 各家の点数を、正方形の辺の中点を基準に、その家を向く向きで内側に垂らす。
   * 寄せは text-anchor / dominant-baseline に任せるため、文字列の実寸に依存しない。
   * 4 辺で同じ属性を使うので、風や桁数が変わっても位置は変わらない。
   */
  const createScore = (
    place: Wind,
    score: number,
    degree: 0 | 90 | 180 | 270,
    cx: number,
    cy: number,
  ) => {
    // http://defghi1977.html.xdomain.jp/tech/svgMemo/svgMemo_08.htm
    // 風を表示文字列にするのはここだけ。席順は Wind のまま計算する。
    const t = new Text()
      .plain(`${WIND_MAP[place]} ${score}`)
      .font(font)
      .attr({
        "text-anchor": "middle",
        "dominant-baseline": "text-after-edge",
      });
    return new G().add(t).rotate(degree, 0, 0).translate(cx, cy);
  };

  const places = seatWinds(scoreBoard.frontPlace);
  const scores = scoreBoard.scores;
  const half = sizeWidth / 2;

  const g = new G();
  const rect = new Rect()
    .size(sizeWidth, sizeWidth)
    .x(0)
    .y(0)
    .fill("none")
    .stroke("#000000");
  g.add(rect);
  g.add(boardRect.element);
  g.add(createScore(places.front, scores.front, 0, half, sizeWidth));
  g.add(createScore(places.right, scores.right, 270, sizeWidth, half));
  g.add(createScore(places.opposite, scores.opposite, 180, half, 0));
  g.add(createScore(places.left, scores.left, 90, 0, half));

  return { element: g, width: sizeWidth, height: sizeWidth };
};

/**
 * 卓の中央（点数表示）の一辺の長さの下限。
 * 河の一行と中央のボードはこの幅に収まる必要がある。
 * 素の下限は「11111-1」（縦 5 枚 + 横 1 枚）。
 *
 * 上家・下家の点数は中央の左右の辺から 1 行分内側へ垂れるので、
 * ボードにはその分の余白を左右に足した幅を要求する。
 * ドラ表示牌が増えてボードが素の下限より広くなったときにここが効く。
 */
const minCenterWidth = (
  helper: ImageHelper,
  tf: TableFont,
  discardAreas: Seats<BuiltFragment>,
  boardWidth: number,
) => {
  const nominal = helper.tileWidth * 5 + helper.tileHeight * 1; // 11111-1
  return Math.max(
    nominal,
    boardWidth + tf.em * 2,
    maxOfSeats(discardAreas, (a) => a.width),
  );
};

/**
 * 麻雀卓の SVG 要素を作成する。
 *
 * 卓は「中央の正方形 + 四方に同じ厚みの外周（河 + 手牌 + 余白）」として組む。
 * 卓の一辺は手牌の広さでも決まるが、その余りは外周ではなく中央の正方形に吸わせる。
 * 外周に配ると河が手牌から離れて中央へ浮いてしまうため。
 */
export const createTable = (
  table: TableInput,
  options: RenderOptions = {},
): SVGFragment => roundSize(buildTable(new ImageHelper(options), table));

/**
 * 卓を組み立てる。ヘルパを共有したい内部の合成から使う。
 */
export const buildTable = (
  helper: ImageHelper,
  { hands: handsProps, discards: discardsProps, scoreBoard: scoreBoardProps }: TableInput,
): BuiltFragment => {
  const g = new G();
  // 文字の寸法は牌のスケールから導く。呼び出し側が牌と文字で別々の値を渡せないようにする。
  const ctx = tableFont(helper);

  const handAreas = mapSeats(handsProps, (blocks) => buildHand(helper, blocks));
  const discardAreas = mapSeats(discardsProps, (tiles) =>
    createDiscardArea(tiles, helper),
  );

  const maxHandHeight = maxOfSeats(handAreas, (a) => a.height);
  const maxHandWidth = maxOfSeats(handAreas, (a) => a.width);
  const maxDiscardHeight = maxOfSeats(discardAreas, (a) => a.height);

  // 外周の厚み。一番深い河と一番背の高い手牌が四方どこでも収まるようにする。
  const ringWidth =
    maxDiscardHeight + maxHandHeight + helper.blockMargin * 1.5;
  // 河は手牌のすぐ内側に置く。
  const discardOffset = maxHandHeight + helper.blockMargin;

  // 手牌が広い場合、卓はその分だけ大きくなる。差分は中央の正方形が受け持つ。
  const centerWidth = Math.max(
    minCenterWidth(
      helper,
      ctx,
      discardAreas,
      stickAndDoraWidth(helper, ctx, scoreBoardProps),
    ),
    maxHandWidth + helper.tileWidth * 2 + helper.blockMargin - ringWidth * 2,
  );
  const sizeWidth = centerWidth + ringWidth * 2;

  const scoreBoard = createScoreBoard(helper, ctx, scoreBoardProps, centerWidth);
  scoreBoard.element.translate(ringWidth, ringWidth);

  g.add(layoutSeats(handAreas, sizeWidth, 0));
  g.add(layoutSeats(discardAreas, sizeWidth, discardOffset));
  g.add(scoreBoard.element);
  return { element: g, width: sizeWidth, height: sizeWidth };
};
