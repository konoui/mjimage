import { SerializedBlock, Block, Tile } from "../core";
import { OP } from "../core/constants";
import type { ChoiceReply } from "../controller/events";
import { fromMjaiPai, toMjaiPai } from "./pai";
import { MJAI_TYPE, MjaiAction, MjaiDahaiEvent, MjaiPai } from "./types";

// MjaiAction → ChoiceReply（受信方向）。
//
// mjimage の返信は「受け取った選択イベントの choices から、選ぶものだけを残して返す」
// という約束（mailbox.ts）。選ばないものは false にする。
//
// 候補が配列の選択肢は **先頭が採用される**（mailbox.ts の choices[0]）ので、
// bot が指定したものを先頭に並べ替える必要がある。ここがこのファイルの本体。
//
// TSUMO / RON の中身は controller が自分の控えで差し替える（withOfferedWin）ので、
// 真偽だけ合っていればよい。値はそのまま残す。

export type MjaiDecodeWarning = string;

/** 候補が実際に選べるか。`[]` を truthy と誤判定しないよう長さまで見る（events.ts の selectable と同じ）。 */
const selectable = (v: unknown): boolean =>
  Array.isArray(v) ? v.length > 0 : !!v;

/** その選択イベントに選べるものがあるか。無ければ bot に聞く必要がない。 */
export const hasSelectableChoice = (e: ChoiceReply): boolean =>
  Object.values(e.choices as Record<string, unknown>).some(selectable);

/** 牌の多重集合として等しいか。赤は別の牌として扱う（mjai の表記がそうなっている）。 */
const sameTiles = (a: readonly string[], b: readonly string[]): boolean =>
  a.length == b.length && [...a].sort().join() == [...b].sort().join();

/** 鳴きブロックを mjai の牌の並びにする。オペレータは落ちる。 */
const blockPais = (b: SerializedBlock): MjaiPai[] =>
  Block.deserialize(b).tiles.map((t) => toMjaiPai(t) as MjaiPai);

/** 打牌候補の 1 つが指定された牌か。候補にはツモ牌の印が付いていることがある。 */
const isSameDiscard = (candidate: string, want: Tile): boolean => {
  const t = Tile.from(candidate);
  return t.equals(want) && t.has(OP.RED) == want.has(OP.RED);
};

/** 打牌が必須の選択イベントか。この 2 種は DISCARD を残さないと controller が落ちる。 */
const needsDiscard = (e: ChoiceReply): boolean =>
  e.type == "CHOICE_AFTER_DRAWN" || e.type == "CHOICE_AFTER_CALLED";

/**
 * 選択イベントに mjai の行動を反映した返信を作る。
 *
 * 渡された `e` の `choices` を書き換えて返す（`Player` と同じ流儀）。
 * まず全部を `false` にしてから、選んだ 1 つだけを元の値に戻す。
 * 逆（選ばないものを 1 つずつ消す）にすると、選択肢が増えたときに消し漏れて
 * 意図しない行動が通ってしまうので、安全側に倒れるこの向きにしてある。
 *
 * 指定されたものが候補に無い場合は警告を積み、候補の先頭のまま進める
 * （進行は止めない、という controller と同じ方針）。
 *
 * @param reachDahai 立直のとき、続けて bot から受け取った宣言牌（§5.4）
 */
export const applyAction = (
  e: ChoiceReply,
  action: MjaiAction,
  reachDahai?: MjaiDahaiEvent
): MjaiDecodeWarning[] => {
  const warnings: MjaiDecodeWarning[] = [];
  const warn = (m: string) => warnings.push(`[${e.type}] ${m}`);

  const choices = e.choices as Record<string, unknown>;
  const before = { ...choices };

  /** 選択肢をすべて選ばない形にする。打牌が必須のイベントでは DISCARD だけ残す。 */
  const clearAll = () => {
    for (const key of Object.keys(choices)) {
      if (key == "DISCARD" && needsDiscard(e)) continue;
      choices[key] = false;
    }
  };

  /** 消した 1 つを元に戻す。選べなければ警告を積む。 */
  const keep = (key: string): boolean => {
    choices[key] = before[key];
    if (selectable(choices[key])) return true;
    warn(`${key} が提示されていないのに選ばれた`);
    choices[key] = false;
    return false;
  };

  /** 候補の配列から、条件に合うものを先頭へ持ってくる。 */
  const promote = <T>(key: string, match: (v: T) => boolean, label: string) => {
    const list = choices[key];
    if (!Array.isArray(list) || list.length == 0) return;
    const i = (list as T[]).findIndex(match);
    if (i < 0) {
      warn(`${label} が ${key} の候補に無い。候補の先頭で進める`);
      return;
    }
    choices[key] = [list[i], ...list.filter((_, j) => j != i)];
  };

  switch (action.type) {
    case MJAI_TYPE.NONE:
      // 何もしない。打牌が必須の選択イベントでは候補の先頭に倒れる。
      clearAll();
      break;

    case MJAI_TYPE.DAHAI: {
      const want = fromMjaiPai(action.pai);
      clearAll();
      if (!selectable(choices.DISCARD))
        warn(`打牌を指定されたが DISCARD が提示されていない`);
      promote<string>("DISCARD", (v) => isSameDiscard(v, want), action.pai);
      break;
    }

    case MJAI_TYPE.REACH: {
      clearAll();
      if (!keep("REACH")) break;
      if (reachDahai == null) {
        warn(`立直の宣言牌が渡されていない。候補の先頭で進める`);
        break;
      }
      // mailbox の afterDrawn は candidates[0].tile を宣言牌に採る。
      const want = fromMjaiPai(reachDahai.pai);
      promote<{ tile: string }>(
        "REACH",
        (v) => isSameDiscard(v.tile, want),
        reachDahai.pai
      );
      break;
    }

    case MJAI_TYPE.CHI:
    case MJAI_TYPE.PON: {
      const key = action.type == MJAI_TYPE.CHI ? "CHI" : "PON";
      const want = [action.pai, ...action.consumed];
      clearAll();
      if (!keep(key)) break;
      promote<SerializedBlock>(
        key,
        (b) => sameTiles(blockPais(b), want),
        want.join(" ")
      );
      break;
    }

    case MJAI_TYPE.DAIMINKAN:
      // DAI_KAN の候補は 1 つ（配列ではない）ので、残すだけでよい。
      clearAll();
      keep("DAI_KAN");
      break;

    case MJAI_TYPE.KAKAN: {
      const want = [action.pai, ...action.consumed];
      clearAll();
      if (!keep("SHO_KAN")) break;
      promote<SerializedBlock>(
        "SHO_KAN",
        (b) => sameTiles(blockPais(b), want),
        want.join(" ")
      );
      break;
    }

    case MJAI_TYPE.ANKAN: {
      const want = [...action.consumed];
      clearAll();
      if (!keep("AN_KAN")) break;
      promote<SerializedBlock>(
        "AN_KAN",
        (b) => sameTiles(blockPais(b), want),
        want.join(" ")
      );
      break;
    }

    case MJAI_TYPE.HORA:
      // ツモ番なら TSUMO、それ以外はロン。中身は controller が控えで差し替える。
      clearAll();
      keep("TSUMO" in before ? "TSUMO" : "RON");
      break;

    case MJAI_TYPE.RYUKYOKU:
      clearAll();
      keep("DRAWN_GAME_BY_NINE_TERMINALS");
      break;

    default:
      warn(`返信として扱えない行動: ${(action as { type: string }).type}`);
      clearAll();
  }

  return warnings;
};
