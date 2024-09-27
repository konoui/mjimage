import { createActor } from "xstate";
import { assert } from "../myassert";
import { TYPE, OPERATOR, Wind, Round, WIND, ROUND } from "../core/";
import {
  BoardContext,
  Hand,
  ShantenCalculator,
  BlockCalculator,
  DoubleCalculator,
  WinResult,
  Efficiency,
  Candidate,
  createWindMap,
  deserializeWinResult,
} from "../calculator";
import {
  BlockAnKan,
  BlockChi,
  BlockDaiKan,
  Block,
  BlockPon,
  BlockShoKan,
  Tile,
  isNum0,
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
} from "./events";
import {
  Wall,
  WallProps,
  River,
  PlaceManager,
  ScoreManager,
  nextWind,
  shuffle,
  Counter,
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
      [shuffled[0]]: WIND.E,
      [shuffled[1]]: WIND.S,
      [shuffled[2]]: WIND.W,
      [shuffled[3]]: WIND.N,
    });
  }
  boardParams(w: Wind): BoardContext {
    const hand = this.hand(w);
    return {
      doraMarkers: this.observer.doraMarkers,
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
            block: Block.from(e.choices.DAI_KAN),
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
            block: Block.from(c[0]),
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
            type: selected.type,
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
            block: BlockAnKan.from(choices[0]),
            iam: w,
          });
          break;
        }
        case "SHO_KAN": {
          const choices = e.choices[selected.type];
          assert(choices, `${selected.type} choice is none`);
          this.actor.send({
            type: selected.type,
            block: Block.from(choices[0]),
            iam: w,
          });
          break;
        }
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
      const t = Tile.from(sample.choices.DISCARD[0]);
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
        ret: deserializeWinResult(e.choices.RON),
        quadWin: true,
        targetInfo: {
          wind: e.callerInfo.wind,
          tile: Tile.from(e.callerInfo.tile),
        },
      });
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

    let fake = t.clone({ remove: OPERATOR.HORIZONTAL });
    if (isNum0(t)) fake = fake.clone({ n: 5 });
    if (hand.get(t.t, fake.n) < 2) return false;

    const blocks: BlockPon[] = [];
    let idx = Math.abs(Number(w[0]) - Number(whoDiscarded[0]));
    if (idx == 3) idx = 0;
    if (idx == 2) idx = 1;
    if (idx == 1) idx = 2;

    let b = new BlockPon([fake, fake, fake]);
    b = b.clone({
      replace: { idx, tile: t.clone({ add: OPERATOR.HORIZONTAL }) },
    });
    const ridx = (idx % 2) + 1;
    const rt = b.tiles[ridx];
    if (isNum5(t) && hand.get(t.t, 0) > 0)
      b = b.clone({ replace: { idx: ridx, tile: rt.clone({ n: 0 }) } });
    blocks.push(b);

    if (isNum5(t) && hand.get(t.t, fake.n) == 3) {
      const red = b.clone({ replace: { idx: ridx, tile: rt.clone({ n: 5 }) } });
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

    let fake = t;
    if (isNum0(fake)) fake = t.clone({ n: 5 });

    const blocks: BlockChi[] = [];
    const left =
      fake.n - 2 >= 1 &&
      hand.get(t.t, fake.n - 2) > 0 &&
      hand.get(t.t, fake.n - 1) > 0;
    const cloned = t.clone({
      add: OPERATOR.HORIZONTAL,
      remove: OPERATOR.TSUMO,
    });
    if (left)
      blocks.push(
        new BlockChi([
          cloned,
          new Tile(t.t, fake.n - 1),
          new Tile(t.t, fake.n - 2),
        ])
      );
    const right =
      fake.n + 2 <= 9 &&
      hand.get(t.t, fake.n + 1) > 0 &&
      hand.get(t.t, fake.n + 2) > 0;
    if (right)
      blocks.push(
        new BlockChi([
          cloned,
          new Tile(t.t, fake.n + 1),
          new Tile(t.t, fake.n + 2),
        ])
      );
    const center =
      fake.n - 1 >= 1 &&
      fake.n + 1 <= 9 &&
      hand.get(t.t, fake.n - 1) > 0 &&
      hand.get(t.t, fake.n + 1) > 0;
    if (center)
      blocks.push(
        new BlockChi([
          cloned,
          new Tile(t.t, fake.n - 1),
          new Tile(t.t, fake.n + 1),
        ])
      );

    if (blocks.length == 0) return false;

    // 手配が4枚でのチーは、鳴いた後の手配が全て食い替え対象だとできない
    if (hand.hands.length == 4) {
      const b = blocks[0];
      const tiles = this.cannotDiscardTile(blocks[0]);
      const ltiles = hand.dec([b.tiles[1], b.tiles[2]]);
      const cannotCall =
        tiles.reduce((acc: number, e: Tile) => acc + hand.get(e.t, e.n), 0) ==
        2;
      hand.inc(ltiles);
      if (cannotCall) return false;
    }

    // 1. check whether can-chi or not with ignoredRed pattern
    // 2. get red patterns if having red
    // 3. if not having normal 5, return only red pattern, else if concat red and normal patterns
    const hasRed = hand.get(t.t, 0) > 0;
    const reds = this.redPattern(blocks, hasRed);
    if (reds.length > 0 && hand.get(t.t, 5) == 1) return reds;
    return blocks.concat(reds);
  }
  redPattern(blocks: BlockChi[], hasRed: boolean): BlockChi[] {
    if (blocks.length == 0) return [];
    if (!hasRed) return [];
    const filtered = blocks.filter(
      (b) => isNum5(b.tiles[1]) || isNum5(b.tiles[2])
    );
    return filtered
      .map((b) => {
        if (isNum5(b.tiles[1])) {
          const rt = b.tiles[1].clone({ n: 0 });
          const n = b.clone({ replace: { idx: 1, tile: rt } });
          return n;
        } else if (isNum5(b.tiles[2])) {
          const rt = b.tiles[2].clone({ n: 0 });
          const n = b.clone({ replace: { idx: 2, tile: rt } });
          return n;
        }
      })
      .filter((b) => b != null) as BlockChi[];
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
      return hand.filter((v) => !v.equals(called.tiles[0], true));
    }
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
    const t = called.tiles[0].t;
    if (h == 0) h = 5;
    if (h1 == 0) h1 = 5;
    // -423, -645
    if (h - 2 == h1) return [new Tile(t, h - 3), new Tile(t, h)];
    // -123, -789
    if (h + 1 == h1) return [new Tile(t, h + 3), new Tile(t, h)];
    return [];
  }
  doAnKan(w: Wind): BlockAnKan[] | false {
    const hand = this.hand(w);
    const blocks: BlockAnKan[] = [];
    if (hand.reached) return false; // FIXME 待ち変更がなければできる
    for (let t of Object.values(TYPE)) {
      for (let n = 1; n < hand.getArrayLen(t); n++) {
        if (hand.get(t, n) == 4) {
          const tiles = [
            new Tile(t, n),
            new Tile(t, n),
            new Tile(t, n),
            new Tile(t, n),
          ];
          // NOTE： red にする index は関係ない
          if (t != TYPE.Z && n == 5) tiles[0] = tiles[0].clone({ n: 0 });
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
      const pick = cb.tiles[0];
      if (hand.get(pick.t, pick.n) == 1) {
        // FIXME 追加の HORIZONTAL は最後でいいのか
        const tiles = [
          ...cb.tiles,
          new Tile(pick.t, pick.n, [OPERATOR.HORIZONTAL]),
        ];
        if (isNum5(pick) && hand.get(pick.t, 0) == 1) tiles[3].n == 0; // FIXME
        blocks.push(new BlockShoKan(tiles));
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
    let fake = t.clone({ remove: OPERATOR.HORIZONTAL });
    if (isNum0(fake)) fake = fake.clone({ n: 5 });
    if (hand.get(fake.t, fake.n) != 3) return false;
    let base = new BlockDaiKan([fake, fake, fake, fake]);

    let idx = Math.abs(Number(w[0]) - Number(whoDiscarded[0]));
    if (idx == 3) idx = 0;
    if (idx == 1) idx = 3;
    let b = base.clone({
      replace: { idx, tile: t.clone({ add: OPERATOR.HORIZONTAL }) },
    });
    // 捨て牌が 5 なら鳴いた位置からずらして red にする
    // TODO t.n == 0 の場合、horizontal tile を 0 にする必要がありそう。
    if (isNum5(fake) && isNum5(t)) {
      const ridx = (idx % 3) + 1;
      const rt = b.tiles[ridx].clone({ n: 0 });
      b = b.clone({ replace: { idx: ridx, tile: rt } });
    }
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
      h.get(TYPE.M, 1) +
      h.get(TYPE.M, 9) +
      h.get(TYPE.S, 1) +
      h.get(TYPE.S, 9) +
      h.get(TYPE.P, 1) +
      h.get(TYPE.P, 9);
    for (let i = 0; i < h.getArrayLen(TYPE.Z); i++) num += h.get(TYPE.Z, i);
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
  river = new River();
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
    try {
      switch (e.type) {
        case "CHOICE_AFTER_CALLED":
        case "CHOICE_AFTER_DISCARDED":
        case "CHOICE_AFTER_DRAWN":
        case "CHOICE_FOR_CHAN_KAN":
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
          const block = Block.from(e.block);
          this.hands[e.iam].call(block);
          this.river.markCalled();
          if (e.iam != e.wind)
            this.counter.dec(
              ...block.tiles.filter((t) => !t.has(OPERATOR.HORIZONTAL))
            );
          break;
        }
        case "SHO_KAN": {
          const block = Block.from(e.block);
          this.hands[e.iam].kan(block);
          if (e.iam != e.wind)
            this.counter.dec(
              block.tiles.filter((t) => t.has(OPERATOR.HORIZONTAL))[0]
            );
          break;
        }
        case "AN_KAN": {
          const block = Block.from(e.block);
          this.hands[e.iam].kan(block);
          if (e.iam != e.wind)
            this.counter.dec(
              ...block.tiles.filter((t) => !t.has(OPERATOR.HORIZONTAL))
            );
          break;
        }
        case "REACH":
          const pid = this.placeManager.playerID(e.iam);
          this.hands[e.iam].reach();
          this.scoreManager.reach(pid);
          this.placeManager.incrementReachStick();

          // Note: discarded tile is handled by discard event
          // this.hands[e.iam].discard(e.tile);
          // this.river.discard(e.tile, e.iam);
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
          if (e.pushBackReachStick) {
            const w = e.victimInfo.wind;
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
    } catch (error) {
      throw new Error(`${this.id} ${e.type} ${error}`);
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
