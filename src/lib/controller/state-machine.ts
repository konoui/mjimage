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
        controller: c,
        genEventID: incrementalIDGenerator(),
      },
      states: {
        distribute: {
          always: {
            target: "drawn",
            actions: {
              type: "notify_hands",
            },
          },
        },
        drawn: {
          exit: {
            type: "notify_draw",
          },
          always: {
            target: "waiting_user_event_after_drawn",
            actions: {
              type: "notify_choice_after_drawn",
            },
            description:
              "可能なアクションとその詳細を通知\\\nDISCARD の場合は捨てられる牌の一覧",
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
          },
        },
        discarded: {
          entry: {
            type: "notify_discard",
          },
          always: {
            target: "waiting_user_event_after_discarded",
            actions: {
              type: "notify_choice_after_discarded",
            },
            description:
              "可能なアクションとその詳細を通知\\\nCHI/PON の場合は鳴ける組み合わせの一覧",
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
              type: "restore_reach_stick",
            },
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
          exit: [
            {
              type: "notify_call",
            },
            {
              type: "disable_one_shot",
            },
          ],
          always: {
            target: "waiting_discard_event",
            actions: {
              type: "notify_choice_after_called",
            },
          },
        },
        chied: {
          exit: [
            {
              type: "notify_call",
            },
            {
              type: "disable_one_shot",
            },
          ],
          always: {
            target: "waiting_discard_event",
            actions: {
              type: "notify_choice_after_called",
            },
          },
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
          exit: [
            {
              type: "notify_call",
            },
            {
              type: "disable_one_shot",
            },
          ],
          always: {
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
        an_sho_kaned: {
          exit: [
            {
              type: "notify_call",
            },
            {
              type: "notify_new_dora_if_needed",
            },
            {
              type: "disable_one_shot",
            },
          ],
          always: {
            target: "waiting_chankan_event",
            actions: {
              type: "notify_choice_for_chankan",
            },
          },
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
          | { type: "CHI"; block: BlockChi; iam: Wind }
          | { type: "PON"; block: BlockPon; iam: Wind }
          | {
              type: "RON";
              ret: WinResult;
              iam: Wind;
              tileInfo: { wind: Wind; tile: Tile };
              quadWin?: boolean;
            }
          | { type: "TSUMO"; ret: WinResult; iam: Wind; lastTile: Tile }
          | { type: "REACH"; tile: Tile; iam: Wind }
          | { type: "DISCARD"; tile: Tile; iam: Wind }
          | { type: "AN_KAN"; block: BlockAnKan; iam: Wind }
          | { type: "SHO_KAN"; block: BlockShoKan; iam: Wind }
          | { type: "DAI_KAN"; block: BlockDaiKan; iam: Wind },
        context: {} as ControllerContext,
      },
    },
    {
      actions: {
        updateNextWind: ({ context, event }) => {
          const cur = context.currentWind;
          context.currentWind = nextWind(cur);
        },
        notify_hands: ({ context, event }) => {
          const id = context.genEventID();
          console.debug(
            `DISTRIBUTE:`,
            `round: ${context.controller.placeManager.round}`,
            `scores: ${JSON.stringify(
              context.controller.scoreManager.summary,
              null,
              2
            )}`,
            `map: ${JSON.stringify(
              context.controller.placeManager.playerMap,
              null,
              2
            )}`,
            `sticks: ${JSON.stringify(
              context.controller.placeManager.sticks,
              null,
              2
            )}`
          );
          for (let w of Object.values(WIND)) {
            console.debug(
              context.controller.player(w).id,
              `init hand: ${context.controller.player(w).hand.toString()}`
            );
            const hands = createWindMap("_____________");
            hands[w] = context.controller.player(w).hand.toString();
            const e = {
              id: id,
              type: "DISTRIBUTE" as const,
              hands: hands,
              wind: w,
              dora: context.controller.wall.doras[0],
              sticks: context.controller.placeManager.sticks,
              round: context.controller.placeManager.round,
              players: context.controller.playerIDs,
              places: context.controller.placeManager.playerMap,
              scores: context.controller.scoreManager.summary,
            };
            context.controller.emit(e);
          }
        },
        notify_choice_after_drawn: ({ context, event }, params) => {
          const w = context.currentWind;
          const drawn = context.controller.player(w).hand.drawn;
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
                }),
                PON: context.controller.doPon(w, discarded.w, ltile),
                CHI: context.controller.doChi(w, discarded.w, ltile),
                DAI_KAN: context.controller.doDaiKan(w, discarded.w, ltile),
              },
            };
            // TODO if no choice, skip enqueue
            context.controller.emit(e);
          }
          // TODO skip not euqueued winds
          context.controller.pollReplies(id, Object.values(WIND));
        },
        notify_choice_after_called: ({ context, event }) => {
          const id = context.genEventID();
          const w = context.currentWind;
          const e = {
            id: id,
            type: "CHOICE_AFTER_CALLED" as const,
            wind: w,
            choices: {
              DISCARD: context.controller.doDiscard(w), // 食い変え
            },
          };
          context.controller.emit(e);
          context.controller.pollReplies(id, [w]);
        },
        notify_call: ({ context, event }) => {
          const id = context.genEventID();
          if (
            event.type == "CHI" ||
            event.type == "PON" ||
            event.type == "DAI_KAN" ||
            event.type == "AN_KAN" ||
            event.type == "SHO_KAN"
          ) {
            const iam = event.iam;
            context.currentWind = iam; // update current wind
            if (event.type == "AN_KAN" || event.type == "SHO_KAN")
              context.controller.player(iam).hand.kan(event.block);
            else {
              context.controller.player(iam).hand.call(event.block);
              context.controller.river.markCalled(); // remove tile from the river
            }
            console.debug(
              context.controller.player(iam).id,
              `call: ${event.block.toString()}`,
              `hand: ${context.controller.player(iam).hand.toString()}`
            );
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
          }
        },
        notify_discard: ({ context, event }) => {
          const id = context.genEventID();
          if (event.type == "DISCARD") {
            const iam = context.currentWind;
            const t = event.tile;
            context.controller.player(iam).hand.discard(t); // discard
            context.controller.river.discard(t, iam); // discard
            console.debug(
              context.controller.player(iam).id,
              `discard: ${event.tile.toString()}`,
              `hand: ${context.controller.player(iam).hand.toString()}`
            );
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
          }
        },
        notify_draw: ({ context, event }, params) => {
          const id = context.genEventID();
          const action = (params as { action: string } | undefined)?.action; // TODO avoid as
          let drawn: Tile | undefined = undefined;
          if (action == "kan") {
            drawn = context.controller.wall.kan();
          } else {
            drawn = context.controller.wall.draw();
          }

          const iam = context.currentWind;
          context.controller.player(iam).hand.draw(drawn); // draw
          console.debug(
            context.controller.player(iam).id,
            `draw: ${drawn}`,
            `hand: ${context.controller.player(iam).hand.toString()}`
          );
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
        },
        notify_ron: ({ context, event }) => {
          const id = context.genEventID();
          if (event.type == "RON") {
            const iam = event.iam;
            console.debug(
              context.controller.player(iam).id,
              `ron: ${JSON.stringify(event.ret, null, 2)}`,
              `hand: ${context.controller.player(iam).hand.toString()}`
            );

            for (let w of Object.values(WIND)) {
              const e = {
                id: id,
                type: event.type,
                iam: iam,
                wind: w,
                tileInfo: event.tileInfo,
                ret: event.ret,
              };
              context.controller.emit(e);
            }
          }
        },
        restore_reach_stick: ({ context, event }) => {
          if (event.type == "RON") {
            const ronWind = event.tileInfo.wind;
            const cur = context.currentWind;
            if (ronWind == cur && context.oneShotMap[cur] == true) {
              const id = context.controller.placeManager.playerID(cur);
              context.controller.scoreManager.restoreReachStick(id);
              context.controller.placeManager.decrementReachStick();
              // TODO re calculate for ron to handle blind doras
              event.ret.point -= 1000;
              event.ret.result[event.iam] -= 1000;
            }
          }
        },
        notify_tsumo: ({ context, event }) => {
          const id = context.genEventID();
          const iam = context.currentWind;
          if (event.type == "TSUMO") {
            console.debug(
              context.controller.player(iam).id,
              `tsumo: ${JSON.stringify(event.ret, null, 2)}`,
              `hand: ${context.controller.player(iam).hand.toString()}`
            );

            for (let w of Object.values(WIND)) {
              const e = {
                id: id,
                type: event.type,
                iam: iam,
                wind: w,
                lastTile: context.controller.player(iam).hand.drawn!,
                ret: event.ret,
              };
              context.controller.emit(e);
            }
          }
        },
        notify_reach: ({ context, event }) => {
          const id = context.genEventID();
          if (event.type == "REACH") {
            const iam = event.iam;
            const t = event.tile.clone().add(OPERATOR.HORIZONTAL);
            context.controller.player(iam).hand.reach();
            const pid = context.controller.placeManager.playerID(iam);
            context.controller.scoreManager.reach(pid);
            context.controller.placeManager.incrementReachStick();
            context.oneShotMap[iam] = true; // enable one shot
            context.controller.player(iam).hand.discard(t);
            context.controller.river.discard(t, iam);
            console.debug(
              context.controller.player(iam).id,
              `reach: ${context.controller.player(iam).hand.toString()}`,
              `tile: ${t}`
            );
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
          }
        },
        notify_choice_for_chankan: ({ context, event }) => {
          if (event.type == "SHO_KAN" || event.type == "AN_KAN") {
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
                }
              ); // TODO which tile is kaned for 0/5
              const e = {
                id: id,
                type: "CHOICE_FOR_CHAN_KAN" as const,
                wind: w,
                tileInfo: { wind: event.iam, tile: t },
                choices: {
                  RON: event.type == "SHO_KAN" ? ron : 0,
                },
              };
              context.controller.emit(e);
            }
            context.controller.pollReplies(id, Object.values(WIND));
          }
        },
        notify_new_dora_if_needed: ({ context, event }) => {
          const id = context.genEventID();
          if (event.type == "AN_KAN") {
            const tile = context.controller.wall.openDora();
            for (let w of Object.values(WIND)) {
              const e = {
                id: id,
                type: "NEW_DORA" as const,
                wind: w,
                tile: tile,
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
          if (event.type == "RON" || event.type == "TSUMO") {
            const pm = context.controller.placeManager.playerMap;
            const shouldContinue = event.iam == "1w";
            context.controller.scoreManager.update(event.ret.result, pm);
            for (let w of Object.values(WIND)) {
              hands[event.iam] = context.controller
                .player(event.iam)
                .hand.toString();
              const e = {
                id: id,
                type: "END_GAME" as const,
                subType: "WIN_GAME" as const,
                wind: w,
                shouldContinue: shouldContinue,
                sticks: { reach: 0, dead: 0 },
                scores: context.controller.scoreManager.summary,
                results: event.ret.result,
                hands: hands,
              };
              context.controller.emit(e);
            }
            context.controller.placeManager.resetReachStick();
            if (shouldContinue)
              context.controller.placeManager.incrementDeadStick();
            else {
              context.controller.placeManager.nextRound();
              context.controller.placeManager.resetDeadStick();
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
                results: createWindMap(0),
                hands: createWindMap(""),
              };
              context.controller.emit(e);
            }
            context.controller.placeManager.incrementDeadStick();
          } else if (!context.controller.wall.canDraw) {
            const wind: Wind[] = [];
            for (let w of Object.values(WIND)) {
              const p = context.controller.player(w);
              const shan = new ShantenCalculator(p.hand).calc();
              if (shan == 0) {
                wind.push(w);
                hands[w] = p.hand.toString();
              }
            }

            const base =
              wind.length == 0 || wind.length == 4 ? 0 : 3000 / wind.length;
            const ret = createWindMap(0);
            for (let w of Object.values(WIND)) {
              if (wind.includes(w)) ret[w] += base;
              else ret[w] -= base * (4 - wind.length);
            }

            console.log(`DRAWN_GAME: wind ${wind}`);

            const shouldContinue = wind.length == 4 || ret["1w"] > 0;

            const pm = context.controller.placeManager.playerMap;
            context.controller.scoreManager.update(ret, pm);
            for (let w of Object.values(WIND)) {
              const e = {
                id: id,
                type: "END_GAME" as const,
                subType: "DRAWN_GAME" as const,
                wind: w,
                shouldContinue: shouldContinue,
                sticks: context.controller.placeManager.sticks,
                scores: context.controller.scoreManager.summary,
                results: ret,
                hands: hands,
              };
              context.controller.emit(e);
            }
            context.controller.placeManager.incrementDeadStick();
            if (!shouldContinue) context.controller.placeManager.nextRound();
          }
          for (let w of Object.values(WIND)) {
            console.debug(
              context.controller.player(w).id,
              `end hand: ${context.controller.player(w).hand.toString()}`
            );
          }
          console.debug(
            "END_GAME:",
            "scores",
            JSON.stringify(context.controller.scoreManager.summary, null, 2),
            `sticks: ${JSON.stringify(
              context.controller.placeManager.sticks,
              null,
              2
            )}`
          );
        },
      },
      actors: {},
      guards: {
        canChi: ({ context, event }, params) => {
          if (event.type == "CHI")
            return (
              context.controller.doChi(
                event.iam,
                context.controller.river.lastTile.w,
                context.controller.river.lastTile.t
              ) != 0
            );
          console.error(`guards.canChi receive ${event.type}`);
          return false;
        },
        canPon: ({ context, event }, params) => {
          if (event.type == "PON")
            return (
              context.controller.doPon(
                event.iam,
                context.controller.river.lastTile.w,
                context.controller.river.lastTile.t
              ) != 0
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
            return context.controller.doReach(event.iam) != 0;
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

function incrementalIDGenerator(start = 0) {
  let idx = start;
  return () => {
    return (idx++).toString();
  };
}
