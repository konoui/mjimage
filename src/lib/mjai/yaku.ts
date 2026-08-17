import { Yaku } from "../calculator";
import { MjaiYaku } from "./types";

// 日本語の役名（calculator/yaku.ts）→ mjai の識別子（gimite の hora.rb 由来）。
//
// mjai 側が粗いところが 3 つある。
//   - 白 / 發 / 中 は 1 つの sangenpai にまとまり、飜が合算される
//   - 国士無双13面待ち・四暗刻単騎待ちは通常形と区別が無く、飜だけが倍になる
//   - 天和 / 地和（tenho / chiho）は mjimage に無いので、この表にも現れない
//
// 表の網羅性は型では守れない。YAKU / YAKUMAN は `readonly YakuDef[]` として
// 宣言されていて name が string に広がるため、リテラルの union を導出できない。
// 代わりに __tests__ が全定義を回して未対応が無いことを検査する。

const YAKU_TO_MJAI: Readonly<Record<string, string>> = {
  立直: "reach",
  ダブル立直: "double_reach",
  一発: "ippatsu",
  門前清自摸和: "menzenchin_tsumoho",
  平和: "pinfu",
  断么九: "tanyaochu",
  一盃口: "ipeko",
  二盃口: "ryanpeko",
  自風: "jikaze",
  場風: "bakaze",
  // 三元牌は mjai では 1 エントリに合算される（3 つ揃えば ["sangenpai", 3]）
  白: "sangenpai",
  發: "sangenpai",
  中: "sangenpai",
  嶺上開花: "rinshankaiho",
  搶槓: "chankan",
  海底摸月: "haiteiraoyue",
  河底撈魚: "hoteiraoyui",
  七対子: "chitoitsu",
  三色同順: "sanshokudojun",
  三色同刻: "sanshokudoko",
  一気通貫: "ikkitsukan",
  対々和: "toitoiho",
  三暗刻: "sananko",
  三槓子: "sankantsu",
  小三元: "shosangen",
  混老頭: "honroto",
  混全帯么九: "honchantaiyao",
  純全帯么九: "junchantaiyao",
  混一色: "honiso",
  清一色: "chiniso",
  // 役満
  国士無双: "kokushimuso",
  国士無双13面待ち: "kokushimuso",
  九蓮宝燈: "churenpoton",
  四暗刻: "suanko",
  四暗刻単騎待ち: "suanko",
  大三元: "daisangen",
  字一色: "tsuiso",
  清老頭: "chinroto",
  四槓子: "sukantsu",
  小四喜: "shosushi",
  大四喜: "daisushi",
  緑一色: "ryuiso",
  // ドラ
  ドラ: "dora",
  赤ドラ: "akadora",
  裏ドラ: "uradora",
};

/** 日本語の役名に対応する mjai の識別子。未対応なら undefined。 */
export const toMjaiYakuName = (name: string): string | undefined =>
  YAKU_TO_MJAI[name];

/** 対応表に載っている日本語の役名すべて。テストの網羅性検査に使う。 */
export const mjaiYakuNames = (): readonly string[] => Object.keys(YAKU_TO_MJAI);

/**
 * 役の一覧を mjai の形（`[識別子, 飜]` の配列）にする。
 *
 * 同じ識別子に落ちる役は 1 エントリにまとめ、飜を足す。白・發・中が
 * `["sangenpai", 3]` になるのがこの規則。並びは最初に現れた順を保つので、
 * calculator が返す順序（YAKU の定義順）がそのまま出る。
 *
 * 対応表に無い役は落とし、`unknown` に名前を積む。呼ぶ側でログに出すこと
 * （進行は止めない、という controller と同じ方針）。
 */
export const toMjaiYakus = (
  yakus: readonly Yaku[]
): { yakus: MjaiYaku[]; unknown: string[] } => {
  const order: string[] = [];
  const fans = new Map<string, number>();
  const unknown: string[] = [];

  for (const y of yakus) {
    const name = toMjaiYakuName(y.name);
    if (name == null) {
      unknown.push(y.name);
      continue;
    }
    if (!fans.has(name)) order.push(name);
    fans.set(name, (fans.get(name) ?? 0) + y.han);
  }

  return {
    yakus: order.map((name): MjaiYaku => [name, fans.get(name)!]),
    unknown: unknown,
  };
};
