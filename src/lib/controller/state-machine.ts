import { Wind, KIND, WIND, OPERATOR } from "../constants";
import { Controller } from "./index";
import {
  BlockAnKan,
  BlockChi,
  BlockDaiKan,
  BlockPon,
  BlockShoKan,
  Tile,
} from "../parser";
import { ShantenCalculator, WinResult } from "./../calculator";
import { nextWind, createWindMap } from "./managers";

type ControllerContext = {
  currentWind: Wind;
  oneShotMap: { [key in Wind]: boolean };
  missingMap: { [key in Wind]: boolean };
  controller: Controller;
  genEventID: ReturnType<typeof incrementalIDGenerator>;
};

import { createMachine } from "xstate";

export const createControllerMachine = (c: Controller) => {
  return createMachine(
    {
      id: "Untitled",
      initial: "distribute",
      context: {
        currentWind: "1w",
        oneShotMap: createWindMap(false),
        missingMap: createWindMap(false),
        controller: c,
        genEventID: incrementalIDGenerator(),
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
              guard: "canWin",
            },
            REACH: {
              target: "discarded",
              guard: "canReach",
              actions: {
                type: "notify_reach",
              },
              description:
                "入力に牌が必要\\\n立直直後のロンは立直棒が点数にならないので\\\n別途状態を保つ必要がある",
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
            DRAWN_GAME_BY_NINE_TILES: {
              target: "drawn_game",
              // TODO guard for drawn game
            },
          },
        },
        discarded: {
          entry: {
            type: "notify_discard",
            // FIXME add notify_new_dora_if_needed
          },
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
        waiting_user_event_after_discarded: {
          description:
            "最大 4人から choice に対するレスポンスを待つ\\\nユーザからではなく、controller が優先順位を考慮して遷移させる必要がある\\\n通知する choice がない場合、controller が\\*で遷移させる",
          on: {
            RON: {
              target: "roned",
              guard: "canWin",
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
              type: "disable_none_shot",
            },
          ],
        },
        chied: {
          on: {
            NEXT: {
              target: "waiting_discard_event",
              actions: {
                type: "notify_choice_after_called",
                params: { action: "chi" },
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
          ],
        },
        an_sho_kaned: {
          on: {
            NEXT: {
              target: "waiting_chankan_event",
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
            {
              type: "notify_choice_for_chankan",
            },
          ],
        },
        waiting_chankan_event: {
          description: "チャンカンを待つ",
          exit: [
            {
              type: "notify_draw",
              params: { action: "kan" },
            },
            {
              type: "notify_choice_after_drawn",
              params: { replacementWin: true },
            },
          ],
          on: {
            RON: {
              target: "roned",
              guard: "canWin",
            },
            "*": {
              target: "waiting_user_event_after_drawn",
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
      types: {
        events: {} as
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
          | { type: "DISCARD"; tile: Tile; iam: Wind }
          | { type: "AN_KAN"; block: BlockAnKan; iam: Wind }
          | { type: "SHO_KAN"; block: BlockShoKan; iam: Wind }
          | { type: "DAI_KAN"; block: BlockDaiKan; iam: Wind }
          | { type: "DRAWN_GAME_BY_NINE_TILES"; iam: Wind },
        context: {} as ControllerContext,
      },
    },
    {
      actions: {
        updateNextWind: ({ context, event }) => {
          const cur = context.currentWind;
          context.currentWind = nextWind(cur);
        },
        notify_distribution: ({ context, event }) => {
          const id = context.genEventID();
          const initHands = context.controller.initialHands();
          for (let w of Object.values(WIND)) {
            const hands = createWindMap("_____________");
            hands[w] = initHands[w].toString();
            const e = {
              id: id,
              type: "DISTRIBUTE" as const,
              hands: hands,
              wind: w,
              doraMarker: context.controller.wall.doraMarkers[0],
              sticks: context.controller.placeManager.sticks,
              round: context.controller.placeManager.round,
              players: context.controller.playerIDs,
              places: context.controller.placeManager.playerMap,
              scores: context.controller.scoreManager.summary,
            };
            context.controller.emit(e);
          }
          context.controller.next();
        },
        notify_choice_after_drawn: ({ context, event }, params) => {
          const w = context.currentWind;
          const drawn = context.controller.hand(w).drawn;
          const id = context.genEventID();
          const e = {
            id: id,
            type: "CHOICE_AFTER_DRAWN" as const,
            wind: w,
            tileInfo: { wind: w, tile: drawn! },
            choices: {
              TSUMO: context.controller.doWin(w, drawn, {
                oneShot: context.oneShotMap[w],
                replacementWin: (
                  params as { replacementWin: boolean } | undefined
                )?.replacementWin,
              }),
              REACH: context.controller.doReach(w),
              AN_KAN: context.controller.doAnKan(w),
              SHO_KAN: context.controller.doShoKan(w),
              DISCARD: context.controller.doDiscard(w),
              DRAWN_GAME_BY_NINE_TILES: context.controller.canDrawnGame(w),
            },
          };
          context.controller.emit(e);
          context.controller.pollReplies(id, [w]);
        },
        notify_choice_after_discarded: ({ context, event }) => {
          const id = context.genEventID();
          const discarded = context.controller.river.lastTile;
          const ltile = discarded.t.clone().add(OPERATOR.HORIZONTAL);
          for (let w of Object.values(WIND)) {
            const e = {
              id: id,
              type: "CHOICE_AFTER_DISCARDED" as const,
              wind: w,
              tileInfo: { wind: discarded.w, tile: discarded.t },
              choices: {
                RON: context.controller.doWin(w, ltile, {
                  whoDiscarded: discarded.w,
                  oneShot: context.oneShotMap[w],
                  missingRon: context.missingMap[w],
                }),
                PON: context.controller.doPon(w, discarded.w, ltile),
                CHI: context.controller.doChi(w, discarded.w, ltile),
                DAI_KAN: context.controller.doDaiKan(w, discarded.w, ltile),
              },
            };
            if (e.choices.RON) context.missingMap[w] = true; // ロン可能であればフリテンをtrueにする。次のツモ番で解除される想定
            // TODO if no choice, skip enqueue
            context.controller.emit(e);
          }
          // TODO skip not euqueued winds
          context.controller.pollReplies(id, Object.values(WIND));
        },
        notify_choice_after_called: ({ context, event }, params) => {
          const id = context.genEventID();
          const w = context.currentWind;
          let discard = context.controller.doDiscard(w);

          const called = context.controller
            .hand(context.currentWind)
            .called.at(-1);
          if (called instanceof BlockChi || called instanceof BlockPon)
            discard = context.controller.doDiscard(w, called);
          const e = {
            id: id,
            type: "CHOICE_AFTER_CALLED" as const,
            wind: w,
            choices: {
              DISCARD: discard,
            },
          };
          context.controller.emit(e);
          context.controller.pollReplies(id, [w]);
        },
        notify_choice_for_chankan: ({ context, event }) => {
          if (event.type != "SHO_KAN" && event.type != "AN_KAN")
            throw new Error(`unexpected event ${event.type}`);
          const id = context.genEventID();

          const t = event.block.tiles[0].clone().remove(OPERATOR.HORIZONTAL);
          for (let w of Object.values(WIND)) {
            const ron = context.controller.doWin(
              w,
              event.block.tiles[0].clone().remove(OPERATOR.HORIZONTAL),
              {
                whoDiscarded: event.iam,
                quadWin: true,
                oneShot: context.oneShotMap[w],
                missingRon: context.missingMap[event.iam],
              }
            ); // TODO which tile is sho kaned for 0/5
            const e = {
              id: id,
              type: "CHOICE_FOR_CHAN_KAN" as const,
              wind: w,
              tileInfo: { wind: event.iam, tile: t },
              choices: {
                RON: event.type == "SHO_KAN" ? ron : false,
              },
            };
            if (e.choices.RON) context.missingMap[w] = true; // ロン可能であればフリテンをtrueにする。次のツモ番で解除される想定
            context.controller.emit(e);
          }
          context.controller.pollReplies(id, Object.values(WIND));
        },
        notify_call: ({ context, event }) => {
          if (
            !(
              event.type == "CHI" ||
              event.type == "PON" ||
              event.type == "DAI_KAN" ||
              event.type == "AN_KAN" ||
              event.type == "SHO_KAN"
            )
          )
            throw new Error(`unexpected event ${event.type}`);

          const id = context.genEventID();
          const iam = event.iam;
          context.currentWind = iam; // update current wind
          for (let w of Object.values(WIND)) {
            const e = {
              id: id,
              type: event.type,
              iam: iam,
              wind: w,
              block: event.block,
            };
            context.controller.emit(e);
          }
          context.controller.next();
        },
        notify_discard: ({ context, event }) => {
          if (event.type != "DISCARD" && event.type != "REACH")
            throw new Error(`unexpected event ${event.type}`);
          const id = context.genEventID();
          const iam = context.currentWind;
          const t = event.tile;
          for (let w of Object.values(WIND)) {
            const e = {
              id: id,
              type: "DISCARD" as const,
              iam: iam,
              wind: w,
              tile: t,
            };
            context.controller.emit(e);
          }

          context.controller.next();
        },
        notify_draw: ({ context, event }, params) => {
          const id = context.genEventID();

          const action = (params as { action: string } | undefined)?.action; // TODO avoid as
          let drawn: Tile | undefined = undefined;
          if (action == "kan") drawn = context.controller.wall.kan();
          else drawn = context.controller.wall.draw();

          const iam = context.currentWind;

          // リーチしてなければフリテンを解除
          if (!context.controller.hand(iam).reached)
            context.missingMap[iam] = false;

          for (let w of Object.values(WIND)) {
            let t = new Tile(KIND.BACK, 0); // mask tile for other players
            if (w == iam) t = drawn;
            const e = {
              id: id,
              type: "DRAW" as const,
              subType: action,
              iam: iam,
              wind: w,
              tile: t,
            };
            context.controller.emit(e);
          }
          context.controller.next();
        },
        notify_ron: ({ context, event }) => {
          const id = context.genEventID();
          if (event.type == "RON") {
            const ronWind = event.targetInfo.wind;
            const cur = context.currentWind;
            const pushBackReachStick =
              ronWind == cur && context.oneShotMap[cur] == true;
            const iam = event.iam;
            for (let w of Object.values(WIND)) {
              const e = {
                id: id,
                type: event.type,
                iam: iam,
                wind: w,
                targetInfo: event.targetInfo,
                ret: event.ret,
                pushBackReachStick: pushBackReachStick,
              };
              context.controller.emit(e);
            }
          }
        },
        notify_tsumo: ({ context, event }) => {
          if (event.type != "TSUMO")
            throw new Error(`unexpected event ${event.type}`);
          const id = context.genEventID();
          const iam = context.currentWind;

          for (let w of Object.values(WIND)) {
            const e = {
              id: id,
              type: event.type,
              iam: iam,
              wind: w,
              lastTile: context.controller.hand(iam).drawn!,
              ret: event.ret,
            };
            context.controller.emit(e);
          }
        },
        notify_reach: ({ context, event }) => {
          if (event.type != "REACH")
            throw new Error(`unexpected event ${event.type}`);
          const id = context.genEventID();
          const iam = event.iam;
          const t = event.tile.clone().add(OPERATOR.HORIZONTAL);
          context.oneShotMap[iam] = true; // enable one shot
          for (let w of Object.values(WIND)) {
            const e = {
              id: id,
              type: event.type,
              iam: iam,
              wind: w,
              tile: t,
            };
            context.controller.emit(e);
          }
        },
        notify_new_dora_if_needed: ({ context, event }) => {
          const id = context.genEventID();
          if (event.type == "AN_KAN") {
            const tile = context.controller.wall.openDoraMarker();
            for (let w of Object.values(WIND)) {
              const e = {
                id: id,
                type: "NEW_DORA" as const,
                wind: w,
                doraMarker: tile,
              };
              context.controller.emit(e);
            }
          }
          if (event.type == "SHO_KAN") {
            // nothing because handling by discarded
          }
        },
        disable_one_shot: ({ context, event }) => {
          for (let w of Object.values(WIND)) context.oneShotMap[w] = false;
        },
        disable_one_shot_for_me: ({ context, event }) => {
          context.oneShotMap[context.currentWind] = false;
        },
        notify_end: ({ context, event }) => {
          const id = context.genEventID();
          const hands = createWindMap("");
          if (event.type == "DRAWN_GAME_BY_NINE_TILES") {
            hands[event.iam] = context.controller.hand(event.iam).toString();
            for (let w of Object.values(WIND)) {
              const e = {
                id: id,
                type: "END_GAME" as const,
                subType: "NINE_TILES" as const,
                wind: w,
                shouldContinue: true,
                sticks: context.controller.placeManager.sticks,
                scores: context.controller.scoreManager.summary,
                deltas: createWindMap(0),
                hands: hands,
              };
              context.controller.emit(e);
            }
          } else if (event.type == "RON" || event.type == "TSUMO") {
            const shouldContinue = event.iam == "1w";
            const finalResults = context.controller.finalResult(
              event.ret,
              event.iam
            );
            for (let w of Object.values(WIND)) {
              hands[event.iam] = context.controller.hand(event.iam).toString();
              const e = {
                id: id,
                type: "END_GAME" as const,
                subType: "WIN_GAME" as const,
                wind: w,
                shouldContinue: shouldContinue,
                sticks: { reach: 0, dead: 0 },
                scores: context.controller.scoreManager.summary,
                deltas: finalResults.deltas,
                hands: hands,
              };
              context.controller.emit(e);
            }
          } else if (
            !context.controller.wall.canKan ||
            context.controller.river.cannotContinue()
          ) {
            const subType = !context.controller.wall.canKan
              ? ("FOUR_KAN" as const)
              : ("FOUR_WIND" as const);
            for (let w of Object.values(WIND)) {
              const e = {
                id: id,
                type: "END_GAME" as const,
                subType: subType,
                wind: w,
                shouldContinue: true,
                sticks: context.controller.placeManager.sticks,
                scores: context.controller.scoreManager.summary,
                deltas: createWindMap(0),
                hands: createWindMap(""),
              };
              context.controller.emit(e);
            }
          } else if (!context.controller.wall.canDraw) {
            const wind: Wind[] = [];
            // TODO ノーテン宣言ありなら notify_choice_event_for_ready/waiting_ready_eventを追加する必要あり
            for (let w of Object.values(WIND)) {
              const hand = context.controller.hand(w);
              const shan = new ShantenCalculator(hand).calc();
              if (shan == 0) {
                wind.push(w);
                hands[w] = hand.toString();
              }
            }

            const nothing = wind.length == 0 || wind.length == 4;
            const deltas = createWindMap(0);
            for (let w of Object.values(WIND)) {
              if (wind.includes(w))
                deltas[w] += nothing ? 0 : 3000 / wind.length;
              else deltas[w] -= nothing ? 0 : 3000 / (4 - wind.length);
            }

            const shouldContinue = wind.length == 4 || deltas["1w"] > 0;
            for (let w of Object.values(WIND)) {
              const e = {
                id: id,
                type: "END_GAME" as const,
                subType: "DRAWN_GAME" as const,
                wind: w,
                shouldContinue: shouldContinue,
                sticks: context.controller.placeManager.sticks,
                scores: context.controller.scoreManager.summary,
                deltas: deltas,
                hands: hands,
              };
              context.controller.emit(e);
            }
          } else throw new Error(`unexpected event ${event.type}`);
        },
      },
      actors: {},
      guards: {
        canChi: ({ context, event }, params) => {
          if (event.type == "CHI")
            return !!context.controller.doChi(
              event.iam,
              context.controller.river.lastTile.w,
              context.controller.river.lastTile.t
            );
          console.error(`guards.canChi receive ${event.type}`);
          return false;
        },
        canPon: ({ context, event }, params) => {
          if (event.type == "PON")
            return !!context.controller.doPon(
              event.iam,
              context.controller.river.lastTile.w,
              context.controller.river.lastTile.t
            );
          console.error(`guards.canPon receive ${event.type}`);
          return false;
        },
        canWin: ({ context, event }, params) => {
          if (event.type == "TSUMO" || event.type == "RON") {
            return true; // TODO
          }
          console.error(`guards.canWin receive ${event.type}`);
          return false;
        },
        canReach: ({ context, event }, params) => {
          if (event.type == "REACH") {
            return !!context.controller.doReach(event.iam);
          }
          console.error(`guards.canReach receive ${event.type}`);
          return false;
        },
        cannotContinue: ({ context, event }, params) => {
          return (
            !context.controller.wall.canDraw ||
            !context.controller.wall.canKan ||
            context.controller.river.cannotContinue()
          );
        },
      },
      delays: {},
    }
  );
};

export function incrementalIDGenerator(start = 0) {
  let idx = start;
  return () => {
    return (idx++).toString();
  };
}
