import assert from "assert";
import { Wind, WIND_MAP, KIND, WIND, OPERATOR } from "../constants";
import { Controller } from "./index";
import { BlockChi, BlockPon, Tile } from "../parser";
import { WinResult } from "./../calculator";

type ControllerContext = {
  currentWind: Wind;
  controller: Controller;
};

export const nextWind = (w: Wind): Wind => {
  let n = Number(w.toString()[0]);
  if (n == 4) n = 1;
  else n++;
  return `${n}w` as Wind;
};

import { createMachine } from "xstate";

export const createControllerMachine = (c: Controller) => {
  return createMachine(
    {
      id: "Untitled",
      initial: "distribute",
      context: {
        currentWind: "1w",
        controller: c,
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
            DISCARD: {
              target: "discarded",
              description: "入力に牌が必須",
            },
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
          exit: [
            {
              type: "notify_called",
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
              type: "notify_called",
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
          always: [
            {
              target: "drawn_game",
              guard: "cannotDraw",
            },
            {
              target: "drawn",
              actions: {
                type: "updateNextWind",
              },
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
        drawn_game: {
          exit: {
            type: "notify_end",
          },
          type: "final",
        },
      },
      types: {
        events: {} as
          | { type: "" }
          | { type: "CHI"; block: BlockChi; iam: Wind }
          | { type: "PON"; block: BlockPon; iam: Wind }
          | { type: "RON"; ret: WinResult; iam: Wind }
          | { type: "TSUMO"; ret: WinResult; iam: Wind }
          | { type: "REACH"; tile: Tile; iam: Wind }
          | { type: "DISCARD"; tile: Tile; iam: Wind },
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
          const id = genEventID();
          for (let w of Object.values(WIND)) {
            console.debug(
              context.controller.player(w).id,
              `init hand: ${context.controller.player(w).hand.toString()}`
            );
            const e = {
              id: id,
              type: "DISTRIBUTE" as const,
              hand: context.controller.player(w).hand.toString(),
              wind: w,
              round: context.controller.placeManager.round,
              players: context.controller.playerIDs,
              places: context.controller.placeManager.playerMap,
              scores: context.controller.scoreManager.summary,
            };
            context.controller.player(w).enqueue(e);
          }
        },
        notify_choice_after_drawn: ({ context, event }) => {
          const w = context.currentWind;
          const drawn = context.controller.player(w).hand.drawn;
          const id = genEventID();
          const e = {
            id: id,
            type: "CHOICE_AFTER_DRAWN" as const,
            wind: context.currentWind,
            choices: {
              TSUMO: context.controller.doWin(w, drawn),
              DISCARD: context.controller.doDiscard(w),
              REACH: context.controller.doReach(w),
            },
          };
          context.controller.player(w).enqueue(e);
          context.controller.pollReplies(id, [w]);
        },
        notify_choice_after_discarded: ({ context, event }) => {
          const id = genEventID();
          const discarded = context.controller.river.lastTile;
          const ltile = discarded.t.clone().add(OPERATOR.HORIZONTAL);
          for (let w of Object.values(WIND)) {
            const e = {
              id: id,
              type: "CHOICE_AFTER_DISCARDED" as const,
              wind: w,
              choices: {
                RON: context.controller.doWin(w, ltile, discarded.w),
                PON: context.controller.doPon(w, discarded.w, ltile),
                CHI: context.controller.doChi(w, discarded.w, ltile),
              },
            };
            // TODO if no choice, skip enqueue
            context.controller.player(w).enqueue(e);
          }
          // TODO skip not euqueued winds
          context.controller.pollReplies(id, Object.values(WIND));
        },
        notify_choice_after_called: ({ context, event }) => {
          const id = genEventID();
          const w = context.currentWind;
          const e = {
            id: id,
            type: "CHOICE_AFTER_CALLED" as const,
            wind: w,
            choices: {
              DISCARD: context.controller.doDiscard(w), // 食い変え
            },
          };
          context.controller.player(w).enqueue(e);
          context.controller.pollReplies(id, [w]);
        },
        notify_called: ({ context, event }) => {
          const id = genEventID();
          if (event.type == "CHI" || event.type == "PON") {
            const iam = event.iam;
            context.currentWind = iam; // update current wind
            context.controller.player(iam).hand.call(event.block); // call
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
              context.controller.player(w).enqueue(e);
            }
          }
        },
        notify_discard: ({ context, event }) => {
          const id = genEventID();
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
              context.controller.player(w).enqueue(e);
            }
          }
        },
        notify_draw: ({ context, event }) => {
          const id = genEventID();
          const drawn = context.controller.wall.draw();
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
              iam: iam,
              wind: w,
              tile: t,
            };
            context.controller.player(w).enqueue(e);
          }
        },
        notify_ron: ({ context, event }) => {
          const id = genEventID();
          const iam = context.currentWind;
          if (event.type == "RON") {
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
                ret: event.ret,
              };
              context.controller.player(w).enqueue(e);
            }
          }
        },
        notify_tsumo: ({ context, event }) => {
          const id = genEventID();
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
                ret: event.ret,
              };
              context.controller.player(w).enqueue(e);
            }
          }
        },
        notify_reach: ({ context, event }) => {
          const id = genEventID();
          if (event.type == "REACH") {
            const iam = event.iam;
            context.controller.player(iam).hand.reach();
            context.controller.placeManager.incrementReachStick();
            const pid = context.controller.placeManager.playerID(iam);
            context.controller.scoreManager.reach(pid);
            context.controller.player(iam).hand.discard(event.tile);
            context.controller.river.discard(event.tile, iam);
            console.debug(
              context.controller.player(iam).id,
              `reach: ${context.controller.player(iam).hand.toString()}`,
              `tile: ${event.tile}`
            );
            for (let w of Object.values(WIND)) {
              const e = {
                id: id,
                type: event.type,
                iam: iam,
                wind: w,
                tile: event.tile,
              };
              context.controller.player(w).enqueue(e);
            }
          }
        },
        notify_end: ({ context, event }) => {
          for (let w of Object.values(WIND)) {
            console.debug(
              context.controller.player(w).id,
              `end hand: ${context.controller.player(w).hand.toString()}`
            );
          }
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
            let t = context.controller.player(event.iam).hand.drawn;
            if (t == null) t = context.controller.river.lastTile.t;
            const can = context.controller.doWin(
              event.iam,
              t,
              context.controller.river.lastTile?.w
            );
            return can != 0;
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
        cannotDraw: ({ context, event }, params) => {
          return !context.controller.wall.canDraw;
        },
      },
      delays: {},
    }
  );
};

let id = 0;
const genEventID = (): string => {
  return (id++).toString();
};
