import { Tile, Parser } from "../core/";
import {
  ImageHelper,
  ImageHelperConfig,
  drawTable,
  createTable,
} from "../image";
import {
  DiscardsInput,
  ScoreBoardInput,
  HandsInput,
} from "../image/table-parser";
import { TABLE_CONTEXT, TYPE, ROUND_MAP, WIND_MAP } from "../core/constants";

import { loadTestData, loadInputData, SVG } from "./utils/helper";

const helperConfig: ImageHelperConfig = {
  imageHostUrl: "https://static.konoui.dev/mjimage/svg/",
  scale: 0.4,
};

const update = false;

describe("table yaml to svg", () => {
  const tests = [
    {
      name: "specify all params",
      gotFilename: "yaml-to-svg.common.svg",
      inputFilename: "table.common.yaml",
    },
    {
      name: "omit params",
      gotFilename: "yaml-to-svg.omit.svg",
      inputFilename: "table.omit.yaml",
    },
    // カンドラを含む複数のドラ表示牌。中央の広さが表示牌の枚数に追随する。
    {
      name: "multiple dora indicators",
      gotFilename: "yaml-to-svg.dora-indicators.svg",
      inputFilename: "table.dora-indicators.yaml",
    },
  ];

  for (const t of tests) {
    test(t.name, () => {
      const input = loadInputData(t.inputFilename);

      const draw = SVG();
      drawTable(draw, input, helperConfig, { responsive: true });

      const got = draw.svg();
      const want = loadTestData(t.gotFilename, got, update);
      expect(want.toString()).toBe(got);
    });
  }
});

describe("createTable", () => {
  test("max-table-size", () => {
    const sampleDiscard = "123456789s12-3456789m1234p";
    const p = new Parser(sampleDiscard).tiles();

    const sampleHand = "2s, -1111p, -1111s, -1111m, -2222m, t3s";
    const blocks = new Parser(sampleHand).parse();

    const hands: HandsInput = {
      front: blocks,
      right: blocks,
      opposite: blocks,
      left: blocks,
    };
    const discards: DiscardsInput = {
      front: p,
      right: p,
      opposite: p,
      left: p,
    };
    const scoreBoard: ScoreBoardInput = {
      round: "南４局",
      scores: {
        front: 100,
        right: 200,
        opposite: 25000,
        left: 9000,
      },
      frontPlace: "西",
      sticks: {
        reach: 1,
        dead: 3,
      },
      doraIndicators: [new Tile(TYPE.M, 3)],
    };

    const helper = new ImageHelper(helperConfig);
    const g = createTable(helper, hands, discards, scoreBoard);

    const draw = SVG();
    draw.add(g.e);
    const got = draw.svg();
    const want = loadTestData("table.max-size.svg", got, update);
    expect(want.toString()).toBe(got);
  });

  test("dynamic-hands-size", () => {
    const sampleDiscard = "1p";
    const p = new Parser(sampleDiscard).tiles();

    const sampleHand = "123456789s1234m";
    const blocks = new Parser(sampleHand).parse();
    const hands: HandsInput = {
      front: new Parser("123456789s1234m, t3s").parse(),
      right: blocks,
      opposite: blocks,
      left: blocks,
    };
    const discards: DiscardsInput = {
      front: p,
      right: p,
      opposite: p,
      left: p,
    };
    const scoreBoard: ScoreBoardInput = {
      round: "南４局",
      scores: {
        front: 100,
        right: 200,
        opposite: 25000,
        left: 9000,
      },
      frontPlace: "西",
      sticks: {
        reach: 1,
        dead: 3,
      },
      doraIndicators: [new Tile(TYPE.M, 3)],
    };

    const helper = new ImageHelper(helperConfig);
    const g = createTable(helper, hands, discards, scoreBoard);

    const draw = SVG();
    draw.add(g.e);
    const got = draw.svg();
    const want = loadTestData("table.dynamic-size.svg", got, update);
    expect(want.toString()).toBe(got);
  });

  // 4 家の捨て牌の枚数が揃っていない場合。河がそれぞれの家の辺に接し、
  // 他家の枚数につられて中央へ浮かないことを固定する。
  test("uneven-discards", () => {
    const blocks = new Parser("123456789s1234m").parse();
    const hands: HandsInput = {
      front: blocks,
      right: blocks,
      opposite: blocks,
      left: blocks,
    };
    const discards: DiscardsInput = {
      front: new Parser("1p").tiles(),
      right: new Parser("123456789s123456789m123456p").tiles(),
      opposite: new Parser("123456789s12-3456m").tiles(),
      left: new Parser("").tiles(),
    };
    const scoreBoard: ScoreBoardInput = {
      round: "西１局",
      scores: { front: 100, right: 200, opposite: 25000, left: 9000 },
      frontPlace: "北",
      sticks: { reach: 1, dead: 3 },
      doraIndicators: [new Tile(TYPE.M, 3)],
    };

    const helper = new ImageHelper(helperConfig);
    const g = createTable(helper, hands, discards, scoreBoard);

    const draw = SVG();
    draw.add(g.e);
    const got = draw.svg();
    const want = loadTestData("table.uneven-discards.svg", got, update);
    expect(want.toString()).toBe(got);
  });
});

describe("createTable layout invariants", () => {
  const blocks = new Parser("123456789s1234m").parse();
  const hands: HandsInput = {
    front: blocks,
    right: blocks,
    opposite: blocks,
    left: blocks,
  };
  const discards: DiscardsInput = {
    front: new Parser("123456m").tiles(),
    right: new Parser("123456m").tiles(),
    opposite: new Parser("123456m").tiles(),
    left: new Parser("123456m").tiles(),
  };
  const baseScoreBoard: ScoreBoardInput = {
    round: "東１局",
    scores: { front: 25000, right: 25000, opposite: 25000, left: 25000 },
    frontPlace: "東",
    sticks: { reach: 1, dead: 3 },
    doraIndicators: [new Tile(TYPE.M, 3)],
  };

  const render = (scoreBoard: ScoreBoardInput, config = helperConfig) => {
    const draw = SVG();
    draw.add(
      createTable(new ImageHelper(config), hands, discards, scoreBoard).e,
    );
    return draw.svg();
  };

  // 点数の桁数は文字の中身にしか出てはいけない。座標に出るなら寄せがずれている。
  test("score digits do not move anything", () => {
    const mask = (svg: string) => svg.replace(/([東南西北]) -?\d+</g, "$1 N<");
    const base = mask(render(baseScoreBoard));
    for (const scores of [
      { front: 1, right: 22, opposite: 333, left: 4444 },
      { front: 100000, right: 0, opposite: 8, left: 96000 },
    ]) {
      expect(mask(render({ ...baseScoreBoard, scores }))).toBe(base);
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
    const base = mask(render(baseScoreBoard));
    for (const round of Object.values(ROUND_MAP)) {
      expect(mask(render({ ...baseScoreBoard, round }))).toBe(base);
    }
  });

  // 起家が変わっても風の並びが回るだけで、配置は変わらない。
  test("front place does not move anything", () => {
    const mask = (svg: string) => svg.replace(/>[東南西北] /g, ">W ");
    const base = mask(render(baseScoreBoard));
    for (const frontPlace of Object.values(WIND_MAP)) {
      expect(mask(render({ ...baseScoreBoard, frontPlace }))).toBe(base);
    }
  });

  // 文字の大きさは牌のスケールから導かれる。呼び出し側が牌と文字で別々の
  // 値を渡せる余地がないことを、出力の font-size で確認する。
  test("font size follows the tile scale", () => {
    for (const scale of [0.2, 0.4, 0.8, 1.6]) {
      const svg = render(baseScoreBoard, { ...helperConfig, scale });
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
    const svg = render(baseScoreBoard, {
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
      render(baseScoreBoard, { ...helperConfig, scale: 0.4 }),
      0.4,
    );
    for (const scale of [0.2, 0.8, 1.6]) {
      const got = normalize(
        render(baseScoreBoard, { ...helperConfig, scale }),
        scale,
      );
      expect(got).toEqual(base);
    }
  });

  // SVG を走査して、条件に合う牌画像の外接矩形を求める。g の transform を合成する。
  const boundsOf = (svg: string, match: (href: string) => boolean) => {
    type M = [number, number, number, number, number, number];
    const compose = (a: M, b: M): M => [
      a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
      a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
    ];
    const stack: M[] = [[1, 0, 0, 1, 0, 0]];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const m of svg.matchAll(/<(\/?)(g|image)([^>]*)>/g)) {
      const [, close, tag, attrs] = m;
      if (tag === "g") {
        if (close) stack.pop();
        else {
          const t = attrs.match(/matrix\(([^)]*)\)/);
          const mm = (t ? t[1].split(",").map(Number) : [1, 0, 0, 1, 0, 0]) as M;
          stack.push(compose(stack[stack.length - 1], mm));
        }
        continue;
      }
      if (close) continue;
      const href = attrs.match(/href="([^"]*)"/)?.[1] ?? "";
      if (!match(href)) continue;
      const num = (k: string) => Number(attrs.match(new RegExp(`\\s${k}="([-\\d.]+)"`))?.[1] ?? 0);
      const [x, y, w, h] = [num("x"), num("y"), num("width"), num("height")];
      const cm = stack[stack.length - 1];
      for (const [px, py] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
        const gx = cm[0] * px + cm[2] * py + cm[4];
        const gy = cm[1] * px + cm[3] * py + cm[5];
        minX = Math.min(minX, gx); maxX = Math.max(maxX, gx);
        minY = Math.min(minY, gy); maxY = Math.max(maxY, gy);
      }
    }
    return { minX, maxX, minY, maxY };
  };

  // 河は手牌のすぐ内側に置かれる。手牌の広さで卓が大きくなっても、
  // その差分は中央の正方形が吸収するので河は手牌から離れない。
  test("rivers stay next to the hands regardless of hand width", () => {
    const helper = new ImageHelper(helperConfig);
    const river = new Parser("1z1z1z1z1z1z").tiles();
    const inset = (hand: string) => {
      const blocks = new Parser(hand).parse();
      const draw = SVG();
      const table = createTable(
        helper,
        { front: blocks, right: blocks, opposite: blocks, left: blocks },
        { front: river, right: river, opposite: river, left: river },
        baseScoreBoard,
      );
      draw.add(table.e);
      // 卓の下辺から下家の河の下端まで（= 手牌の高さ + 余白）
      return table.height - boundsOf(draw.svg(), (h) => h.endsWith("z1.svg")).maxY;
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
    expect(() => render(none)).not.toThrow();

    const base = count(render(none));
    // 指定した表示牌はすべて描かれる
    for (const n of [1, 2, 3, 4, 5]) {
      const doraIndicators = Array.from({ length: n }, () => new Tile(TYPE.M, 3));
      expect(count(render({ ...baseScoreBoard, doraIndicators }))).toBe(base + n);
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
    const seats = <T,>(v: T) => ({
      front: v,
      right: v,
      opposite: v,
      left: v,
    });

    for (const n of [1, 2, 3, 4, 5]) {
      const doraIndicators = Array.from({ length: n }, () => indicator);
      const draw = SVG();
      const table = createTable(helper, seats(narrowHand), seats(narrowRiver), {
        ...baseScoreBoard,
        doraIndicators,
      });
      draw.add(table.e);
      const svg = draw.svg();

      // 中央の正方形は卓の中心に置かれる。
      const centerWidth = Number(svg.match(/<rect width="([\d.]+)"/)![1]);
      const centerRight = (table.width + centerWidth) / 2;
      const dora = boundsOf(svg, (h) => h.endsWith("z7.svg"));

      expect(centerRight - dora.maxX).toBeGreaterThanOrEqual(em - 1e-6);
    }
  });
});
