import { createActor } from "xstate";
import { assert } from "../myassert";
import {
  TYPE,
  OPERATOR,
  Wind,
  Round,
  WIND,
  ROUND,
  createWindMap,
  callBlockIndex,
  BLOCK,
} from "../core/";
import {
  BoardContext,
  Hand,
  ShantenCalculator,
  BlockCalculator,
  DoubleCalculator,
  WinResult,
  Efficiency,
  Candidate,
  deserializeWinResult,
  NZ,
  N19,
  SerializedWinResult,
} from "../calculator";
import {
  BlockAnKan,
  BlockChi,
  BlockDaiKan,
  Block,
  BlockPon,
  BlockShoKan,
  Tile,
  isNum5,
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
import {
  Wall,
  IWall,
  WallProps,
  River,
  PlaceManager,
  ScoreManager,
  shuffle,
  Counter,
  IRiver,
} from ".";
import { nextWind } from "../core/";

export interface History {
  round: Round;
  scores: { [key in string]: number };
  players: { [key in string]: Wind };
  sticks: { reach: number; dead: number };
  wall: WallProps;
  choiceEvents: { [id: string]: PlayerEvent[] };
}

export interface PlayerConnection {
  id: string;
  handler: EventHandler;
}

export class Controller {
  wall: IWall = new Wall();
  playerIDs: string[];
  actor = createActor(createControllerMachine(this), {});
  observer: Observer;
  handlers: { [id: string]: EventHandler } = {};
  mailBox: { [id: string]: PlayerEvent[] } = {};
  histories: History[] = [];
  debugMode: boolean;

  constructor(
    players: PlayerConnection[],
    params?: { debug?: boolean; shuffle?: boolean }
  ) {
    this.debugMode = params?.debug ?? false;
    this.handlers = players.reduce((m, obj) => {
      m[obj.id] = obj.handler;
      return m;
    }, {} as typeof this.handlers);

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
  boardParams(w: Wind): BoardContext {
    const hand = this.hand(w);
    let reached: 1 | 2 | undefined = !hand.reached ? undefined : 1;
    if (reached) {
      const d = this.river.discards(w);
      reached =
        d.length == 0 || (d.length == 1 && d[0].t.has(OPERATOR.HORIZONTAL))
          ? 2
          : 1;
    }
    return {
      doraMarkers: this.observer.doraMarkers,
      round: this.placeManager.round,
      myWind: w,
      sticks: this.observer.placeManager.sticks,
      reached: reached,
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
  pollReplies(eventID: string, wind: Wind[]) {
    const events = this.mailBox[eventID];
    if (events == null) {
      throw new Error(
        `not enqueued ${eventID} at ${this.actor.getSnapshot().value}`
      );
    }
    if (events.length != wind.length) {
      throw new Error(
        `${eventID}: num of event: got: ${wind.length}, want: ${events.length}`
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
          assert(e.choices.RON, "ron choice is none");
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
          assert(e.choices.DAI_KAN, "daikan choice is none");
          this.actor.send({
            type: selected.type,
            iam: e.wind,
            block: BlockDaiKan.from(e.choices.DAI_KAN.tiles),
          });
          break;
        case "CHI":
        case "PON":
          const c = e.choices[selected.type];
          assert(c, `${selected.type} choice is none`);
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
          assert(e.choices.TSUMO, "tsumo choice is none");
          this.actor.send({
            type: selected.type,
            ret: deserializeWinResult(e.choices.TSUMO),
            lastTile: Tile.from(e.drawerInfo.tile),
            iam: w,
          });
          break;
        case "REACH":
          const candidates = e.choices[selected.type];
          assert(candidates, `${selected.type} candidates is none`);
          this.actor.send({
            type: "REACH",
            tile: Tile.from(candidates[0].tile),
            iam: w,
          });
          break;
        case "DISCARD":
          const tiles = e.choices[selected.type];
          assert(tiles, `${selected.type} choice is none`);
          this.actor.send({
            type: selected.type,
            tile: Tile.from(tiles[0]).clone({ remove: OPERATOR.TSUMO }),
            iam: w,
          });
          break;
        case "AN_KAN": {
          const choices = e.choices[selected.type];
          assert(choices, `${selected.type} choice is none`);
          this.actor.send({
            type: selected.type,
            block: BlockAnKan.from(choices[0].tiles),
            iam: w,
          });
          break;
        }
        case "SHO_KAN": {
          const choices = e.choices[selected.type];
          assert(choices, `${selected.type} choice is none`);
          this.actor.send({
            type: selected.type,
            block: BlockShoKan.from(choices[0].tiles),
            iam: w,
          });
          break;
        }
        case "DRAWN_GAME_BY_NINE_ORPHANS":
          this.actor.send({ type: "DRAWN_GAME_BY_NINE_ORPHANS", iam: w });
          break;
      }
    } else if (sample.type == "CHOICE_AFTER_CALLED") {
      assert(
        sample.choices.DISCARD,
        `discard candidate tile is none: ${JSON.stringify(
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
      assert(e.choices.RON, "ron choice is none");
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
      console.warn(`controller found unexpected event: ${sample.type}`);
    }
  }
  export() {
    return this.histories.concat();
  }
  static load(h: History) {
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
      round: structuredClone(h.round),
      sticks: structuredClone(h.sticks),
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
    // if (v != "done")
    //   throw new Error(
    //     `unexpected state ${this.actor.getSnapshot().value}(${v})`
    //   );
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
    const blindDoraMarkers = hand.reached
      ? this.wall.blindDoraMarkers
      : undefined;
    const final = new DoubleCalculator(hand, {
      ...ret.boardContext,
      sticks: this.placeManager.sticks,
      blindDoraMarkers: blindDoraMarkers,
    }).calc([ret.hand]);
    assert(final);
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
    let hand = this.hand(w);
    const env = this.boardParams(w);
    if (hand.drawn == null) {
      if (params == null) throw new Error("should ron but params == null");
      if (params.discardedBy == w) return false;
      if (params.missingRon) return false;
      hand = hand.clone();
      env.ronWind = params.discardedBy;
      env.finalDiscardWin = !this.wall.canDraw;
      env.quadWin = params.quadWin;
      hand.inc([t]); // TODO hand.draw looks good but it adds OP.TSUMO
    } else {
      env.finalWallWin = !this.wall.canDraw;
      env.replacementWin = params?.replacementWin;
    }
    env.oneShotWin = params?.oneShot;

    const tc = new BlockCalculator(hand);
    const dc = new DoubleCalculator(hand, env);
    const hands = tc.calc(t);
    const ret = dc.calc(hands);
    if (!ret) return false;
    if (ret.points.length == 0) return false;

    // case ron フリテン対応
    if (hand.draw == null) {
      const c = Efficiency.candidateTiles(this.hand(w)).candidates;
      const tiles = this.river.discards(w).map((v) => v.t);
      if (tiles.some((t) => c.some((ct) => ct.equals(t)))) return false;
    }
    return ret;
  }
  doPon(w: Wind, discardedBy: Wind, t?: Tile): BlockPon[] | false {
    if (t == null) return false;
    if (w == discardedBy) return false;
    const hand = this.hand(w);
    if (hand.reached) return false;
    if (hand.hands.length < 3) return false;

    let sample = t.clone({ removeAll: true });
    if (hand.get(t.t, sample.n) < 2) return false;

    const idx = callBlockIndex(w, discardedBy, BLOCK.PON);

    const blocks: BlockPon[] = [];
    const base = new BlockPon([sample, sample, sample]).clone({
      replace: { idx, tile: t.clone({ add: OPERATOR.HORIZONTAL }) },
    });
    let block = base;

    // if discarded tile is RED
    if (isNum5(t) && t.has(OPERATOR.RED))
      block = base.clone({
        replace: {
          idx: idx,
          tile: new Tile(sample.t, sample.n, [
            OPERATOR.RED,
            OPERATOR.HORIZONTAL,
          ]),
        },
      });
    // if hand has red
    const ridx = (idx % 2) + 1;
    if (isNum5(t) && hand.get(t.t, 0) > 0) {
      block = base.clone({
        replace: { idx: ridx, tile: sample.clone({ add: OPERATOR.RED }) },
      });
    }

    blocks.push(block);

    // if hand has red and 3 tiles, two cases including red and non red
    if (isNum5(sample) && hand.get(sample.t, 5) == 3) {
      const nonRed = base.clone({
        replace: { idx: ridx, tile: sample },
      });
      blocks.push(nonRed);
    }

    return blocks;
  }
  doChi(w: Wind, discardedBy: Wind, t?: Tile): BlockChi[] | false {
    if (t == null) return false;
    if (!t.isNum()) return false;
    if (nextWind(discardedBy) != w) return false;
    const hand = this.hand(w);
    if (hand.reached) return false;
    if (hand.hands.length < 3) return false;

    let called = t.has(OPERATOR.RED)
      ? new Tile(t.t, t.n, [OPERATOR.HORIZONTAL, OPERATOR.RED])
      : t.clone({ removeAll: true, add: OPERATOR.HORIZONTAL });

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
      const tiles = this.cannotDiscardTile(b);
      const toDec: Tile[] = [];
      for (let t of tiles) {
        const n = hand.get(t.t, t.n);
        for (let j = 0; j < n; j++)
          // FIXME dec が red じゃなくても red を dec してくれる仕様に依存している。
          toDec.push(t.clone({ remove: OPERATOR.RED }));
      }

      const ltiles = hand.dec([...toDec, b.tiles[1], b.tiles[2]]);
      const cannotCall = hand.hands.length == 0;
      hand.inc(ltiles);

      if (cannotCall) blocks.splice(i, 1);
    }

    if (blocks.length == 0) return false;

    // 1. check whether can-chi or not with ignoredRed pattern
    // 2. get red patterns if having red
    // 3. if not having normal 5, return only red pattern, else if concat red and normal patterns
    const hasRed = hand.get(t.t, 0) > 0;
    const reds = hasRed ? this.redPattern(blocks) : [];
    if (reds.length > 0 && hand.get(t.t, 5) == 1) return reds;
    return [...blocks, ...reds];
  }
  redPattern(blocks: BlockChi[]): BlockChi[] {
    if (blocks.length == 0) return [];
    const filtered = blocks.filter(
      (b) => isNum5(b.tiles[1]) || isNum5(b.tiles[2])
    );
    return filtered
      .map((b) => {
        if (isNum5(b.tiles[1])) {
          const rt = b.tiles[1].clone({ add: OPERATOR.RED });
          const n = b.clone({ replace: { idx: 1, tile: rt } });
          return n;
        } else if (isNum5(b.tiles[2])) {
          const rt = b.tiles[2].clone({ add: OPERATOR.RED });
          const n = b.clone({ replace: { idx: 2, tile: rt } });
          return n;
        }
      })
      .filter((b) => b != null);
  }
  doReach(w: Wind): Candidate[] | false {
    const hand = this.hand(w);
    if (hand.reached) return false;
    if (!hand.menzen) return false;
    const s = new ShantenCalculator(hand).calc();
    if (s > 0) return false;
    const r = Efficiency.calcCandidates(hand, hand.hands);
    return r;
  }
  doDiscard(w: Wind, called?: BlockChi | BlockPon): Tile[] {
    if (this.hand(w).reached) return [this.hand(w).drawn!];
    const hand = this.hand(w).hands;
    if (called == null) return hand;

    if (called instanceof BlockPon) {
      return hand.filter((v) => !v.equals(called.tiles[0]));
    }
    const tiles = this.cannotDiscardTile(called);
    const ret = hand.filter((v) => !tiles.some((t) => v.equals(t)));
    assert(
      ret.length > 0,
      `no tiles to discard. hand: ${this.hand(
        w
      )}, suji: ${tiles}, block-chi: ${called}`
    );
    return ret;
  }
  cannotDiscardTile(b: BlockChi) {
    const called = b.tiles[0];
    let h1 = b.tiles[1].n;
    // -423, -978
    if (h1 != 1 && called.n - 2 == h1)
      return [new Tile(called.t, called.n - 3), called];
    // -123,
    if (h1 != 8 && called.n + 1 == h1)
      return [new Tile(called.t, called.n + 3), called];
    // -324 -789 -312
    return [called];
  }
  doAnKan(w: Wind): BlockAnKan[] | false {
    const hand = this.hand(w);
    const blocks: BlockAnKan[] = [];
    if (hand.reached) return false; // FIXME 待ち変更がなければできる
    for (let t of Object.values(TYPE)) {
      for (let n = 1; n < hand.getArrayLen(t); n++) {
        if (hand.get(t, n) == 4) {
          const tile = new Tile(t, n);
          const tiles = [tile, tile, tile, tile];
          if (isNum5(tile)) tiles[1] = tile.clone({ add: OPERATOR.RED });
          blocks.push(new BlockAnKan(tiles));
        }
      }
    }
    if (blocks.length == 0) return false;
    for (let b of blocks)
      assert(
        b.tiles.filter((t) => t.has(OPERATOR.HORIZONTAL)).length == 0,
        `h op ${b.toString()}`
      );
    return blocks;
  }
  doShoKan(w: Wind): BlockShoKan[] | false {
    const hand = this.hand(w);
    if (hand.reached) return false;
    const called = hand.called.filter((b) => b instanceof BlockPon);
    if (called.length == 0) return false;
    const blocks: BlockShoKan[] = [];
    for (let cb of called) {
      const pick = cb.tiles[0].clone({
        removeAll: true,
        add: OPERATOR.HORIZONTAL,
      });
      if (hand.get(pick.t, pick.n) == 1) {
        const tile =
          isNum5(pick) && hand.get(pick.t, 0) > 0
            ? pick.clone({ add: OPERATOR.RED })
            : pick;
        // FIXME 追加の HORIZONTAL は最後でいいのか
        blocks.push(new BlockShoKan([...cb.tiles, tile]));
      }
    }
    if (blocks.length == 0) return false;
    for (let b of blocks)
      assert(
        b.tiles.filter((t) => t.has(OPERATOR.HORIZONTAL)).length == 2,
        `h op ${b.toString()}`
      );

    return blocks;
  }
  doDaiKan(w: Wind, discardedBy: Wind, t: Tile): BlockDaiKan | false {
    const hand = this.hand(w);
    if (hand.reached) return false;
    if (w == discardedBy) return false;

    const sample = t.clone({ removeAll: true });
    if (hand.get(sample.t, sample.n) != 3) return false;

    const idx = callBlockIndex(w, discardedBy, BLOCK.DAI_KAN);
    let block = new BlockDaiKan([sample, sample, sample, sample]).clone({
      replace: { idx, tile: sample.clone({ add: OPERATOR.HORIZONTAL }) },
    });

    // 捨て牌が red ならその idx を red にする
    if (isNum5(t) && t.has(OPERATOR.RED)) {
      block = block.clone({
        replace: {
          idx: idx,
          tile: new Tile(sample.t, sample.n, [
            OPERATOR.HORIZONTAL,
            OPERATOR.RED,
          ]),
        },
      });
    }
    // 捨て牌が non red なら鳴いた位置からずらして red にする
    else if (isNum5(t) && !t.has(OPERATOR.RED)) {
      assert(
        hand.get(t.t, 0) > 0,
        `hand does not have red tile: ${hand.toString()}`
      );
      const ridx = (idx % 3) + 1;
      block = block.clone({
        replace: { idx: ridx, tile: sample.clone({ add: OPERATOR.RED }) },
      });
    }

    assert(
      block.tiles.filter((t) => t.has(OPERATOR.HORIZONTAL)).length == 1,
      `h op ${block.toString()}`
    );
    return block;
  }
  canDrawnGame(w: Wind) {
    if (this.river.discards(w).length != 0) return false;
    const h = this.hand(w);
    let num = 0;
    for (let t of Object.values(TYPE)) {
      if (t == TYPE.BACK) continue;
      const arr = t == TYPE.Z ? NZ : N19;
      for (let n of arr) {
        if (h.get(t, n) > 0) num++;
      }
    }
    return num >= 9;
  }
  initialHands() {
    return this.wall.initialHands();
  }
}

export class ActorHand extends Hand {
  isBackHand() {
    for (let t of Object.values(TYPE)) {
      if (t == TYPE.BACK) continue;
      if (this.sum(t) > 0) return false;
    }
    return this.sum(TYPE.BACK) > 0;
  }

  override clone() {
    const c = new ActorHand(this.toString());
    c.data.reached = this.data.reached;
    return c;
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
  hands = createWindMap(new ActorHand("")); // empty for init
  counter = new Counter();
  doraMarkers: Tile[] = []; // empty for init
  eventHandler: EventHandler;
  constructor(id: string, eventHandler: EventHandler) {
    this.id = id;
    this.eventHandler = eventHandler;
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

        const doraMarker = Tile.from(e.doraMarker);

        this.setHands(e);
        this.placeManager = new PlaceManager(structuredClone(e.places), {
          round: structuredClone(e.round),
          sticks: structuredClone(e.sticks),
        });
        this.scoreManager = new ScoreManager(structuredClone(e.scores));
        this.doraMarkers = [doraMarker];

        this.counter.dec(doraMarker);
        for (let w of Object.values(WIND)) {
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
          for (let w of Object.values(WIND))
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
          this.counter.dec(
            ...block.tiles.filter((t) => !t.has(OPERATOR.HORIZONTAL))
          );
        break;
      }
      case "SHO_KAN": {
        const block = BlockShoKan.from(e.block.tiles);
        this.hands[e.iam].kan(block);
        if (e.iam != e.wind)
          this.counter.dec(
            block.tiles.filter((t) => t.has(OPERATOR.HORIZONTAL))[0]
          );
        break;
      }
      case "AN_KAN": {
        const block = BlockAnKan.from(e.block.tiles);
        this.hands[e.iam].kan(block);
        if (e.iam != e.wind)
          this.counter.dec(
            ...block.tiles.filter((t) => !t.has(OPERATOR.HORIZONTAL))
          );
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
          for (let w of Object.values(WIND))
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
        const doraMarker = Tile.from(e.doraMarker);
        this.doraMarkers.push(doraMarker);
        this.counter.dec(doraMarker);
        break;
      }
      case "TSUMO":
        break;
      case "RON":
        break;
      case "END_GAME":
        switch (e.subType) {
          case "NINE_TILES":
          case "FOUR_KAN":
          case "FOUR_WIND":
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
    this.counter.disable = true;
    this.hands = createWindMap(new ActorHand("_____________"));
  }
  setHands(e: DistributeEvent): void {
    this.hands[e.wind] = new ActorHand(e.hands[e.wind]);
  }
  handleEvent(e: PlayerEvent): void {
    super.handleEvent(e);

    switch (e.type) {
      case "DISTRIBUTE":
        let ready = true;
        for (let w of Object.values(WIND))
          ready &&= this.hand(w).get(TYPE.BACK, 0) == 0;
        if (!ready) break;
        console.debug(
          `DISTRIBUTE:`,
          `round: ${this.placeManager.round}`,
          `scores: ${JSON.stringify(this.scoreManager.summary, null, 2)}`,
          `map: ${JSON.stringify(this.placeManager.playerMap, null, 2)}`,
          `sticks: ${JSON.stringify(this.placeManager.sticks, null, 2)}`
        );
        for (let w of Object.values(WIND))
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
        for (let w of Object.values(WIND)) {
          console.debug(
            `${this.placeManager.playerID(w)}(${w})`,
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
