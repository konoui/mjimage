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
  PlayerEvent,
  prioritizeDiscardedEvents,
  prioritizeDrawnEvents,
} from "./events";
import type { Controller } from "./controller";

// プレイヤーから返ってきた選択を集め、優先順位に従って 1 つを状態機械に送る。
// 同じイベント ID には同じ種類のイベントしか入らないので、
// 先頭 1 件で種類を見分けてから、種類ごとのハンドラに渡す。

/** イベント ID ごとに、各家から返ってきた選択を溜める。 */
export type MailBox = { [id: string]: PlayerEvent[] };

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
      return afterDiscarded(c, events as ChoiceAfterDiscardedEvent[]);
    case "CHOICE_AFTER_DRAWN":
      return afterDrawn(c, events as ChoiceAfterDrawnEvent[]);
    case "CHOICE_AFTER_CALLED":
      return afterCalled(c, sample);
    case "CHOICE_FOR_REACH_ACCEPTANCE":
      return forReachAcceptance(c, events as ChoiceForReachAcceptance[]);
    case "CHOICE_FOR_CHAN_KAN":
      return forChanKan(c, events as ChoiceForChanKan[]);
    default:
      throw new Error(`controller found an unexpected event: ${sample.type}`);
  }
};

/** 捨て牌に対する選択（ロン・大明槓・ポン・チー）。 */
const afterDiscarded = (
  c: Controller,
  events: readonly ChoiceAfterDiscardedEvent[]
) => {
  const selected = prioritizeDiscardedEvents([...events]);
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
  const selected = prioritizeDrawnEvents([...events]);
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
  const selected = events.filter((e) => e.choices.RON !== false);
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
  const selected = events.filter((e) => e.choices.RON !== false);
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
