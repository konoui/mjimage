import { Wind, TYPE, WIND, OP } from "../core/constants";
import {
  CallEvent,
  ChoiceAfterCalled,
  ChoiceAfterDiscardedEvent,
  ChoiceAfterDrawnEvent,
  ChoiceForChanKan,
  ChoiceForReachAcceptance,
  DiscardEvent,
  DistributeEvent,
  DrawEvent,
  EndEvent,
  NewDoraEvent,
  ReachAcceptedEvent,
  PlayerEvent,
  ReachEvent,
  RonEvent,
  TsumoEvent,
} from "./events";
import type { Controller } from "./controller";
import {
  BlockAnKan,
  BlockChi,
  BlockDaiKan,
  BlockPon,
  BlockShoKan,
  Block,
  Tile,
  WindMap,
  nextWind,
  createWindMap,
} from "../core";
import {
  TileAnalysis,
  SerializedTileAnalysis,
  ShantenCalculator,
  WinResult,
  SerializedWinResult,
  serializeWinResult,
} from "./../calculator";
import { assert } from "../assert";

/**
 * 状態機械が持つのは「局の途中の状態」だけ。
 * Controller とイベント ID の採番はマシンを作るときのクロージャで持つ
 * （context に入れると直列化できず、スナップショットを保存・復元できない）。
 */
type ControllerContext = {
  currentWind: Wind;
  oneShotMap: { [w in Wind]: boolean };
  missingMap: { [w in Wind]: boolean };
  /**
   * 明槓（大明槓・加槓）でめくる新ドラの持ち越し。
   * 暗槓はカンの直後にめくるが、明槓はカンした人が打牌したあとにめくるため、
   * カンの文脈を打牌まで運ぶ必要がある。
   */
  pendingNewDora: boolean;
};

import { assign, enqueueActions, setup } from "xstate";

/** ノーテン罰符の合計。テンパイした人で分け、していない人で割って払う。 */
const NOTEN_PENALTY = 3000;

/** 4 家それぞれに、その家向けのイベントを配る。 */
const broadcast = <E extends PlayerEvent>(
  c: Controller,
  make: (w: Wind) => E
) => {
  for (const w of Object.values(WIND)) c.emit(make(w));
};

/** 風ごとのフラグを 1 つだけ変えた新しいマップを返す。 */
const withWind = <T>(m: WindMap<T>, w: Wind, v: T): WindMap<T> => ({
  ...m,
  [w]: v,
});

/** 新ドラを 1 枚めくって 4 家に知らせる。 */
const openNewDora = (c: Controller, id: string) => {
  const tile = c.wall.openDoraIndicator();
  broadcast(c, (w) => {
    const e: NewDoraEvent = {
      id: id,
      type: "NEW_DORA",
      wind: w,
      doraIndicator: tile.toString(),
    };
    return e;
  });
};

// アクションに渡す params の形。
// setup() でも params の型までは付けられなかった（実装に enqueueActions を使うと、
// アクションの型が自分自身を参照する形になり推論が回らない）。
// 名前が合っているかは setup() が見てくれるので、ここは形の宣言に留める。
/** カンの後の嶺上牌を引くときだけ `{ action: "kan" }` が渡る。 */
type DrawParams = { action: "kan" } | undefined;
/** 嶺上開花になり得る場面だけ `{ replacementWin: true }` が渡る。 */
type DrawnChoiceParams = { replacementWin: boolean } | undefined;

/**
 * 直前の捨て牌に対するロンの可否を 4 家ぶん求める。
 * ロンできるのに見逃せばフリテンになるので、その印もここでつける。
 * 通常の打牌と立直の宣言牌で扱いは同じ。
 */
const ronChoicesForLastDiscard = (
  c: Controller,
  context: ControllerContext,
  eventID: string
) => {
  const discarded = c.river.lastTile;
  const ltile = discarded.t.clone({ add: OP.HORIZONTAL });
  const rons = createWindMap<SerializedWinResult | false>(() => false);
  // ロンできるのに見逃せばフリテン。呼び出し側が missingMap に反映する。
  const missingMap = { ...context.missingMap };
  for (const w of Object.values(WIND)) {
    rons[w] = offerWin(
      c,
      eventID,
      w,
      c.doWin(w, ltile, {
        winBy: { type: "ron", from: discarded.w },
        oneShot: context.oneShotMap[w],
        missingRon: context.missingMap[w],
      })
    );
    // 次のツモ番で解除される想定
    if (rons[w]) missingMap[w] = true;
  }
  return {
    discarded: discarded,
    ltile: ltile,
    rons: rons,
    missingMap: missingMap,
  };
};

const serializeBlocksOrFalse = (b: readonly Block[] | false) => {
  if (b === false) return false;
  return b.map((v) => v.serialize());
};

const serializeBlockOrFalse = (b: Block | false) => {
  if (b === false) return false;
  return b.serialize();
};

const serializeTileAnalyses = (
  cs: readonly TileAnalysis[] | false
): readonly SerializedTileAnalysis[] | false => {
  if (cs === false) return false;
  return cs.map((c) => {
    return {
      tile: c.tile.toString(),
      effectiveTiles: c.effectiveTiles.map((v) => v.toString()),
      shanten: c.shanten,
    };
  });
};

/**
 * 和了を選択肢として提示し、同じ内容を controller に控える。
 *
 * 返信では控えの側を使うので（`mailbox.ts`）、プレイヤーが書き換えた写しは点数に影響しない。
 */
const offerWin = (
  c: Controller,
  eventID: string,
  w: Wind,
  ret: WinResult | false
) => {
  const serialized = ret === false ? false : serializeWinResult(ret);
  c.recordWinOffer(eventID, w, serialized);
  return serialized;
};

/** 状態機械が受け取るイベント。 */
type ControllerEvent =
  | { type: "" }
  | { type: "NEXT" }
  | { type: "CHI"; block: BlockChi; iam: Wind }
  | { type: "PON"; block: BlockPon; iam: Wind }
  | {
      type: "RON";
      ret: WinResult;
      iam: Wind;
      targetInfo: { wind: Wind; tile: Tile };
      quadWin?: boolean;
    }
  | { type: "TSUMO"; ret: WinResult; iam: Wind; lastTile: Tile }
  | { type: "REACH"; tile: Tile; iam: Wind }
  | { type: "REACH_ACCEPT"; reacherInfo: { tile: Tile; wind: Wind } }
  | { type: "DISCARD"; tile: Tile; iam: Wind }
  | { type: "AN_KAN"; block: BlockAnKan; iam: Wind }
  | { type: "SHO_KAN"; block: BlockShoKan; iam: Wind }
  | { type: "DAI_KAN"; block: BlockDaiKan; iam: Wind }
  | { type: "DRAWN_GAME_BY_NINE_TERMINALS"; iam: Wind }
;

export const createControllerMachine = (c: Controller) => {
  const genEventID = incrementalIDGenerator();
  // setup を通すと、states から参照するアクション名・ガード名と
  // その params が型で結びつく（綴り誤りや渡し忘れがコンパイルで止まる）。
  return setup({
    types: {
      context: {} as ControllerContext,
      events: {} as ControllerEvent,
    },
    actions: {
      updateNextWind: assign(({ context }) => ({
        currentWind: nextWind(context.currentWind),
      })),
      notify_distribution: () => {
        const id = genEventID();
        const initHands = c.initialHands();
        broadcast(c, (w) => {
          const hands = createWindMap(() => "_____________");
          hands[w] = initHands[w].toString();
          const e: DistributeEvent = {
            id: id,
            type: "DISTRIBUTE",
            hands: hands,
            wind: w,
            doraIndicator:
              c.wall.doraIndicators[0].toString(),
            sticks: c.placeManager.sticks,
            round: c.placeManager.round,
            players: c.playerIDs,
            places: c.placeManager.playerMap,
            scores: c.scoreManager.summary,
          };
          return e;
        });
        c.next();
      },
      notify_choice_after_drawn: ({ context }, params) => {
        const w = context.currentWind;
        const drawn = c.hand(w).drawn;
        const id = genEventID();
        const e: ChoiceAfterDrawnEvent = {
          id: id,
          type: "CHOICE_AFTER_DRAWN",
          wind: w,
          drawerInfo: { wind: w, tile: drawn!.toString() },
          choices: {
            TSUMO: offerWin(
              c,
              id,
              w,
              c.doWin(w, drawn, {
                winBy: { type: "tsumo" },
                oneShot: context.oneShotMap[w],
                replacementWin: (params as DrawnChoiceParams)?.replacementWin,
              })
            ),
            REACH: serializeTileAnalyses(c.doReach(w)),
            AN_KAN: serializeBlocksOrFalse(c.doAnKan(w)),
            SHO_KAN: serializeBlocksOrFalse(c.doShoKan(w)),
            DISCARD: c.doDiscard(w).map((v) => v.toString()),
            DRAWN_GAME_BY_NINE_TERMINALS:
              c.canDeclareNineTerminalsAbort(w),
          },
        };
        c.emit(e);
        c.pollReplies(id, [w]);
      },
      notify_choice_after_discarded: enqueueActions(({ context, enqueue }) => {
        const id = genEventID();
        const { discarded, ltile, rons, missingMap } =
          ronChoicesForLastDiscard(c, context, id);
        enqueue.assign({ missingMap: missingMap });
        broadcast(c, (w) => {
          const e: ChoiceAfterDiscardedEvent = {
            id: id,
            type: "CHOICE_AFTER_DISCARDED",
            wind: w,
            discarterInfo: {
              wind: discarded.w,
              tile: discarded.t.toString(),
            },
            choices: {
              RON: rons[w],
              PON: serializeBlocksOrFalse(
                c.doPon(w, discarded.w, ltile)
              ),
              CHI: serializeBlocksOrFalse(
                c.doChi(w, discarded.w, ltile)
              ),
              DAI_KAN: serializeBlockOrFalse(
                c.doDaiKan(w, discarded.w, ltile)
              ),
            },
          };
          return e;
        });
        // TODO if no choice, skip enqueue
        c.pollReplies(id, Object.values(WIND));
      }),
      notify_choice_after_called: ({ context }) => {
        const id = genEventID();
        const w = context.currentWind;
        let discard = c.doDiscard(w);

        const called = c
          .hand(context.currentWind)
          .called.at(-1);
        if (called instanceof BlockChi || called instanceof BlockPon)
          discard = c.doDiscard(w, called);
        const e: ChoiceAfterCalled = {
          id: id,
          type: "CHOICE_AFTER_CALLED",
          wind: w,
          choices: {
            DISCARD: discard.map((v) => v.toString()),
          },
        };
        c.emit(e);
        c.pollReplies(id, [w]);
      },
      notify_choice_for_reach_acceptance: enqueueActions(
        ({ context, enqueue }) => {
          const id = genEventID();
          // 立直の宣言牌も「捨て牌に対するロン」なので、可否の求め方は
          // notify_choice_after_discarded と同じ（見逃せばフリテンも同じ）。
          const { discarded, ltile, rons, missingMap } =
            ronChoicesForLastDiscard(c, context, id);
          enqueue.assign({ missingMap: missingMap });
          broadcast(c, (w) => {
            const e: ChoiceForReachAcceptance = {
              id: id,
              type: "CHOICE_FOR_REACH_ACCEPTANCE",
              wind: w,
              reacherInfo: { wind: discarded.w, tile: ltile.toString() },
              choices: { RON: rons[w] },
            };
            return e;
          });
          c.pollReplies(id, Object.values(WIND));
        }
      ),
      notify_choice_for_chankan: enqueueActions(({ context, event, enqueue }) => {
        assert(
          event.type == "SHO_KAN" || event.type == "AN_KAN",
          `unexpected event ${event.type}`
        );
        const id = genEventID();
        const t = event.block.tiles[0].clone({ remove: OP.HORIZONTAL });
        const missingMap = { ...context.missingMap };
        broadcast(c, (w) => {
          const ron = c.doWin(w, t, {
            winBy: { type: "ron", from: event.iam },
            quadWin: true,
            oneShot: context.oneShotMap[w],
            missingRon: context.missingMap[w],
          });
          const e: ChoiceForChanKan = {
            id: id,
            type: "CHOICE_FOR_CHAN_KAN",
            wind: w,
            callerInfo: { wind: event.iam, tile: t.toString() },
            choices: {
              // 暗槓へのチャンカンは国士無双のみ有効という取り決めがあるが、今は認めていない。
              RON: offerWin(c, id, w, event.type == "SHO_KAN" ? ron : false),
            },
          };
          // ロン可能であればフリテンをtrueにする。次のツモ番で解除される想定
          if (e.choices.RON) missingMap[w] = true;
          return e;
        });
        enqueue.assign({ missingMap: missingMap });
        c.pollReplies(id, Object.values(WIND));
      }),
      notify_call: enqueueActions(({ event, enqueue }) => {
        assert(
          event.type == "CHI" ||
            event.type == "PON" ||
            event.type == "DAI_KAN" ||
            event.type == "AN_KAN" ||
            event.type == "SHO_KAN",
          `unexpected event ${event.type}`
        );
        const id = genEventID();
        const iam = event.iam;
        enqueue.assign({ currentWind: iam }); // 鳴いた人の番になる
        broadcast(c, (w) => {
          const e: CallEvent = {
            id: id,
            type: event.type,
            iam: iam,
            wind: w,
            block: event.block.serialize(),
          };
          return e;
        });
        c.next();
      }),
      notify_discard: ({ context, event }) => {
        assert(event.type == "DISCARD", `unexpected event ${event.type}`);
        const id = genEventID();
        const iam = context.currentWind;
        const t = event.tile;
        broadcast(c, (w) => {
          const e: DiscardEvent = {
            id: id,
            type: "DISCARD",
            iam: iam,
            wind: w,
            tile: t.toString(),
          };
          return e;
        });
        c.next();
      },
      notify_draw: enqueueActions(({ context, enqueue }, params) => {
        const id = genEventID();

        const action = (params as DrawParams)?.action;
        const drawn =
          action == "kan"
            ? c.wall.kan()
            : c.wall.draw();

        const iam = context.currentWind;

        // リーチしてなければフリテンを解除
        if (!c.hand(iam).reached)
          enqueue.assign({
            missingMap: withWind(context.missingMap, iam, false),
          });

        broadcast(c, (w) => {
          const t = w == iam ? drawn : new Tile(TYPE.BACK, 0, [OP.TSUMO]); // mask tile for other players
          const e: DrawEvent = {
            id: id,
            type: "DRAW",
            subType: action,
            iam: iam,
            wind: w,
            tile: t.toString(),
          };
          return e;
        });
        c.next();
      }),
      notify_ron: ({ event }) => {
        assert(event.type == "RON");
        const id = genEventID();
        const iam = event.iam;
        broadcast(c, (w) => {
          const e: RonEvent = {
            id: id,
            type: event.type,
            iam: iam,
            wind: w,
            victimInfo: {
              wind: event.targetInfo.wind,
              tile: event.targetInfo.tile.toString(),
            },
            ret: serializeWinResult(event.ret),
          };
          return e;
        });
      },
      notify_tsumo: ({ context, event }) => {
        assert(event.type == "TSUMO", `unexpected event ${event.type}`);
        const id = genEventID();
        const iam = context.currentWind;
        broadcast(c, (w) => {
          const e: TsumoEvent = {
            id: id,
            type: event.type,
            iam: iam,
            wind: w,
            lastTile: c.hand(iam).drawn!.toString(),
            ret: serializeWinResult(event.ret),
          };
          return e;
        });
      },
      notify_reach: enqueueActions(({ context, event, enqueue }) => {
        assert(event.type == "REACH", `unexpected event ${event.type}`);
        const id = genEventID();
        const iam = event.iam;
        const t = event.tile.clone({ add: OP.HORIZONTAL });
        // 一発を有効にする
        enqueue.assign({
          oneShotMap: withWind(context.oneShotMap, iam, true),
        });
        broadcast(c, (w) => {
          const e: ReachEvent = {
            id: id,
            type: event.type,
            iam: iam,
            wind: w,
            tile: t.toString(),
          };
          return e;
        });
      }),
      notify_reach_accepted: ({ event }) => {
        assert(event.type == "REACH_ACCEPT");
        const id = genEventID();
        broadcast(c, (w) => {
          const e: ReachAcceptedEvent = {
            id: id,
            type: "REACH_ACCEPTED",
            reacherInfo: {
              wind: event.reacherInfo.wind,
              tile: event.reacherInfo.tile.toString(),
            },
            wind: w,
          };
          return e;
        });
        c.next();
      },
      notify_new_dora_if_needed: enqueueActions(({ event, enqueue }) => {
        // 暗槓はカンの直後にめくる
        if (event.type == "AN_KAN") {
          openNewDora(c, genEventID());
          return;
        }
        // 明槓（大明槓・加槓）はカンした人が打牌したあとにめくるので、
        // ここでは予約だけして discarded に運ぶ
        if (event.type == "SHO_KAN" || event.type == "DAI_KAN")
          enqueue.assign({ pendingNewDora: true });
      }),
      notify_new_dora_if_pending: enqueueActions(({ context, enqueue }) => {
        if (!context.pendingNewDora) return;
        enqueue.assign({ pendingNewDora: false });
        openNewDora(c, genEventID());
      }),
      disable_one_shot: assign(() => ({
        oneShotMap: createWindMap(() => false),
      })),
      disable_one_shot_for_me: assign(({ context }) => ({
        oneShotMap: { ...context.oneShotMap, [context.currentWind]: false },
      })),
      notify_end: ({ event }) => {
        const id = genEventID();
        const hands = createWindMap(() => "");
        if (event.type == "DRAWN_GAME_BY_NINE_TERMINALS") {
          hands[event.iam] = c.hand(event.iam).toString();
          broadcast(c, (w) => {
            const e: EndEvent = {
              id: id,
              type: "END_GAME",
              subType: "NINE_TERMINALS",
              wind: w,
              shouldContinue: true,
              sticks: c.placeManager.sticks,
              scores: c.scoreManager.summary,
              deltas: createWindMap(() => 0),
              hands: hands,
            };
            return e;
          });
        } else if (event.type == "RON" || event.type == "TSUMO") {
          const shouldContinue = event.iam == WIND.E;
          const finalResults = c.finalResult(
            event.ret,
            event.iam
          );
          hands[event.iam] = c.hand(event.iam).toString();
          broadcast(c, (w) => {
            const e: EndEvent = {
              id: id,
              type: "END_GAME",
              subType: "WIN_GAME",
              wind: w,
              shouldContinue: shouldContinue,
              // 供託は和了者が総取りするので、この時点で場には残らない
              sticks: { reach: 0, dead: 0 },
              scores: c.scoreManager.summary,
              deltas: finalResults.deltas,
              hands: hands,
            };
            return e;
          });
        } else if (
          !c.wall.canKan ||
          c.river.isFourWindsAbort()
        ) {
          const subType = !c.wall.canKan
            ? ("FOUR_KANS" as const)
            : ("FOUR_WINDS" as const);
          broadcast(c, (w) => {
            const e: EndEvent = {
              id: id,
              type: "END_GAME",
              subType: subType,
              wind: w,
              shouldContinue: true,
              sticks: c.placeManager.sticks,
              scores: c.scoreManager.summary,
              deltas: createWindMap(() => 0),
              hands: createWindMap(() => ""),
            };
            return e;
          });
        } else if (!c.wall.canDraw) {
          const wind: Wind[] = [];
          // TODO ノーテン宣言ありなら notify_choice_event_for_ready/waiting_ready_eventを追加する必要あり
          for (const w of Object.values(WIND)) {
            const hand = c.hand(w);
            const shan = new ShantenCalculator(hand).calc();
            if (shan == 0) {
              wind.push(w);
              hands[w] = hand.toString();
            }
          }

          const nothing = wind.length == 0 || wind.length == 4;
          const deltas = createWindMap(() => 0);
          for (const w of Object.values(WIND)) {
            if (wind.includes(w))
              deltas[w] += nothing ? 0 : NOTEN_PENALTY / wind.length;
            else deltas[w] -= nothing ? 0 : NOTEN_PENALTY / (4 - wind.length);
          }

          const shouldContinue = wind.length == 4 || deltas[WIND.E] > 0;
          broadcast(c, (w) => {
            const e: EndEvent = {
              id: id,
              type: "END_GAME",
              subType: "DRAWN_GAME",
              wind: w,
              shouldContinue: shouldContinue,
              sticks: c.placeManager.sticks,
              scores: c.scoreManager.summary,
              deltas: deltas,
              hands: hands,
            };
            return e;
          });
        } else throw new Error(`unexpected event ${event.type}`);
      },
    },
    guards: {
      canChi: ({ event }) => {
        if (event.type == "CHI")
          return !!c.doChi(
            event.iam,
            c.river.lastTile.w,
            c.river.lastTile.t
          );
        c.logger.error(`guards.canChi receive ${event.type}`);
        return false;
      },
      canPon: ({ event }) => {
        if (event.type == "PON")
          return !!c.doPon(
            event.iam,
            c.river.lastTile.w,
            c.river.lastTile.t
          );
        c.logger.error(`guards.canPon receive ${event.type}`);
        return false;
      },
      canReach: ({ event }) => {
        if (event.type == "REACH") {
          return !!c.doReach(event.iam);
        }
        c.logger.error(`guards.canReach receive ${event.type}`);
        return false;
      },
      cannotContinue: () => {
        return (
          !c.wall.canDraw ||
          !c.wall.canKan ||
          c.river.isFourWindsAbort()
        );
      },
    },
  }).createMachine({
    id: "controller",
    initial: "distribute",
    context: {
      currentWind: WIND.E,
      oneShotMap: createWindMap(() => false),
      missingMap: createWindMap(() => false),
      pendingNewDora: false,
    },
    states: {
      distribute: {
        on: {
          NEXT: {
            target: "drawn",
          },
        },
        entry: {
          type: "notify_distribution",
        },
      },
      drawn: {
        entry: {
          type: "notify_draw",
        },
        on: {
          NEXT: {
            target: "waiting_user_event_after_drawn",
            actions: {
              type: "notify_choice_after_drawn",
            },
            description:
              "可能なアクションとその詳細を通知\\\nDISCARD の場合は捨てられる牌の一覧",
          },
        },
      },
      waiting_user_event_after_drawn: {
        description: "ツモった1ユーザからのレスポンス待ち",
        on: {
          TSUMO: {
            target: "tsumo",
          },
          REACH: {
            target: "waiting_reach_acceptance",
            actions: [
              {
                type: "notify_reach",
              },
              {
                type: "notify_choice_for_reach_acceptance",
              },
            ],
            guard: {
              type: "canReach",
            },
          },
          SHO_KAN: {
            target: "an_sho_kaned",
          },
          AN_KAN: {
            target: "an_sho_kaned",
          },
          DISCARD: {
            target: "discarded",
            description: "入力に牌が必須",
            actions: {
              type: "disable_one_shot_for_me",
            },
          },
          DRAWN_GAME_BY_NINE_TERMINALS: {
            target: "drawn_game",
            // TODO guard for drawn game
          },
        },
      },
      discarded: {
        entry: [
          {
            type: "notify_discard",
          },
          {
            type: "notify_new_dora_if_pending",
          },
        ],
        on: {
          NEXT: {
            target: "waiting_user_event_after_discarded",
            actions: {
              type: "notify_choice_after_discarded",
            },
            description:
              "可能なアクションとその詳細を通知\\\nCHI/PON の場合は鳴ける組み合わせの一覧",
          },
        },
      },
      tsumo: {
        exit: [
          {
            type: "notify_tsumo",
          },
          {
            type: "notify_end",
          },
        ],
        type: "final",
      },
      waiting_reach_acceptance: {
        on: {
          REACH_ACCEPT: {
            target: "reached",
          },
          RON: {
            target: "roned",
          },
        },
        description: "リーチに対するアクションは RON か ACCEPT のみである",
      },
      waiting_user_event_after_discarded: {
        description:
          "最大 4人から choice に対するレスポンスを待つ\\\nユーザからではなく、controller が優先順位を考慮して遷移させる必要がある\\\n通知する choice がない場合、controller が\\*で遷移させる",
        on: {
          RON: {
            target: "roned",
          },
          PON: {
            target: "poned",
            guard: "canPon",
          },
          CHI: {
            target: "chied",
            guard: "canChi",
          },
          DAI_KAN: {
            target: "dai_kaned",
          },
          "*": {
            target: "wildcard_after_discarded",
          },
        },
      },
      reached: {
        on: {
          NEXT: {
            target: "waiting_user_event_after_discarded",
            actions: {
              type: "notify_choice_after_discarded",
            },
          },
        },
        entry: {
          type: "notify_reach_accepted",
        },
      },
      roned: {
        exit: [
          {
            type: "notify_ron",
          },
          {
            type: "notify_end",
          },
        ],
        type: "final",
      },
      poned: {
        on: {
          NEXT: {
            target: "waiting_discard_event",
            actions: {
              type: "notify_choice_after_called",
            },
          },
        },
        entry: [
          {
            type: "notify_call",
          },
          {
            type: "disable_one_shot",
          },
        ],
      },
      chied: {
        on: {
          NEXT: {
            target: "waiting_discard_event",
            actions: {
              type: "notify_choice_after_called",
            },
          },
        },
        entry: [
          {
            type: "notify_call",
          },
          {
            type: "disable_one_shot",
          },
        ],
      },
      wildcard_after_discarded: {
        exit: [],
        always: [
          {
            target: "drawn_game",
            guard: "cannotContinue",
          },
          {
            target: "drawn",
            actions: [
              {
                type: "updateNextWind",
              },
            ],
          },
        ],
      },
      waiting_discard_event: {
        description: "鳴いたユーザからの DISCARD イベントを待つ",
        on: {
          DISCARD: {
            target: "discarded",
          },
        },
      },
      dai_kaned: {
        on: {
          NEXT: {
            target: "waiting_user_event_after_drawn",
            actions: [
              {
                type: "notify_draw",
                params: { action: "kan" },
              },
              {
                type: "notify_choice_after_drawn",
                params: { replacementWin: true },
              },
            ],
          },
        },
        entry: [
          {
            type: "notify_call",
          },
          {
            type: "disable_one_shot",
          },
          {
            type: "notify_new_dora_if_needed",
          },
        ],
      },
      an_sho_kaned: {
        // FIXME
        // on Next は動作しない。具体的に notify_choice_for_chankan を Next で実行する必要があるが
        // Next 時には、kan されたコンテキスト（誰がどのブロックでカンされたか失われてしまっている。
        always: {
          target: "waiting_chankan_event",
        },
        entry: [
          {
            type: "notify_call",
          },
          {
            type: "disable_one_shot",
          },
          {
            type: "notify_new_dora_if_needed",
          },
          {
            type: "notify_choice_for_chankan",
          },
        ],
      },
      waiting_chankan_event: {
        description: "チャンカンを待つ",
        on: {
          "*": {
            target: "waiting_user_event_after_drawn",
            actions: [
              {
                type: "notify_draw",
                params: {
                  action: "kan",
                },
              },
              {
                type: "notify_choice_after_drawn",
                params: {
                  replacementWin: true,
                },
              },
            ],
          },
          RON: {
            target: "roned",
          },
        },
      },
      drawn_game: {
        exit: {
          type: "notify_end",
          params: {},
        },
        type: "final",
      },
    },
  });
};

export function incrementalIDGenerator(start = 0) {
  let idx = start;
  return () => {
    return (idx++).toString();
  };
}
