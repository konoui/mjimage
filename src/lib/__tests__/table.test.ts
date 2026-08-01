import { Tile, Parser } from "../core/";
import {
  ImageHelper,
  RenderOptions,
  render,
  buildHand,
  buildTable,
} from "../image";
import { Discards, ScoreBoard, Hands, TableInput, Seats } from "../input";
import { TYPE, ROUND_MAP, WIND } from "../core/constants";
import { TABLE_CONTEXT } from "../image/constants";

import { loadInputData, snapshotPath, SVG } from "./utils/helper";
import { placedTiles, boundsOf } from "./utils/geometry";

const helperConfig: RenderOptions = {
  imageHostUrl: "https://static.konoui.dev/mjimage/svg/",
  scale: 0.4,
};

describe("table yaml to svg", () => {
  // 代表として全項目を指定した 1 件だけ全文を比較する。
  // 個々の性質は下の不変条件テストが見る。
  test("specify all params", async () => {
    const input = loadInputData("table.common.yaml");
    const got = render(input, helperConfig).svg.svg();
    await expect(got).toMatchFileSnapshot(
      snapshotPath("yaml-to-svg.common.svg"),
    );
  });

  // 省略した家・項目には既定値が入り、4 家ぶんが揃って描かれる。
  test("omitted seats and params fall back to defaults", () => {
    const svg = render(loadInputData("table.omit.yaml"), helperConfig).svg.svg();

    // 起家は 2z（南）。そこから時計回りに 4 家ぶんの点数が並ぶ。
    for (const place of ["南", "西", "北", "東"])
      expect(svg).toContain(`>${place} 25000<`);
    // 局・供託棒の既定値
    expect(svg).toContain(">東１局<");
    expect(svg.match(/>0</g)).toHaveLength(2);
    // 手牌も河も無い家があっても落ちない
    expect(() => render("table:\n  board:\n", helperConfig)).not.toThrow();
  });

  // 注記のオプションは手牌と卓のどちらの入力でも効く。
  // 設定はヘルパが解決済みで持ち、卓の中の手牌も同じヘルパで組み立てられる。
  test("annotation options apply to the table as well as to a hand", () => {
    const input = "table:\n  1z:\n    hand: d2s,t3s\n";

    const enabled = render(input, helperConfig).svg.svg();
    expect(enabled).toContain("(ドラ)");
    expect(enabled).toContain("(ツモ)");

    const disabled = render(input, {
      ...helperConfig,
      enableDoraText: false,
      enableTsumoText: false,
    }).svg.svg();
    expect(disabled).not.toContain("(ドラ)");
    expect(disabled).not.toContain("(ツモ)");
  });

  // 戻り値の寸法は、レスポンシブ時に呼び出し側が大きさを決めるための唯一の手掛かり。
  // 卓を組み立て直さずに済むよう、viewBox と同じ値を返す。
  test("render returns the drawn size", () => {
    const input = loadInputData("table.common.yaml");
    const { svg, width, height } = render(input, helperConfig);

    expect(width).toBeGreaterThan(0);
    expect(svg.svg()).toContain(`viewBox="0 0 ${width} ${height}"`);
  });
});

// 4 家に同じものを配る。卓のレイアウトを見るテストでは家ごとの違いは要らない。
const seats = <T,>(v: T): Seats<T> => ({
  front: v,
  right: v,
  opposite: v,
  left: v,
});

const baseScoreBoard: ScoreBoard = {
  round: "東１局",
  scores: { front: 25000, right: 25000, opposite: 25000, left: 25000 },
  frontPlace: WIND.E,
  sticks: { reach: 1, dead: 3 },
  doraIndicators: [new Tile(TYPE.M, 3)],
};

const drawTable = (helper: ImageHelper, table: TableInput) => {
  const t = buildTable(helper, table);
  const draw = SVG();
  draw.add(t.element);
  return { svg: draw.svg(), width: t.width, height: t.height };
};

// 卓の骨格。全文スナップショットが暗黙に守っていた性質を、性質のまま確かめる。
describe("createTable layout", () => {
  // 卓は正方形で、描かれるものはすべてその内側に収まる。
  // 手牌の左右には牌 1 枚分以上が残り、辺に垂れる点数と重ならない。
  test("nothing is drawn outside the table", () => {
    const helper = new ImageHelper(helperConfig);
    // 鳴きと裏牌とツモ牌を含む、一番広くなる形。
    const hand = new Parser("2s, -1111p, -1111s, -1111m, -2222m, t3s").parse();
    const river = new Parser("123456789s12-3456789m1234p").tiles();

    const { svg, width, height } = drawTable(helper, {
      hands: seats(hand),
      discards: seats(river),
      scoreBoard: baseScoreBoard,
    });

    expect(width).toBe(height);
    for (const t of placedTiles(svg)) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.x + t.width).toBeLessThanOrEqual(width + 1e-6);
      expect(t.y + t.height).toBeLessThanOrEqual(height + 1e-6);
    }

    const handWidth = buildHand(helper, hand).width;
    expect((width - handWidth) / 2).toBeGreaterThanOrEqual(helper.tileWidth);
  });

  // 手牌が広い家があると卓も広がる。広がった分は中央の正方形が引き受ける
  // （外周の厚みが変わらないことは "rivers stay next to the hands" が見る）。
  test("the table grows with the widest hand", () => {
    const helper = new ImageHelper(helperConfig);
    const river = new Parser("1p").tiles();
    const widthOf = (hand: string) =>
      drawTable(helper, {
        hands: { ...seats(new Parser("1m").parse()), front: new Parser(hand).parse() },
        discards: seats(river),
        scoreBoard: baseScoreBoard,
      }).width;

    const widths = [
      "1m",
      "123456789m1234m",
      "123456789m1234m, t3m",
      "2m, -1111m, -2222m, -3333m, -4444m",
    ].map(widthOf);
    for (let i = 1; i < widths.length; i++)
      expect(widths[i]).toBeGreaterThan(widths[i - 1]);
  });

  // 河はそれぞれ自分の辺に貼り付く。枚数が家ごとに違っても、
  // 一番深い河につられて中央へ浮いたりしない。
  test("each river sticks to its own side even when the counts differ", () => {
    const helper = new ImageHelper(helperConfig);
    const hand = new Parser("123456789m1234m").parse();
    // 家ごとに違う字牌を捨てて、河を出力から拾い分けられるようにする。
    const river = (n: number, t: number) =>
      new Parser(`${`${t}z`.repeat(n)}`).tiles();

    const { svg, width, height } = drawTable(helper, {
      hands: seats(hand),
      discards: {
        front: river(13, 1),
        right: river(1, 2),
        opposite: river(7, 3),
        left: river(3, 4),
      },
      scoreBoard: baseScoreBoard,
    });

    // 河と自分の辺との距離は、手牌の高さ + 余白。四方で等しい。
    const inset = helper.tileHeight + helper.blockMargin;
    const at = (id: string) => boundsOf(svg, (h) => h.endsWith(`${id}.svg`));
    expect(height - at("z1").maxY).toBeCloseTo(inset, 6);
    expect(width - at("z2").maxX).toBeCloseTo(inset, 6);
    expect(at("z3").minY).toBeCloseTo(inset, 6);
    expect(at("z4").minX).toBeCloseTo(inset, 6);
  });

  // 河は RIVER_ROW_SIZE 枚ごとに折り返し、行は牌の高さぶんずつ下へ伸びる。
  test("a river wraps every RIVER_ROW_SIZE tiles", () => {
    const helper = new ImageHelper(helperConfig);
    const size = TABLE_CONTEXT.RIVER_ROW_SIZE;
    const { svg } = drawTable(helper, {
      hands: seats(new Parser("1m").parse()),
      discards: {
        ...seats(new Parser("").tiles()),
        // 2 行と半端 1 枚。
        opposite: new Parser("1z".repeat(size * 2 + 1)).tiles(),
      },
      scoreBoard: baseScoreBoard,
    });

    // 対面の河は 180 度回るので、行は上から数えて下へ伸びる向きが反転する。
    const rows = new Map<number, number>();
    for (const t of placedTiles(svg).filter((t) => t.href.endsWith("z1.svg")))
      rows.set(t.y, (rows.get(t.y) ?? 0) + 1);
    expect([...rows.values()].sort((a, b) => b - a)).toEqual([size, size, 1]);
    const ys = [...rows.keys()].sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++)
      expect(ys[i] - ys[i - 1]).toBeCloseTo(helper.tileHeight, 6);
  });
});

describe("createTable layout invariants", () => {
  const hands: Hands = seats(new Parser("123456789s1234m").parse());
  const discards: Discards = seats(new Parser("123456m").tiles());

  const renderBoard = (scoreBoard: ScoreBoard, config = helperConfig) =>
    drawTable(new ImageHelper(config), { hands, discards, scoreBoard }).svg;

  // 点数の桁数は文字の中身にしか出てはいけない。座標に出るなら寄せがずれている。
  test("score digits do not move anything", () => {
    const mask = (svg: string) => svg.replace(/([東南西北]) -?\d+</g, "$1 N<");
    const base = mask(renderBoard(baseScoreBoard));
    for (const scores of [
      { front: 1, right: 22, opposite: 333, left: 4444 },
      { front: 100000, right: 0, opposite: 8, left: 96000 },
    ]) {
      expect(mask(renderBoard({ ...baseScoreBoard, scores }))).toBe(base);
    }
  });

  // 局の表記は全角で統一する。半角数字が混ざると描画時の実幅だけが変わり、
  // SVG の属性には現れないまま中央からずれる（SVG 文字列の比較では検出できない）。
  test("round labels are all full-width", () => {
    for (const round of Object.values(ROUND_MAP)) {
      expect(round).toMatch(/^[東南西北][１２３４]局$/);
    }
  });

  // 局は風や数字が変わっても同じ位置に置かれる。
  test("round label does not move anything", () => {
    const mask = (svg: string) => svg.replace(/>[東南西北][０-９1-9]局</g, ">R<");
    const base = mask(renderBoard(baseScoreBoard));
    for (const round of Object.values(ROUND_MAP)) {
      expect(mask(renderBoard({ ...baseScoreBoard, round }))).toBe(base);
    }
  });

  // 起家が変わっても風の並びが回るだけで、配置は変わらない。
  test("front place does not move anything", () => {
    const mask = (svg: string) => svg.replace(/>[東南西北] /g, ">W ");
    const base = mask(renderBoard(baseScoreBoard));
    for (const frontPlace of Object.values(WIND)) {
      expect(mask(renderBoard({ ...baseScoreBoard, frontPlace }))).toBe(base);
    }
  });

  // 文字の大きさは牌のスケールから導かれる。呼び出し側が牌と文字で別々の
  // 値を渡せる余地がないことを、出力の font-size で確認する。
  test("font size follows the tile scale", () => {
    for (const scale of [0.2, 0.4, 0.8, 1.6]) {
      const svg = renderBoard(baseScoreBoard, { ...helperConfig, scale });
      const sizes = [...svg.matchAll(/font-size="([\d.]+)"/g)].map((m) =>
        Number(m[1]),
      );
      const em = TABLE_CONTEXT.BASE * scale;
      // 局・点数は 1em、供託棒の本数だけ 0.7em
      expect(new Set(sizes)).toEqual(new Set([em, em * 0.7]));
    }
  });

  // フォントは ImageHelperConfig で差し替えられる。
  test("font family comes from the helper config", () => {
    const svg = renderBoard(baseScoreBoard, {
      ...helperConfig,
      fontFamily: "Noto Sans JP",
    });
    expect(svg).toContain('font-family="Noto Sans JP"');
    expect(svg).not.toContain("MS Gothic");
  });

  // 卓全体はスケールに対して線形。座標をスケールで割れば一致する。
  test("geometry is linear in scale", () => {
    // 座標・寸法・平行移動成分だけを取り出す。
    // matrix の回転成分 (a,b,c,d) と牌のファイル名はスケールに依らないので対象外。
    const normalize = (svg: string, scale: number) => {
      const nums: number[] = [];
      const push = (v: string) => nums.push(Math.round((Number(v) / scale) * 1e4) / 1e4);
      for (const m of svg.matchAll(/\s(?:x|y|width|height|font-size)="(-?[\d.e-]+)"/g))
        push(m[1]);
      for (const m of svg.matchAll(/matrix\(([^)]*)\)/g)) {
        const [, , , , e, f] = m[1].split(",");
        push(e);
        push(f);
      }
      return nums;
    };
    const base = normalize(
      renderBoard(baseScoreBoard, { ...helperConfig, scale: 0.4 }),
      0.4,
    );
    for (const scale of [0.2, 0.8, 1.6]) {
      const got = normalize(
        renderBoard(baseScoreBoard, { ...helperConfig, scale }),
        scale,
      );
      expect(got).toEqual(base);
    }
  });

  // 河は手牌のすぐ内側に置かれる。手牌の広さで卓が大きくなっても、
  // その差分は中央の正方形が吸収するので河は手牌から離れない。
  test("rivers stay next to the hands regardless of hand width", () => {
    const helper = new ImageHelper(helperConfig);
    const river = new Parser("1z1z1z1z1z1z").tiles();
    const inset = (hand: string) => {
      const table = drawTable(helper, {
        hands: seats(new Parser(hand).parse()),
        discards: seats(river),
        scoreBoard: baseScoreBoard,
      });
      // 卓の下辺から下家の河の下端まで（= 手牌の高さ + 余白）
      return table.height - boundsOf(table.svg, (h) => h.endsWith("z1.svg")).maxY;
    };
    // 手牌はいずれも高さ 1 枚分。幅だけが違う。
    for (const hand of [
      "1234567m",
      "123456789m1234m",
      "123456789m1234m, t3m",
      "2m, -1111m, -2222m, -3333m, -4444m",
    ]) {
      expect(inset(hand)).toBeCloseTo(helper.tileHeight + helper.blockMargin, 6);
    }
  });

  test("dora indicators", () => {
    const count = (svg: string) => (svg.match(/<image/g) ?? []).length;
    const none = { ...baseScoreBoard, doraIndicators: [] };
    // 空でも落ちない
    expect(() => renderBoard(none)).not.toThrow();

    const base = count(renderBoard(none));
    // 指定した表示牌はすべて描かれる
    for (const n of [1, 2, 3, 4, 5]) {
      const doraIndicators = Array.from({ length: n }, () => new Tile(TYPE.M, 3));
      expect(count(renderBoard({ ...baseScoreBoard, doraIndicators }))).toBe(
        base + n,
      );
    }
  });

  // ドラ表示牌が増えるとボードは横に伸びるが、中央の左右の辺から 1 行分内側へ
  // 垂れる点数には重ならない。伸びた分は中央の正方形が引き受ける。
  test("dora indicators do not run into the scores", () => {
    const helper = new ImageHelper(helperConfig);
    const em = TABLE_CONTEXT.BASE * helper.scale;
    // 手牌にも河にも現れない牌を使い、表示牌だけを拾えるようにする。
    const indicator = new Tile(TYPE.Z, 7);
    // 中央の広さがボードだけで決まるよう、手牌と河は最小にする。
    const narrowHand = new Parser("1m").parse();
    const narrowRiver = new Parser("1p").tiles();

    for (const n of [1, 2, 3, 4, 5]) {
      const doraIndicators = Array.from({ length: n }, () => indicator);
      const table = drawTable(helper, {
        hands: seats(narrowHand),
        discards: seats(narrowRiver),
        scoreBoard: { ...baseScoreBoard, doraIndicators },
      });

      // 中央の正方形は卓の中心に置かれる。
      const centerWidth = Number(table.svg.match(/<rect width="([\d.]+)"/)![1]);
      const centerRight = (table.width + centerWidth) / 2;
      const dora = boundsOf(table.svg, (h) => h.endsWith("z7.svg"));

      expect(centerRight - dora.maxX).toBeGreaterThanOrEqual(em - 1e-6);
    }
  });
});
