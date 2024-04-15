import assert from "assert";
import { createActor } from "xstate";
import { KIND, OPERATOR, Wind, Round, WIND } from "../constants";
import {
  BoardParams,
  Hand,
  ShantenCalculator,
  TileCalculator,
  DoubleCalculator,
  WinResult,
} from "../calculator";
import {
  BlockAnKan,
  BlockChi,
  BlockDaiKan,
  BlockPon,
  BlockShoKan,
  Tile,
  blockWrapper,
} from "../parser";
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
} from "./events";
import {
  Wall,
  WallProps,
  River,
  PlaceManager,
  ScoreManager,
  nextWind,
  shuffle,
  createWindMap,
  Counter,
  Efficiency,
  Candidate,
} from ".";

export interface History {
  round: Round;
  scores: { [key in string]: number };
  players: { [key in string]: Wind };
  sticks: { reach: number; dead: number };
  wall: WallProps;
  choiceEvents: { [id: string]: PlayerEvent[] };
}

export interface PlayerProps {
  id: string;
  handler: EventHandler;
}

export class Controller {
  wall: Wall = new Wall();
  playerIDs: string[];
  actor = createActor(createControllerMachine(this), {});
  observer: Observer;
  handlers: { [id: string]: EventHandler } = {};
  mailBox: { [id: string]: PlayerEvent[] } = {};
  histories: History[] = [];
  debugMode: boolean;
  snapshot?: string;

  constructor(players: PlayerProps[], params?: { debug?: boolean }) {
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

    const shuffled = shuffle(this.playerIDs.concat());
    this.observer.placeManager = new PlaceManager({
      [shuffled[0]]: "1w",
      [shuffled[1]]: "2w",
      [shuffled[2]]: "3w",
      [shuffled[3]]: "4w",
    });
  }
  boardParams(w: Wind): BoardParams {
    const hand = this.hand(w);
    return {
      dora: this.wall.doras,
      round: this.placeManager.round,
      myWind: w,
      sticks: this.observer.placeManager.sticks,
      reached: !hand.reached
        ? undefined
        : this.river.discards(w).length != 0
        ? 1
        : 2,
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
            ret: e.choices.RON,
            tileInfo: e.tileInfo,
          });
          break;
        case "DAI_KAN":
          assert(e.choices.DAI_KAN, "daikan choice is none");
          this.actor.send({
            type: selected.type,
            iam: e.wind,
            block: e.choices.DAI_KAN,
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
          this.actor.send({
            type: selected.type,
            iam: e.wind,
            block: c[0],
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
            ret: e.choices.TSUMO,
            lastTile: e.tileInfo.tile,
            iam: w,
          });
          break;
        case "REACH":
          const candidates = e.choices[selected.type];
          assert(candidates, `${selected.type} candidates is none`);
          this.actor.send({
            type: selected.type,
            tile: candidates[0].tile,
            iam: w,
          });
          break;
        case "DISCARD":
          const tiles = e.choices[selected.type];
          assert(tiles, `${selected.type} choice is none`);
          this.actor.send({
            type: selected.type,
            tile: tiles[0].remove(OPERATOR.TSUMO),
            iam: w,
          });
          break;
        case "AN_KAN":
        case "SHO_KAN":
          const choices = e.choices[selected.type];
          assert(choices, `${selected.type} choice is none`);
          this.actor.send({
            type: selected.type,
            block: choices[0],
            iam: w,
          });
          break;
        case "DRAWN_GAME_BY_NINE_TILES":
          this.actor.send({ type: "DRAWN_GAME_BY_NINE_TILES", iam: w });
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
      const t = sample.choices.DISCARD[0];
      assert(t != null, `undefined tile ${this.hand(w).toString()}`);
      this.actor.send({ type: "DISCARD", tile: t, iam: w });
    } else if (sample.type == "CHOICE_FOR_CHAN_KAN") {
      const selected = events.filter((e) => {
        const ce = e as ChoiceForChanKan;
        return ce.choices.RON;
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
        ret: e.choices.RON,
        quadWin: true,
        tileInfo: e.tileInfo,
      });
    }
  }
  export() {
    return this.histories.concat();
  }
  static load(h: History) {
    const events = h.choiceEvents;
    replaceTileBlock(events);
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

      if (this.placeManager.is("3w1")) break;
    }
  }
  finalResult(ret: WinResult, iam: Wind) {
    const hand = this.hand(iam);
    const blindDoras = hand.reached ? this.wall.blindDoras : undefined;
    const final = new DoubleCalculator(hand, {
      ...ret.params,
      sticks: this.placeManager.sticks,
      blindDora: blindDoras,
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
      whoDiscarded?: Wind;
    }
  ): WinResult | false {
    if (t == null) return false;
    let hand = this.hand(w);
    const env = this.boardParams(w);
    if (hand.drawn == null) {
      if (params == null) throw new Error("should ron but params == null");
      if (params.whoDiscarded == w) return false;
      if (params.missingRon) return false;
      hand = hand.clone();
      env.ronWind = params.whoDiscarded;
      env.finalDiscardWin = !this.wall.canDraw;
      env.quadWin = params.quadWin;
      hand.inc([t]); // TODO hand.draw looks good but it adds OP.TSUMO
    } else {
      env.finalWallWin = !this.wall.canDraw;
      env.replacementWin = params?.replacementWin;
    }
    env.oneShotWin = params?.oneShot;

    const tc = new TileCalculator(hand);
    const dc = new DoubleCalculator(hand, env);
    const hands = tc.calc(t);
    const ret = dc.calc(hands);
    if (!ret) return false;
    if (ret.points.length == 0) return false;

    // case ron フリテン対応
    if (hand.draw == null) {
      const c = Efficiency.candidateTiles(this.hand(w)).candidates;
      const tiles = this.river.discards(w).map((v) => v.t);
      if (tiles.some((t) => c.some((ct) => ct.equals(t, true)))) return false;
    }
    return ret;
  }
  doPon(w: Wind, whoDiscarded: Wind, t?: Tile): BlockPon[] | false {
    if (t == null) return false;
    if (w == whoDiscarded) return false;
    const hand = this.hand(w);
    if (hand.reached) return false;
    if (hand.hands.length < 3) return false;

    const fake = t.clone().remove(OPERATOR.HORIZONTAL);
    if (t.isNum() && t.n == 0) fake.n = 5;
    if (hand.get(t.k, fake.n) < 2) return false;

    const blocks: BlockPon[] = [];
    let idx = Math.abs(Number(w[0]) - Number(whoDiscarded[0]));
    if (idx == 3) idx = 0;
    if (idx == 2) idx = 1;
    if (idx == 1) idx = 2;

    const b = new BlockPon([fake.clone(), fake.clone(), fake.clone()]);
    b.tiles[idx] = t.clone().add(OPERATOR.HORIZONTAL);
    if (t.isNum() && fake.n == 5 && hand.get(t.k, 0) > 0)
      b.tiles[(idx % 2) + 1].n = 0;
    blocks.push(b);

    if (t.isNum() && t.n == 5 && hand.get(t.k, fake.n) == 3) {
      const red = b.clone();
      red.tiles[(idx % 2) + 1].n = 5;
      blocks.push(red);
    }

    return blocks;
  }
  doChi(w: Wind, whoDiscarded: Wind, t?: Tile): BlockChi[] | false {
    if (t == null) return false;
    if (!t.isNum()) return false;
    if (nextWind(whoDiscarded) != w) return false;
    const hand = this.hand(w);
    if (hand.reached) return false;
    if (hand.hands.length < 3) return false;

    const fake = t.clone();
    if (fake.n == 0) fake.n = 5;

    const blocks: BlockChi[] = [];
    const left =
      fake.n - 2 >= 1 &&
      hand.get(t.k, fake.n - 2) > 0 &&
      hand.get(t.k, fake.n - 1) > 0;
    const cloned = t.clone().add(OPERATOR.HORIZONTAL).remove(OPERATOR.TSUMO);
    if (left)
      blocks.push(
        new BlockChi([
          cloned,
          new Tile(t.k, fake.n - 1),
          new Tile(t.k, fake.n - 2),
        ])
      );
    const right =
      fake.n + 2 <= 9 &&
      hand.get(t.k, fake.n + 1) > 0 &&
      hand.get(t.k, fake.n + 2) > 0;
    if (right)
      blocks.push(
        new BlockChi([
          cloned,
          new Tile(t.k, fake.n + 1),
          new Tile(t.k, fake.n + 2),
        ])
      );
    const center =
      fake.n - 1 >= 1 &&
      fake.n + 1 <= 9 &&
      hand.get(t.k, fake.n - 1) > 0 &&
      hand.get(t.k, fake.n + 1) > 0;
    if (center)
      blocks.push(
        new BlockChi([
          cloned,
          new Tile(t.k, fake.n - 1),
          new Tile(t.k, fake.n + 1),
        ])
      );

    if (blocks.length == 0) return false;

    // 手配が4枚でのチーは、鳴いた後の手配が全て食い替え対象だとできない
    if (hand.hands.length == 4) {
      const b = blocks[0];
      const tiles = this.cannotDiscardTile(blocks[0]);
      const ltiles = hand.dec([b.tiles[1], b.tiles[2]]);
      const cannotCall =
        tiles.reduce((acc: number, e: Tile) => acc + hand.get(e.k, e.n), 0) ==
        2;
      hand.inc(ltiles);
      if (cannotCall) return false;
    }

    // 1. check whether can-chi or not with ignoredRed pattern
    // 2. get red patterns if having red
    // 3. if not having normal 5, return only red pattern, else if concat red and normal patterns
    const hasRed = hand.get(t.k, 0) > 0;
    const reds = this.redPattern(blocks, hasRed);
    if (reds.length > 0 && hand.get(t.k, 5) == 1) return reds;
    return blocks.concat(reds);
  }
  redPattern(blocks: BlockChi[], hasRed: boolean): BlockChi[] {
    if (blocks.length == 0) return [];
    if (!hasRed) return [];
    const filtered = blocks.filter(
      (b) => b.tiles[1].n == 5 || b.tiles[2].n == 5
    );
    return filtered
      .map((b) => {
        if (b.tiles[1].n == 5) {
          const n = b.clone();
          n.tiles[1].n = 0;
          return n;
        } else if (b.tiles[2].n == 5) {
          const n = b.clone();
          n.tiles[2].n = 0;
          return n;
        }
      })
      .filter((b) => b != null) as BlockChi[];
  }
  doReach(w: Wind): Candidate[] | false {
    const hand = this.hand(w);
    if (hand.reached) return false;
    if (!hand.canReach) return false;
    const s = new ShantenCalculator(hand).calc();
    if (s > 0) return false;
    const r = Efficiency.calcCandidates(hand, hand.hands);
    return r;
  }
  doDiscard(w: Wind, called?: BlockChi): Tile[] {
    if (this.hand(w).reached) return [this.hand(w).drawn!];
    const hand = this.hand(w).hands;
    if (called == null) return hand;

    const tiles = this.cannotDiscardTile(called);
    const ret = hand.filter((v) => !tiles.some((t) => v.equals(t, true)));
    assert(
      ret.length > 0,
      `no tiles to discard. hand: ${this.hand(
        w
      )}, suji: ${tiles}, block-chi: ${called}`
    );
    return ret;
  }
  cannotDiscardTile(called: BlockChi) {
    let h = called.tiles[0].n;
    let h1 = called.tiles[1].n;
    const k = called.tiles[0].k;
    if (h == 0) h = 5;
    if (h1 == 0) h1 = 5;
    // -423, -645
    if (h - 2 == h1) return [new Tile(k, h - 3), new Tile(k, h)];
    // -123, -789
    if (h + 1 == h1) return [new Tile(k, h + 3), new Tile(k, h)];
    return [];
  }
  doAnKan(w: Wind): BlockAnKan[] | false {
    const hand = this.hand(w);
    const blocks: BlockAnKan[] = [];
    if (hand.reached) return false; // FIXME 待ち変更がなければできる
    for (let k of Object.values(KIND)) {
      for (let n = 1; n < hand.getArrayLen(k); n++) {
        if (hand.get(k, n) == 4) {
          const tiles = [
            new Tile(k, n),
            new Tile(k, n),
            new Tile(k, n),
            new Tile(k, n),
          ];
          if (k != KIND.Z && n == 5) tiles[0].n = 0;
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
    for (let c of called) {
      const pick = c.tiles[0];
      if (hand.get(pick.k, pick.n) == 1) {
        const cb = c.clone();
        cb.tiles.push(new Tile(pick.k, pick.n, [OPERATOR.HORIZONTAL])); // FIXME position of horizontal
        if (pick.n == 5 && hand.get(pick.k, 0) == 1) cb.tiles[3].n == 0;
        blocks.push(new BlockShoKan(cb.tiles));
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
  doDaiKan(w: Wind, whoDiscarded: Wind, t: Tile): BlockDaiKan | false {
    const hand = this.hand(w);
    if (hand.reached) return false;
    if (w == whoDiscarded) return false;
    const fake = t.clone().remove(OPERATOR.HORIZONTAL);
    if (fake.isNum() && fake.n == 0) fake.n = 5;
    if (hand.get(fake.k, fake.n) != 3) return false;
    const b = new BlockDaiKan([
      fake.clone(),
      fake.clone(),
      fake.clone(),
      fake.clone(),
    ]);

    let idx = Math.abs(Number(w[0]) - Number(whoDiscarded[0]));
    if (idx == 3) idx = 0;
    if (idx == 1) idx = 3;
    b.tiles[idx] = t.clone().add(OPERATOR.HORIZONTAL);
    if (fake.isNum() && fake.n == 5 && t.n == 5) b.tiles[(idx % 3) + 1].n = 0;
    assert(
      b.tiles.filter((t) => t.has(OPERATOR.HORIZONTAL)).length == 1,
      `h op ${b.toString()}`
    );
    return b;
  }
  canDrawnGame(w: Wind) {
    if (this.river.discards(w).length != 0) return false;
    const h = this.hand(w);
    let num =
      h.get(KIND.M, 1) +
      h.get(KIND.M, 9) +
      h.get(KIND.S, 1) +
      h.get(KIND.S, 9) +
      h.get(KIND.P, 1) +
      h.get(KIND.P, 9);
    for (let i = 0; i < h.getArrayLen(KIND.Z); i++) num += h.get(KIND.Z, i);
    return num >= 9;
  }
  initialHands() {
    const m = createWindMap("");
    for (let i = 0; i < 3; i++) {
      for (let w of Object.values(WIND)) {
        for (let j = 0; j < 4; j++) {
          m[w] += this.wall.draw().toString();
        }
      }
    }
    for (let w of Object.values(WIND)) m[w] += this.wall.draw().toString();
    return m;
  }
}

export abstract class BaseActor {
  id: string;
  river = new River();
  placeManager = new PlaceManager({}); // empty for init
  scoreManager = new ScoreManager({}); // empty for init
  hands = createWindMap(new Hand("")); // empty for init
  counter = new Counter();
  doras: Tile[] = []; // empty for init
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
        break;
      case "DISTRIBUTE":
        // reset
        this.counter.reset();

        this.setHands(e);
        this.placeManager = new PlaceManager(structuredClone(e.places), {
          round: structuredClone(e.round),
          sticks: structuredClone(e.sticks),
        });
        this.scoreManager = new ScoreManager(structuredClone(e.scores));
        this.doras = [e.dora];

        this.counter.dec(e.dora);
        for (let w of Object.values(WIND)) {
          if (w != e.wind) continue;
          this.counter.dec(...this.hand(w).hands);
        }
        break;
      case "DRAW":
        this.hands[e.iam].draw(e.tile);
        this.counter.dec(e.tile);
        break;
      case "DISCARD":
        this.river.discard(e.tile, e.iam);
        this.hands[e.iam].discard(e.tile);
        if (e.iam != e.wind) this.counter.dec(e.tile); // own tile is recorded by DRAW event
        break;
      case "PON":
      case "CHI":
      case "DAI_KAN":
        this.hands[e.iam].call(e.block);
        this.river.markCalled();
        if (e.iam != e.wind)
          this.counter.dec(
            ...e.block.tiles.filter((t) => !t.has(OPERATOR.HORIZONTAL))
          );
        break;
      case "SHO_KAN":
      case "AN_KAN":
        this.hands[e.iam].kan(e.block);
        if (e.iam != e.wind)
          this.counter.dec(
            ...e.block.tiles.filter((t) => !t.has(OPERATOR.HORIZONTAL))
          );
        break;
      case "REACH":
        const pid = this.placeManager.playerID(e.iam);
        this.hands[e.iam].reach();
        this.scoreManager.reach(pid);
        this.placeManager.incrementReachStick();

        // Note: discarded tile is handled by discard event
        // this.hands[e.iam].discard(e.tile);
        // this.river.discard(e.tile, e.iam);
        break;
      case "NEW_DORA":
        this.doras.push(e.tile);
        this.counter.dec(e.tile);
        break;
      case "TSUMO":
        break;
      case "RON":
        if (e.pushBackReachStick) {
          const w = e.tileInfo.wind;
          const id = this.placeManager.playerID(w);
          this.scoreManager.restoreReachStick(id);
          this.placeManager.decrementReachStick();
        }
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
            this.scoreManager.update(e.results, pm);
            this.placeManager.incrementDeadStick();
            if (!e.shouldContinue) this.placeManager.nextRound();
            break;
          }
          case "WIN_GAME": {
            const pm = this.placeManager.playerMap;
            this.scoreManager.update(e.results, pm);
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
    this.hands = createWindMap(new Hand("_____________"));
  }
  setHands(e: DistributeEvent): void {
    this.hands[e.wind] = new Hand(e.hands[e.wind]);
    this.counter.disable = true;
  }
  handleEvent(e: PlayerEvent): void {
    super.handleEvent(e);

    switch (e.type) {
      case "DISTRIBUTE":
        let ready = true;
        for (let w of Object.values(WIND))
          ready &&= this.hand(w).get(KIND.BACK, 0) == 0;
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
            this.placeManager.playerID(w),
            `init hand: ${this.hand(w).toString()}`
          );
        break;
      case "DRAW":
        console.debug(
          this.placeManager.playerID(e.iam),
          `draw: ${this.hand(e.iam).drawn}`,
          `hand: ${this.hand(e.iam).toString()}`
        );
        break;
      case "DISCARD":
        console.debug(
          this.placeManager.playerID(e.iam),
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
          this.placeManager.playerID(e.iam),
          `call: ${e.block.toString()}`,
          `hand: ${this.hand(e.iam).toString()}`
        );
        break;
      case "REACH":
        console.debug(
          this.placeManager.playerID(e.iam),
          `reach: ${this.hand(e.iam).toString()}`,
          `tile: ${e.tile}`
        );
        break;
      case "TSUMO":
      case "RON":
        console.debug(
          this.placeManager.playerID(e.iam),
          `ron/tsumo: ${JSON.stringify(e.ret, null, 2)}`,
          `hand: ${this.hand(e.iam).toString()}`
        );
        break;
      case "END_GAME":
        for (let w of Object.values(WIND)) {
          console.debug(
            this.placeManager.playerID(w),
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

export function replaceTileBlock(obj: any): void {
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const propValue = obj[key];
      if (
        typeof propValue === "object" &&
        propValue !== null &&
        "k" in propValue &&
        "n" in propValue &&
        "ops" in propValue
      ) {
        obj[key] = new Tile(propValue.k, propValue.n, propValue.ops);
      } else if (
        typeof propValue === "object" &&
        propValue != null &&
        "tiles" in propValue &&
        "type" in propValue
      ) {
        obj[key] = blockWrapper(
          propValue.tiles.map((t: Tile) => new Tile(t.k, t.n, t.ops)),
          propValue.type
        );
      } else if (Array.isArray(propValue)) {
        for (let i = 0; i < propValue.length; i++) {
          const v = propValue[i];
          if (
            typeof v === "object" &&
            v !== null &&
            "k" in v &&
            "n" in v &&
            "ops" in v
          )
            propValue[i] = new Tile(v.k, v.n, v.ops);
          else if (
            typeof v === "object" &&
            v != null &&
            "tiles" in v &&
            "type" in v
          )
            propValue[i] = blockWrapper(
              v.tiles.map((t: Tile) => new Tile(t.k, t.n, t.ops)),
              v.type
            );
          else replaceTileBlock(propValue[i]);
        }
      } else if (typeof propValue === "object") {
        replaceTileBlock(propValue);
      }
    }
  }
}
