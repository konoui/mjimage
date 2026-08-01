import { createActor } from "xstate";
import { assert } from "../assert";
import {
  TYPE,
  OP,
  Wind,
  Round,
  WIND,
  ROUND,
  createWindMap,
  BLOCK,
  prevWind,
  HONOR_NUMBERS,
  TERMINAL_NUMBERS,
} from "../core/";
import {
  BoardContext,
  Hand,
  ShantenCalculator,
  BlockCalculator,
  PointCalculator,
  WinResult,
  calcEffectiveTiles,
  getEffectiveTiles,
  TileAnalysis,
  deserializeWinResult,
  SerializedWinResult,
  forHand,
} from "../calculator";
import {
  BlockAnKan,
  BlockChi,
  BlockDaiKan,
  Block,
  BlockPon,
  BlockShoKan,
  Tile,
  is5Tile,
} from "../core/parser";
import { createControllerMachine } from "./state-machine";
import {
  ChoiceAfterDiscardedEvent,
  PlayerEvent,
  ChoiceAfterDrawnEvent,
  prioritizeDiscardedEvents,
  prioritizeDrawnEvents,
  ChoiceForChanKan,
  EventHandler,
  EventHandlerFunc,
  createEventEmitter,
  DistributeEvent,
  ChoiceForReachAcceptance,
} from "./events";
import { Wall, IWall, WallProps } from "./wall";
import { River, IRiver } from "./river";
import { PlaceManager, ScoreManager, shuffle, Counter } from "./managers";
import { nextWind } from "../core/";

/**
 * 鳴いた人と捨てた人からブロック作成時の鳴いた牌を示すインデックスを返す。
 */
const getCallBlockIndex = (
  caller: Wind,
  discardedBy: Wind,
  type: typeof BLOCK.PON | typeof BLOCK.DAI_KAN
) => {
  const distance = Math.abs(Number(caller[0]) - Number(discardedBy[0]));
  assert(1 == distance || distance == 2 || distance == 3);
  if (type == BLOCK.PON) {
    if (distance == 3) return 0;
    else if (distance == 2) return 1;
    return 2;
  } else {
    if (distance == 3) return 0;
    else if (distance == 1) return 3;
    return 2;
  }
};

export interface RoundHistory {
  round: Round;
  scores: { [wind in string]: number };
  players: { [id in string]: Wind };
  sticks: { reach: number; dead: number };
  wall: WallProps;
  choiceEvents: { [id: string]: PlayerEvent[] };
}

export interface PlayerSession {
  id: string;
  handler: EventHandler;
}

export class Controller {
  wall: IWall = new Wall();
  playerIDs: string[];
  actor = createActor(createControllerMachine(this), {});
  observer: Observer;
  handlers: { [id: string]: EventHandler } = {};
  // TODO 同じイベント ID は同じ特定イベントの配列になるので特定イベント ID の配列の union が良さそう
  mailBox: { [id: string]: PlayerEvent[] } = {};
  histories: RoundHistory[] = [];
  debugMode: boolean;

  constructor(
    players: readonly PlayerSession[],
    params?: { debug?: boolean; shuffle?: boolean }
  ) {
    this.debugMode = params?.debug ?? false;
    this.handlers = Object.fromEntries(players.map((p) => [p.id, p.handler]));

    this.playerIDs = players.map((v) => v.id);

    // listening player choice responses
    players.forEach(
      (p) => p.handler.on((e: PlayerEvent) => this.enqueue(e)) // bind
    );

    const handler: EventHandler = createEventEmitter();
    this.observer = new Observer(handler);
    this.observer.eventHandler.on(
      (e: PlayerEvent) => this.observer.handleEvent(e) // bind
    );

    const initial = Object.fromEntries(this.playerIDs.map((i) => [i, 25000]));
    this.observer.scoreManager = new ScoreManager(initial);

    const shuffled =
      params?.shuffle == false ? this.playerIDs : shuffle([...this.playerIDs]);
    this.observer.placeManager = new PlaceManager({
      [shuffled[0]]: WIND.E,
      [shuffled[1]]: WIND.S,
      [shuffled[2]]: WIND.W,
      [shuffled[3]]: WIND.N,
    });
  }
  getBaseBoardParams(w: Wind) {
    return {
      doraIndicators: this.observer.doraIndicators,
      round: this.placeManager.round,
      myWind: w,
      sticks: this.observer.placeManager.sticks,
    };
  }
  hand(w: Wind) {
    return this.observer.hand(w);
  }
  get placeManager() {
    return this.observer.placeManager;
  }
  get scoreManager() {
    return this.observer.scoreManager;
  }
  get river() {
    return this.observer.river;
  }
  next(force?: boolean) {
    if (!this.debugMode || force) this.actor.send({ type: "NEXT" });
  }
  emit(e: PlayerEvent) {
    const id = this.observer.placeManager.playerID(e.wind);
    this.handlers[id].emit(e);
    // emit to observer to apply all user information
    // remove duplicated user events
    const iam = (e as any).iam;
    if (e.wind == iam) this.observer.eventHandler.emit(e);
    else if (iam == null) {
      if (!this.observer.applied[e.id] || e.type == "DISTRIBUTE") {
        this.observer.eventHandler.emit(e);
        this.observer.applied[e.id] = true;
      }
    }
  }
  enqueue(event: PlayerEvent): void {
    if (this.mailBox[event.id] == null) this.mailBox[event.id] = [];
    this.mailBox[event.id].push(event);
  }
  // TODO event instead of eventID to validate choice here
  pollReplies(eventID: string, wind: readonly Wind[]) {
    // 全てのイベントは同じタイプ
    const events = this.mailBox[eventID];
    if (events == null) {
      throw new Error(
        `${eventID} is not enqueued at ${this.actor.getSnapshot().value}`
      );
    }
    if (events.length != wind.length) {
      throw new Error(
        `${eventID}: num of events: got: ${wind.length}, want: ${events.length}`
      );
    }
    if (wind.length == 0) {
      console.warn("no events to handle");
      return;
    }
    const sample = events[0];
    if (sample.type == "CHOICE_AFTER_DISCARDED") {
      const selected = prioritizeDiscardedEvents(
        events as ChoiceAfterDiscardedEvent[]
      );
      if (selected.events.length == 0) {
        this.actor.send({ type: "" });
        return;
      }
      const e = selected.events[0];
      switch (selected.type) {
        case "RON":
          assert(e.choices.RON, "RON choice is not available");
          this.actor.send({
            type: selected.type,
            iam: e.wind,
            ret: deserializeWinResult(e.choices.RON),
            targetInfo: {
              wind: e.discarterInfo.wind,
              tile: Tile.from(e.discarterInfo.tile),
            },
          });
          break;
        case "DAI_KAN":
          assert(e.choices.DAI_KAN, "DAI_KAN choice is not available");
          this.actor.send({
            type: selected.type,
            iam: e.wind,
            block: BlockDaiKan.from(e.choices.DAI_KAN.tiles),
          });
          break;
        case "CHI":
        case "PON":
          const c = e.choices[selected.type];
          assert(c, `${selected.type} choice is not available"`);
          assert(
            selected.events.length == 1,
            `found more than one selected: ${JSON.stringify(selected, null, 2)}`
          );
          const block = Block.deserialize(c[0]);
          this.actor.send({
            type: selected.type,
            iam: e.wind,
            block: block,
          });
          break;
      }
    } else if (sample.type == "CHOICE_AFTER_DRAWN") {
      const selected = prioritizeDrawnEvents(events as ChoiceAfterDrawnEvent[]);
      assert(
        selected.events.length == 1,
        `found more than one selected: ${JSON.stringify(selected, null, 2)}`
      );
      const e = selected.events[0];
      const w = e.wind;
      switch (selected.type) {
        case "TSUMO":
          assert(e.choices.TSUMO, "TSUMO choice is not available");
          this.actor.send({
            type: selected.type,
            ret: deserializeWinResult(e.choices.TSUMO),
            lastTile: Tile.from(e.drawerInfo.tile),
            iam: w,
          });
          break;
        case "REACH":
          const candidates = e.choices[selected.type];
          assert(candidates, `${selected.type} candidates are not available`);
          this.actor.send({
            type: "REACH",
            tile: Tile.from(candidates[0].tile),
            iam: w,
          });
          break;
        case "DISCARD":
          const tiles = e.choices[selected.type];
          assert(tiles, `${selected.type} choice is not available`);
          this.actor.send({
            type: selected.type,
            tile: Tile.from(tiles[0]).clone({ remove: OP.TSUMO }),
            iam: w,
          });
          break;
        case "AN_KAN": {
          const choices = e.choices[selected.type];
          assert(choices, `${selected.type} choice is not available`);
          this.actor.send({
            type: selected.type,
            block: BlockAnKan.from(choices[0].tiles),
            iam: w,
          });
          break;
        }
        case "SHO_KAN": {
          const choices = e.choices[selected.type];
          assert(choices, `${selected.type} choice is not available`);
          this.actor.send({
            type: selected.type,
            block: BlockShoKan.from(choices[0].tiles),
            iam: w,
          });
          break;
        }
        case "DRAWN_GAME_BY_NINE_TERMINALS":
          this.actor.send({ type: "DRAWN_GAME_BY_NINE_TERMINALS", iam: w });
          break;
      }
    } else if (sample.type == "CHOICE_AFTER_CALLED") {
      assert(
        sample.choices.DISCARD,
        `discard candidate tile is not available: ${JSON.stringify(
          sample,
          null,
          2
        )} ${this.hand(sample.wind).toString()}`
      );
      const w = sample.wind;
      const t = Tile.from(sample.choices.DISCARD[0]);
      this.actor.send({ type: "DISCARD", tile: t, iam: w });
    } else if (sample.type == "CHOICE_FOR_REACH_ACCEPTANCE") {
      const selected = events.filter((e) => {
        assert(e.type == "CHOICE_FOR_REACH_ACCEPTANCE");
        return e.choices.RON !== false;
      }) as ChoiceForReachAcceptance[];
      if (selected.length == 0) {
        this.actor.send({
          type: "REACH_ACCEPT",
          reacherInfo: {
            tile: Tile.from(sample.reacherInfo.tile),
            wind: sample.reacherInfo.wind,
          },
        });
        return;
      }

      const e = selected[0];
      this.actor.send({
        type: "RON",
        iam: e.wind,
        ret: deserializeWinResult(e.choices.RON as SerializedWinResult),
        targetInfo: {
          wind: e.reacherInfo.wind,
          tile: Tile.from(e.reacherInfo.tile),
        },
      });
      return;
    } else if (sample.type == "CHOICE_FOR_CHAN_KAN") {
      const selected = events.filter((e) => {
        const ce = e as ChoiceForChanKan;
        return ce.choices.RON !== false;
      }) as ChoiceForChanKan[];

      if (selected.length == 0) {
        this.actor.send({ type: "" });
        return;
      }

      const e = selected[0];
      assert(e.choices.RON, "RON choice is not available");
      this.actor.send({
        type: "RON",
        iam: e.wind,
        ret: deserializeWinResult(e.choices.RON),
        quadWin: true,
        targetInfo: {
          wind: e.callerInfo.wind,
          tile: Tile.from(e.callerInfo.tile),
        },
      });
      return;
    } else {
      throw new Error(`controller found an unexpected event: ${sample.type}`);
    }
  }
  export() {
    return this.histories.concat();
  }
  static load(h: RoundHistory) {
    const events = h.choiceEvents;
    const playerIDs = Object.keys(h.players);
    const empty: EventHandler = {
      emit: (_: PlayerEvent) => {},
      on: (_: EventHandlerFunc) => {},
    };
    const props = playerIDs.map((id) => {
      return { id: id, handler: empty };
    });
    const c = new Controller(props);
    c.playerIDs = playerIDs;
    c.mailBox = events;
    c.observer.placeManager = new PlaceManager(h.players, {
      round: h.round,
      sticks: h.sticks,
    });
    c.observer.scoreManager = new ScoreManager(h.scores);
    c.wall = new Wall(h.wall);
    return c;
  }
  start() {
    this.actor.subscribe((snapshot) => {
      console.debug("State:", snapshot.value);
    });

    const ent = {
      scores: this.scoreManager.summary,
      round: this.placeManager.round,
      players: this.placeManager.playerMap,
      wall: this.wall.export(),
      choiceEvents: this.mailBox,
      sticks: this.placeManager.sticks,
    };
    this.actor.start();
    this.histories.push(ent);
    const v = this.actor.getSnapshot().status;
    if (v != "done")
      throw new Error(
        `unexpected state ${this.actor.getSnapshot().value}(${v})`
      );
  }
  startGame() {
    for (;;) {
      console.debug(`start========${this.placeManager.round}=============`);
      this.start();

      // TODO arrange as function
      this.wall = new Wall();
      this.observer.applied = {};
      this.mailBox = {};
      this.actor = createActor(createControllerMachine(this));

      if (this.placeManager.is(ROUND.W1)) break;
    }
  }
  finalResult(ret: WinResult, iam: Wind) {
    const hand = this.hand(iam);
    const hiddenDoraIndicators = hand.reached
      ? this.wall.hiddenDoraIndicators
      : undefined;
    const final = new PointCalculator(hand, {
      ...ret.boardContext,
      sticks: this.placeManager.sticks,
      hiddenDoraIndicators,
    }).calc(ret.hand);
    assert(final, `[bug] the final result is false`);
    return final;
  }
  doWin(
    w: Wind,
    t: Tile | null | undefined,
    params?: {
      quadWin?: boolean;
      replacementWin?: boolean;
      oneShot?: boolean;
      missingRon?: boolean;
      discardedBy?: Wind;
    }
  ): WinResult | false {
    if (t == null) return false;
    const hand = this.hand(w);
    const discarded = this.river.discards(w);
    let cloned = hand;
    const base = this.getBaseBoardParams(w);
    const env: BoardContext = { ...base };
    const isRon = cloned.drawn == null;
    if (isRon) {
      if (params == null) throw new Error("should ron but params == null");
      if (params.discardedBy == w) return false;
      if (params.missingRon) return false;
      cloned = cloned.clone();
      env.ronWind = params.discardedBy;
      env.finalDiscardWin = !this.wall.canDraw;
      env.quadWin = params.quadWin;
      cloned.inc([t]);
    } else {
      env.finalWallWin = !this.wall.canDraw;
      env.replacementWin = params?.replacementWin;
    }
    env.oneShotWin = params?.oneShot;
    env.doubleReached =
      discarded.length == 0 ||
      (discarded.length == 1 && discarded[0].t.has(OP.HORIZONTAL));
    return ActionLogic.doWin(hand, env, t, discarded);
  }
  doPon(w: Wind, discardedBy: Wind, t?: Tile): readonly BlockPon[] | false {
    if (t == null) return false;
    const hand = this.hand(w);
    return ActionLogic.doPon(hand, w, discardedBy, t);
  }
  doChi(w: Wind, discardedBy: Wind, t?: Tile): readonly BlockChi[] | false {
    if (t == null) return false;
    const hand = this.hand(w);
    return ActionLogic.doChi(hand, w, discardedBy, t);
  }
  doReach(w: Wind): readonly TileAnalysis[] | false {
    const hand = this.hand(w);
    return ActionLogic.doReach(hand);
  }
  doDiscard(w: Wind, called?: BlockChi | BlockPon): readonly Tile[] {
    const hand = this.hand(w);
    return ActionLogic.doDiscard(hand, called);
  }
  doAnKan(w: Wind): readonly BlockAnKan[] | false {
    const hand = this.hand(w);
    return ActionLogic.doAnkan(hand);
  }
  doShoKan(w: Wind): readonly BlockShoKan[] | false {
    const hand = this.hand(w);
    return ActionLogic.doShoKan(hand);
  }
  doDaiKan(w: Wind, discardedBy: Wind, t: Tile): BlockDaiKan | false {
    const hand = this.hand(w);
    return ActionLogic.doDaiKan(hand, w, discardedBy, t);
  }
  canDeclareNineTerminalsAbort(w: Wind) {
    if (this.river.discards(w).length != 0) return false;
    const h = this.hand(w);
    let num = 0;
    for (const t of Object.values(TYPE)) {
      if (t == TYPE.BACK) continue;
      const arr = t == TYPE.Z ? HONOR_NUMBERS : TERMINAL_NUMBERS;
      for (const n of arr) {
        if (h.get(t, n) > 0) num++;
      }
    }
    return num >= 9;
  }
  initialHands() {
    return this.wall.initialHands();
  }
}

export class ActionLogic {
  static doWin(
    hand: Hand,
    env: BoardContext,
    t: Tile,
    riverDiscarded: readonly { t: Tile }[]
  ) {
    const isRon = env.ronWind != null;
    const cloned = isRon ? hand.clone() : hand;
    // ロン牌を手牌に加える
    if (isRon) cloned.inc([t]);
    const tc = new BlockCalculator(cloned);
    const dc = new PointCalculator(cloned, env);
    const hands = tc.calc(t);
    const ret = dc.calc(...hands);
    if (!ret) return false;

    // 自分捨てた牌へのフリテン対応
    if (isRon) {
      const c = getEffectiveTiles(hand).effectiveTiles;
      if (riverDiscarded.some((v) => c.some((ct) => ct.equals(v.t))))
        return false;
    }
    return ret;
  }
  static doChi(
    hand: Hand,
    iam: Wind,
    discardedBy: Wind,
    t: Tile
  ): false | readonly BlockChi[] {
    if (!t.isNum()) return false;
    if (nextWind(discardedBy) != iam) return false;
    if (hand.reached) return false;
    if (hand.hands.length < 3) return false;

    const called = t.clone({
      remove: OP.TSUMO,
      add: [OP.HORIZONTAL],
    });
    const blocks: BlockChi[] = [];
    const left =
      called.n - 2 >= 1 &&
      hand.get(t.t, called.n - 2) > 0 &&
      hand.get(t.t, called.n - 1) > 0;
    if (left)
      blocks.push(
        new BlockChi([
          called,
          new Tile(t.t, called.n - 1),
          new Tile(t.t, called.n - 2),
        ])
      );

    const right =
      called.n + 2 <= 9 &&
      hand.get(t.t, called.n + 1) > 0 &&
      hand.get(t.t, called.n + 2) > 0;
    if (right)
      blocks.push(
        new BlockChi([
          called,
          new Tile(t.t, called.n + 1),
          new Tile(t.t, called.n + 2),
        ])
      );

    const center =
      called.n - 1 >= 1 &&
      called.n + 1 <= 9 &&
      hand.get(t.t, called.n - 1) > 0 &&
      hand.get(t.t, called.n + 1) > 0;
    if (center)
      blocks.push(
        new BlockChi([
          called,
          new Tile(t.t, called.n - 1),
          new Tile(t.t, called.n + 1),
        ])
      );

    // 鳴いた後の手配が全て食い替え対象だとチーできない。
    // 打6 で 333345666 はチーできない。
    // 鳴く牌とスジの牌を削除し、手配が0になればそのブロックでは鳴けない。
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const tiles = getForbiddenDiscardTiles(b);
      const toDec: Tile[] = [];
      for (const t of tiles) {
        const n = hand.get(t.t, t.n);
        for (let j = 0; j < n; j++) toDec.push(t.clone({ remove: OP.RED }));
      }

      const ltiles = hand.dec([...toDec, b.tiles[1], b.tiles[2]]);
      const cannotCall = hand.hands.length == 0;
      hand.inc(ltiles);

      if (cannotCall) blocks.splice(i, 1);
    }

    if (blocks.length == 0) return false;

    const blocksWith5 = blocks.filter(
      (b) => is5Tile(b.tiles[1]) || is5Tile(b.tiles[2])
    );
    if (blocksWith5.length == 0) return blocks;

    const blocksWithout5 = blocks.filter(
      (b) => !is5Tile(b.tiles[1]) && !is5Tile(b.tiles[2])
    );

    // 0. if hand has red tile then get red blocks
    // 1. if hand has non red tiles return original blocks
    // 2. if hand has only tile red return red blocks and original block excluding blocks with 5
    // 3. else if hand has non red tiles return original blocks
    // 4. else if hand as red and non red tiles return original blocks and red blocks
    const hasRed = hand.get(t.t, 0) > 0;
    if (!hasRed) return blocks;
    const redBlocks = hasRed ? getRedPatterns(blocksWith5) : [];
    if (redBlocks.length > 0 && hasRed && hand.get(t.t, 5) == 1)
      return [...blocksWithout5, ...redBlocks];
    return [...blocks, ...redBlocks];
  }
  static doPon(
    hand: Hand,
    iam: Wind,
    discardedBy: Wind,
    t: Tile
  ): false | readonly BlockPon[] {
    if (iam == discardedBy) return false;
    if (hand.reached) return false;
    if (hand.hands.length < 3) return false;
    if (hand.get(t.t, t.n) < 2) return false;

    const sample = t.clone({ removeAll: true });
    const idx = getCallBlockIndex(iam, discardedBy, BLOCK.PON);

    const base = new BlockPon([sample, sample, sample]).clone({
      replace: { idx, tile: t.clone({ add: OP.HORIZONTAL }) },
    });

    // if discarded tile is RED
    if (is5Tile(t) && t.has(OP.RED)) {
      const newBlock = base.clone({
        replace: {
          idx: idx,
          tile: sample.clone({
            add: [OP.RED, OP.HORIZONTAL],
          }),
        },
      });
      return [newBlock];
    }
    // if the hand has red
    const ridx = (idx % 2) + 1;
    if (is5Tile(t) && hand.get(t.t, 0) > 0) {
      const red = base.clone({
        replace: { idx: ridx, tile: sample.clone({ add: OP.RED }) },
      });
      // red and non red case if the hand has 3 tiles including red
      if (hand.get(sample.t, 5) == 3) {
        const nonRed = base.clone({
          replace: { idx: ridx, tile: sample },
        });
        return [red, nonRed];
      } else return [red];
    }

    return [base];
  }
  static doReach(hand: Hand): false | readonly TileAnalysis[] {
    if (hand.reached) return false;
    if (!hand.menzen) return false;
    const s = new ShantenCalculator(hand).calc();
    if (s > 0) return false;
    const r = calcEffectiveTiles(hand, hand.hands);
    return r;
  }
  static doDiscard(hand: Hand, called?: BlockChi | BlockPon): readonly Tile[] {
    if (hand.reached) return [hand.drawn!];
    const handTiles = hand.hands;
    if (called == null) return handTiles;
    if (called instanceof BlockPon) {
      return handTiles.filter((v) => !v.equals(called.tiles[0]));
    }
    const tiles = getForbiddenDiscardTiles(called);
    const ret = handTiles.filter((v) => !tiles.some((t) => v.equals(t)));
    assert(
      ret.length > 0,
      `[bug] no tiles to discard. hand: ${hand}, forbidden tiles: ${tiles}, block-chi: ${called}`
    );
    return ret;
  }
  static doDaiKan(
    hand: Hand,
    iam: Wind,
    discardedBy: Wind,
    t: Tile
  ): false | BlockDaiKan {
    if (hand.reached) return false;
    if (iam == discardedBy) return false;

    const sample = t.clone({ removeAll: true });
    if (hand.get(sample.t, sample.n) != 3) return false;

    const idx = getCallBlockIndex(iam, discardedBy, BLOCK.DAI_KAN);
    const base = new BlockDaiKan([sample, sample, sample, sample]).clone({
      replace: { idx, tile: sample.clone({ add: OP.HORIZONTAL }) },
    });

    let block = base;
    // 捨て牌が red ならその idx を red にする
    if (is5Tile(t) && t.has(OP.RED)) {
      block = base.clone({
        replace: {
          idx: idx,
          tile: sample.clone({ add: [OP.HORIZONTAL, OP.RED] }),
        },
      });
    }
    // 捨て牌が non red なら鳴いた位置からずらして red にする
    else if (is5Tile(t) && !t.has(OP.RED)) {
      assert(
        hand.get(t.t, 0) > 0,
        `[bug] hand does not have red tile to daikan: ${hand.toString()}`
      );
      const ridx = (idx % 3) + 1;
      block = base.clone({
        replace: { idx: ridx, tile: sample.clone({ add: OP.RED }) },
      });
    }

    assert(
      block.tiles.filter((t) => t.has(OP.HORIZONTAL)).length == 1,
      `[bug] daikan has unexpected horizontal operators: ${block.toString()}`
    );
    return block;
  }
  static doAnkan(hand: Hand): false | BlockAnKan[] {
    if (hand.reached) return false; // FIXME 待ち変更がなければできる
    const blocks: BlockAnKan[] = [];
    for (const [t, n] of forHand()) {
      if (hand.get(t, n) == 4) {
        const tile = new Tile(t, n);
        const tiles = [tile, tile, tile, tile];
        if (is5Tile(tile)) tiles[1] = tile.clone({ add: OP.RED });
        blocks.push(new BlockAnKan(tiles));
      }
    }
    if (blocks.length == 0) return false;
    for (const b of blocks)
      assert(
        b.tiles.filter((t) => t.has(OP.HORIZONTAL)).length == 0,
        `[bug] ankan has horizontal op: ${b.toString()}`
      );
    return blocks;
  }
  static doShoKan(hand: Hand): false | BlockShoKan[] {
    if (hand.reached) return false;
    // TODO ハイテイ ではカンできない
    const called = hand.called.filter((b) => b instanceof BlockPon);
    if (called.length == 0) return false;
    const blocks: BlockShoKan[] = [];
    for (const cb of called) {
      const pick = cb.tiles[0].clone({
        removeAll: true,
        add: OP.HORIZONTAL,
      });
      if (hand.get(pick.t, pick.n) == 1) {
        const tile =
          is5Tile(pick) && hand.get(pick.t, 0) > 0
            ? pick.clone({ add: OP.RED })
            : pick;
        blocks.push(BlockShoKan.fromPon(cb, tile));
      }
    }
    if (blocks.length == 0) return false;
    for (const b of blocks)
      assert(
        b.tiles.filter((t) => t.has(OP.HORIZONTAL)).length == 2,
        `[bug] shokan has unexpected horizontal operators: ${b.toString()}`
      );
    return blocks;
  }
}

/**
 * 赤なしのチーブロックを赤ありのチーブロックにして返す。
 */
function getRedPatterns(blocksWith5: readonly BlockChi[]): readonly BlockChi[] {
  if (blocksWith5.length == 0) return [];
  return blocksWith5
    .map((b) => {
      if (is5Tile(b.tiles[1])) {
        const rt = b.tiles[1].clone({ add: OP.RED });
        const n = b.clone({ replace: { idx: 1, tile: rt } });
        return n;
      } else if (is5Tile(b.tiles[2])) {
        const rt = b.tiles[2].clone({ add: OP.RED });
        const n = b.clone({ replace: { idx: 2, tile: rt } });
        return n;
      }
    })
    .filter((b) => b != null);
}

/**
 * 食いかえ対象の牌を返す
 */
function getForbiddenDiscardTiles(b: BlockChi): readonly Tile[] {
  const called = b.tiles[0];
  const h1 = b.tiles[1].n;
  // -423 の 1 , -978　の 6
  if (h1 != 1 && called.n - 2 == h1)
    return [new Tile(called.t, called.n - 3), called];
  // -123 の 4,
  if (h1 != 8 && called.n + 1 == h1)
    return [new Tile(called.t, called.n + 3), called];
  // -324 -789 -312 のカンチャンは対応牌なし
  return [called];
}

export class ActorHand extends Hand {
  isBackHand() {
    for (const t of Object.values(TYPE)) {
      if (t == TYPE.BACK) continue;
      if (this.sum(t) > 0) return false;
    }
    return this.sum(TYPE.BACK) > 0;
  }

  override dec(tiles: readonly Tile[]) {
    if (!this.isBackHand()) return super.dec(tiles);
    super.dec(tiles.map(() => new Tile(TYPE.BACK, 0)));
    return [...tiles];
  }
}

export abstract class BaseActor {
  id: string;
  river: IRiver = new River();
  placeManager = new PlaceManager({}); // empty for init
  scoreManager = new ScoreManager({}); // empty for init
  hands = createWindMap(() => new ActorHand("")); // empty for init
  counter = new Counter();
  private _doraIndicators: Tile[] = []; // empty for init
  eventHandler: EventHandler;
  constructor(id: string, eventHandler: EventHandler) {
    this.id = id;
    this.eventHandler = eventHandler;
  }
  get doraIndicators(): readonly Tile[] {
    return this._doraIndicators;
  }
  hand(w: Wind) {
    return this.hands[w];
  }
  protected abstract setHands(e: DistributeEvent): void;
  // handle event expect for choice events
  handleEvent(e: PlayerEvent) {
    switch (e.type) {
      case "CHOICE_AFTER_CALLED":
      case "CHOICE_AFTER_DISCARDED":
      case "CHOICE_AFTER_DRAWN":
      case "CHOICE_FOR_CHAN_KAN":
      case "CHOICE_FOR_REACH_ACCEPTANCE":
        break;
      case "DISTRIBUTE":
        // reset
        this.counter.reset();

        const doraIndicator = Tile.from(e.doraIndicator);

        this.setHands(e);
        this.placeManager = new PlaceManager(e.places, {
          round: e.round,
          sticks: e.sticks,
        });
        this.scoreManager = new ScoreManager(e.scores);
        this._doraIndicators = [doraIndicator];

        this.counter.dec(doraIndicator);
        for (const w of Object.values(WIND)) {
          if (w != e.wind) continue;
          this.counter.dec(...this.hand(w).hands);
        }
        break;
      case "DRAW": {
        const t = Tile.from(e.tile);
        this.hands[e.iam].draw(t);
        this.counter.dec(t);
        break;
      }
      case "DISCARD": {
        const t = Tile.from(e.tile);
        this.river.discard(t, e.iam);
        this.hands[e.iam].discard(t); // FIXME
        if (e.iam != e.wind) {
          this.counter.dec(t); // own tile is recorded by DRAW event
          this.counter.addTileToSafeMap(t, e.iam); // そのユーザの捨て牌を現物に追加
          // 立直されている場合、捨て牌は立直ユーザの現物になる
          for (const w of Object.values(WIND))
            if (this.hand(w).reached) this.counter.addTileToSafeMap(t, w);
        }
        break;
      }
      case "PON":
      case "CHI":
      case "DAI_KAN": {
        const block = Block.deserialize(e.block);
        this.hands[e.iam].call(block);
        this.river.markCalled();
        if (e.iam != e.wind)
          this.counter.dec(...block.tiles.filter((t) => !t.has(OP.HORIZONTAL)));
        break;
      }
      case "SHO_KAN": {
        const block = BlockShoKan.from(e.block.tiles);
        this.hands[e.iam].kan(block);
        if (e.iam != e.wind)
          this.counter.dec(block.tiles.filter((t) => t.has(OP.HORIZONTAL))[0]);
        break;
      }
      case "AN_KAN": {
        const block = BlockAnKan.from(e.block.tiles);
        this.hands[e.iam].kan(block);
        if (e.iam != e.wind)
          this.counter.dec(...block.tiles.filter((t) => !t.has(OP.HORIZONTAL)));
        break;
      }
      case "REACH": {
        // mark as reach
        this.hands[e.iam].reach();
        // DISCARD イベントと同じ
        const t = Tile.from(e.tile);
        this.river.discard(t, e.iam);
        this.hands[e.iam].discard(t);
        if (e.iam != e.wind) {
          this.counter.dec(t); // own tile is recorded by DRAW event
          this.counter.addTileToSafeMap(t, e.iam); // そのユーザの捨て牌を現物に追加
          // 立直されている場合、捨て牌は立直ユーザの現物になる
          for (const w of Object.values(WIND))
            if (this.hand(w).reached) this.counter.addTileToSafeMap(t, w);
        }
        break;
      }
      case "REACH_ACCEPTED":
        // handle reach stick
        const pid = this.placeManager.playerID(e.reacherInfo.wind);
        this.scoreManager.reach(pid);
        this.placeManager.incrementReachStick();
        break;
      case "NEW_DORA": {
        const doraIndicator = Tile.from(e.doraIndicator);
        this._doraIndicators.push(doraIndicator);
        this.counter.dec(doraIndicator);
        break;
      }
      case "TSUMO":
        break;
      case "RON":
        break;
      case "END_GAME":
        switch (e.subType) {
          case "NINE_TERMINALS":
          case "FOUR_KANS":
          case "FOUR_WINDS":
            this.placeManager.incrementDeadStick();
            break;
          case "DRAWN_GAME": {
            const pm = this.placeManager.playerMap;
            this.scoreManager.update(e.deltas, pm);
            this.placeManager.incrementDeadStick();
            if (!e.shouldContinue) this.placeManager.nextRound();
            break;
          }
          case "WIN_GAME": {
            const pm = this.placeManager.playerMap;
            this.scoreManager.update(e.deltas, pm);
            if (e.shouldContinue) this.placeManager.incrementDeadStick();
            else {
              this.placeManager.nextRound();
              this.placeManager.resetDeadStick();
            }
            this.placeManager.resetReachStick();
            break;
          }
        }
        break;
      default:
        throw new Error(`unexpected event ${JSON.stringify(e, null, 2)}`);
    }
  }
}

export class Observer extends BaseActor {
  applied: { [id: string]: boolean } = {};
  constructor(eventHandler: EventHandler) {
    super("observer", eventHandler);
    this.counter.disabled = true;
    this.hands = createWindMap(() => new ActorHand("_____________"));
  }
  setHands(e: DistributeEvent): void {
    this.hands[e.wind] = new ActorHand(e.hands[e.wind]);
  }
  handleEvent(e: PlayerEvent): void {
    super.handleEvent(e);

    switch (e.type) {
      case "DISTRIBUTE":
        let ready = true;
        for (const w of Object.values(WIND))
          ready &&= this.hand(w).get(TYPE.BACK, 0) == 0;
        if (!ready) break;
        console.debug(
          `DISTRIBUTE:`,
          `round: ${this.placeManager.round}`,
          `scores: ${JSON.stringify(this.scoreManager.summary, null, 2)}`,
          `map: ${JSON.stringify(this.placeManager.playerMap, null, 2)}`,
          `sticks: ${JSON.stringify(this.placeManager.sticks, null, 2)}`
        );
        for (const w of Object.values(WIND))
          console.debug(
            `${this.placeManager.playerID(w)}(${w})`,
            `init hand: ${this.hand(w).toString()}`
          );
        break;
      case "DRAW":
        console.debug(
          `${this.placeManager.playerID(e.iam)}(${e.iam})`,
          `draw: ${this.hand(e.iam).drawn}`,
          `hand: ${this.hand(e.iam).toString()}`
        );
        break;
      case "DISCARD":
        console.debug(
          `${this.placeManager.playerID(e.iam)}(${e.iam})`,
          `discard: ${e.tile.toString()}`,
          `hand: ${this.hand(e.iam).toString()}`
        );
        break;
      case "CHI":
      case "PON":
      case "DAI_KAN":
      case "AN_KAN":
      case "SHO_KAN":
        console.debug(
          `${this.placeManager.playerID(e.iam)}(${e.iam})`,
          `call: ${e.block.tiles}`,
          `hand: ${this.hand(e.iam).toString()}`
        );
        break;
      case "REACH":
        console.debug(
          `${this.placeManager.playerID(e.iam)}(${e.iam})`,
          `reach: ${e.tile}`,
          `hand: ${this.hand(e.iam).toString()}`
        );
        break;
      case "TSUMO":
      case "RON":
        console.debug(
          `${this.placeManager.playerID(e.iam)}(${e.iam})`,
          `ron/tsumo: ${JSON.stringify(e.ret, null, 2)}`,
          `hand: ${this.hand(e.iam).toString()}`
        );
        break;
      case "END_GAME":
        for (const w of Object.values(WIND)) {
          // Note: show prev wind as wind of player is updated by BaseActor handler
          console.debug(
            `${this.placeManager.playerID(w)}(${prevWind(w)})`,
            `end hand: ${this.hand(w).toString()}`
          );
        }
        console.debug(
          "END_GAME",
          e.subType,
          "scores",
          JSON.stringify(this.scoreManager.summary, null, 2),
          `sticks: ${JSON.stringify(this.placeManager.sticks, null, 2)}`
        );
    }
  }
}
