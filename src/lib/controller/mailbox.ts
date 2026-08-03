import { assert } from "../assert";
import { OP, Wind } from "../core/";
import {
  Block,
  BlockAnKan,
  BlockDaiKan,
  BlockShoKan,
  Tile,
} from "../core";
import { deserializeWinResult, SerializedWinResult } from "../calculator";
import {
  ChoiceAfterCalled,
  ChoiceAfterDiscardedEvent,
  ChoiceAfterDrawnEvent,
  ChoiceForChanKan,
  ChoiceForReachAcceptance,
  ChoiceReply,
  PlayerEvent,
  orderByTurn,
  prioritizeDiscardedEvents,
  prioritizeDrawnEvents,
} from "./events";
import type { Controller } from "./controller";

// プレイヤーから返ってきた選択を集め、優先順位に従って 1 つを状態機械に送る。
// 同じイベント ID には同じ種類のイベントしか入らないので、
// 先頭 1 件で種類を見分けてから、種類ごとのハンドラに渡す。

/**
 * イベント ID ごとに、各家から返ってきた選択を溜める。
 * イベント ID は種別ごとに振られるので、同じ ID には同じ種別の返信しか入らない。
 */
export type MailBox = { [id: string]: ChoiceReply[] };

/** その種別の返信か。 */
const isType = <T extends ChoiceReply["type"]>(
  e: ChoiceReply,
  type: T
): e is Extract<ChoiceReply, { type: T }> => e.type == type;

/**
 * 溜めた返信を、特定の種別の配列として取り出す。
 * 種別が混ざるのは進行側の組み立て誤りなので、その場で落とす。
 */
const repliesOf = <T extends ChoiceReply["type"]>(
  events: readonly ChoiceReply[],
  type: T
) => {
  const ret: Extract<ChoiceReply, { type: T }>[] = [];
  for (const e of events) {
    assert(
      isType(e, type),
      `[bug] mailbox has mixed replies: want ${type} but got ${e.type}`
    );
    ret.push(e);
  }
  return ret;
};

/** 和了の申告が入り得る選択イベント。 */
type WinChoiceEvent =
  | ChoiceAfterDiscardedEvent
  | ChoiceAfterDrawnEvent
  | ChoiceForReachAcceptance
  | ChoiceForChanKan;

/**
 * 和了の申告を controller の控え（提示した内容）で置き換えた写しを返す。
 *
 * プレイヤーから読むのは「申告したかどうか」だけで、中身は信用しない。
 * 提示していない和了を申告された場合は、理由をログに出してその申告だけ落とす
 * （進行は止めず、他家の鳴きや流局へ倒れる）。
 */
const withOfferedWin = <E extends WinChoiceEvent, K extends "RON" | "TSUMO">(
  c: Controller,
  e: E,
  key: K
): E => {
  // 申告していない（見逃した）ならそのまま。あがるかどうかはプレイヤーが決める。
  const claimed = (e.choices as Record<string, unknown>)[key];
  if (!claimed) return e;

  const offered = c.winOffer(e.id, e.wind);
  if (offered === false) {
    c.logger.error(
      `[${e.id}] ${e.wind} claimed ${key} but it was not offered: ` +
        JSON.stringify(claimed)
    );
    return { ...e, choices: { ...e.choices, [key]: false } };
  }
  return { ...e, choices: { ...e.choices, [key]: offered } };
};

export const pollReplies = (
  c: Controller,
  eventID: string,
  winds: readonly Wind[]
) => {
  const events = c.mailBox[eventID];
  if (events == null)
    throw new Error(
      `${eventID} is not enqueued at ${c.actor.getSnapshot().value}`
    );
  if (events.length != winds.length)
    throw new Error(
      `${eventID}: num of events: got: ${events.length}, want: ${winds.length}`
    );

  const sample = events[0];
  switch (sample.type) {
    case "CHOICE_AFTER_DISCARDED":
      return afterDiscarded(c, repliesOf(events, sample.type));
    case "CHOICE_AFTER_DRAWN":
      return afterDrawn(c, repliesOf(events, sample.type));
    case "CHOICE_AFTER_CALLED":
      return afterCalled(c, sample);
    case "CHOICE_FOR_REACH_ACCEPTANCE":
      return forReachAcceptance(c, repliesOf(events, sample.type));
    case "CHOICE_FOR_CHAN_KAN":
      return forChanKan(c, repliesOf(events, sample.type));
    default: {
      // 型のうえでは網羅済み（sample は never）。復元した記録のように、
      // 型を通っていない入力が来たときのための保険。
      const unexpected = sample as PlayerEvent;
      throw new Error(
        `controller found an unexpected event: ${unexpected.type}`
      );
    }
  }
};

/** 捨て牌に対する選択（ロン・大明槓・ポン・チー）。 */
const afterDiscarded = (
  c: Controller,
  events: readonly ChoiceAfterDiscardedEvent[]
) => {
  const selected = prioritizeDiscardedEvents(
    events.map((e) => withOfferedWin(c, e, "RON"))
  );
  if (selected.events.length == 0) {
    c.actor.send({ type: "" });
    return;
  }
  const e = selected.events[0];
  switch (selected.type) {
    case "RON": {
      assert(e.choices.RON, "RON choice is not available");
      c.actor.send({
        type: selected.type,
        iam: e.wind,
        ret: deserializeWinResult(e.choices.RON),
        targetInfo: {
          wind: e.discarterInfo.wind,
          tile: Tile.from(e.discarterInfo.tile),
        },
      });
      break;
    }
    case "DAI_KAN": {
      assert(e.choices.DAI_KAN, "DAI_KAN choice is not available");
      c.actor.send({
        type: selected.type,
        iam: e.wind,
        block: BlockDaiKan.from(e.choices.DAI_KAN.tiles),
      });
      break;
    }
    case "CHI":
    case "PON": {
      const choices = e.choices[selected.type];
      assert(choices, `${selected.type} choice is not available"`);
      assert(
        selected.events.length == 1,
        `found more than one selected: ${JSON.stringify(selected, null, 2)}`
      );
      c.actor.send({
        type: selected.type,
        iam: e.wind,
        block: Block.deserialize(choices[0]),
      });
      break;
    }
  }
};

/** ツモ番の選択（ツモ・立直・暗槓・加槓・九種九牌・打牌）。 */
const afterDrawn = (
  c: Controller,
  events: readonly ChoiceAfterDrawnEvent[]
) => {
  const selected = prioritizeDrawnEvents(
    events.map((e) => withOfferedWin(c, e, "TSUMO"))
  );
  assert(
    selected.events.length == 1,
    `found more than one selected: ${JSON.stringify(selected, null, 2)}`
  );
  const e = selected.events[0];
  const w = e.wind;
  switch (selected.type) {
    case "TSUMO": {
      assert(e.choices.TSUMO, "TSUMO choice is not available");
      c.actor.send({
        type: selected.type,
        ret: deserializeWinResult(e.choices.TSUMO),
        lastTile: Tile.from(e.drawerInfo.tile),
        iam: w,
      });
      break;
    }
    case "REACH": {
      const candidates = e.choices[selected.type];
      assert(candidates, `${selected.type} candidates are not available`);
      c.actor.send({
        type: "REACH",
        tile: Tile.from(candidates[0].tile),
        iam: w,
      });
      break;
    }
    case "DISCARD": {
      const tiles = e.choices[selected.type];
      assert(tiles, `${selected.type} choice is not available`);
      c.actor.send({
        type: selected.type,
        tile: Tile.from(tiles[0]).clone({ remove: OP.TSUMO }),
        iam: w,
      });
      break;
    }
    case "AN_KAN": {
      const choices = e.choices[selected.type];
      assert(choices, `${selected.type} choice is not available`);
      c.actor.send({
        type: selected.type,
        block: BlockAnKan.from(choices[0].tiles),
        iam: w,
      });
      break;
    }
    case "SHO_KAN": {
      const choices = e.choices[selected.type];
      assert(choices, `${selected.type} choice is not available`);
      c.actor.send({
        type: selected.type,
        block: BlockShoKan.from(choices[0].tiles),
        iam: w,
      });
      break;
    }
    case "DRAWN_GAME_BY_NINE_TERMINALS": {
      c.actor.send({ type: "DRAWN_GAME_BY_NINE_TERMINALS", iam: w });
      break;
    }
  }
};

/** 鳴いた人の打牌。選択肢は打牌しかない。 */
const afterCalled = (c: Controller, e: ChoiceAfterCalled) => {
  assert(
    e.choices.DISCARD,
    `discard candidate tile is not available: ${JSON.stringify(
      e,
      null,
      2
    )} ${c.hand(e.wind).toString()}`
  );
  c.actor.send({
    type: "DISCARD",
    tile: Tile.from(e.choices.DISCARD[0]),
    iam: e.wind,
  });
};

/** 立直宣言牌に対する選択。ロンか、受け入れかのどちらか。 */
const forReachAcceptance = (
  c: Controller,
  events: readonly ChoiceForReachAcceptance[]
) => {
  // 宣言牌へのロンも頭ハネ。立直した人の下家から順に見る。
  const selected = orderByTurn(
    events.map((e) => withOfferedWin(c, e, "RON")),
    events[0].reacherInfo.wind
  ).filter((e) => e.choices.RON !== false);
  if (selected.length == 0) {
    const sample = events[0];
    c.actor.send({
      type: "REACH_ACCEPT",
      reacherInfo: {
        tile: Tile.from(sample.reacherInfo.tile),
        wind: sample.reacherInfo.wind,
      },
    });
    return;
  }

  const e = selected[0];
  c.actor.send({
    type: "RON",
    iam: e.wind,
    ret: deserializeWinResult(e.choices.RON as SerializedWinResult),
    targetInfo: {
      wind: e.reacherInfo.wind,
      tile: Tile.from(e.reacherInfo.tile),
    },
  });
};

/** 加槓に対する選択（チャンカン）。 */
const forChanKan = (c: Controller, events: readonly ChoiceForChanKan[]) => {
  // チャンカンも頭ハネ。カンした人の下家から順に見る。
  const selected = orderByTurn(
    events.map((e) => withOfferedWin(c, e, "RON")),
    events[0].callerInfo.wind
  ).filter((e) => e.choices.RON !== false);
  if (selected.length == 0) {
    c.actor.send({ type: "" });
    return;
  }

  const e = selected[0];
  assert(e.choices.RON, "RON choice is not available");
  c.actor.send({
    type: "RON",
    iam: e.wind,
    ret: deserializeWinResult(e.choices.RON),
    quadWin: true,
    targetInfo: {
      wind: e.callerInfo.wind,
      tile: Tile.from(e.callerInfo.tile),
    },
  });
};
