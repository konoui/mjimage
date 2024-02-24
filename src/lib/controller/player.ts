import assert from "assert";
import {
  BoardParams,
  Hand,
  ShantenCalculator,
  TileCalculator,
} from "../calculator";
import { KIND, OPERATOR, Wind, Round } from "../constants";
import {
  BlockAnKan,
  BlockChi,
  BlockDaiKan,
  BlockPon,
  BlockShoKan,
  Tile,
} from "../parser";
import { DoubleCalculator, WinResult } from "../calculator";
import { createControllerMachine } from "./state-machine";
import { createActor } from "xstate";
import {
  ChoiceAfterDiscardedEvent,
  PlayerEvent,
  ChoiceAfterDrawnEvent,
  prioritizeDiscardedEvents,
  prioritizeDrawnEvents,
  ChoiceForChanKan,
} from "./events";
import { Wall, WallProps } from "./wall";
import { River } from "./river";
import { PlaceManager, ScoreManager, nextWind, shuffle } from "./managers";

export class Controller {
  wall: Wall;
  river: River;
  private players: { [key: string]: Player } = {};
  playerIDs: string[];
  placeManager: PlaceManager;
  scoreManager: ScoreManager;
  actor = createActor(createControllerMachine(this));
  mailBox: { [id: string]: PlayerEvent[] };
  histories: {
    round: Round;
    scores: { [key in string]: number };
    players: { [key in string]: Wind };
    sticks: { reach: number; dead: number };
    wall: WallProps;
    choiceEvents: { [id: string]: PlayerEvent[] };
  }[] = [];
  constructor(wall: Wall, river: River, params?: { fixedOrder: boolean }) {
    this.wall = wall;
    this.river = river;
    this.mailBox = {};

    this.playerIDs = ["player-1", "player-2", "player-3", "player-4"];

    const shuffled = params?.fixedOrder
      ? this.playerIDs.concat()
      : shuffle(this.playerIDs.concat());

    this.placeManager = new PlaceManager({
      [shuffled[0]]: "1w",
      [shuffled[1]]: "2w",
      [shuffled[2]]: "3w",
      [shuffled[3]]: "4w",
    });

    const initial = Object.fromEntries(this.playerIDs.map((i) => [i, 25000]));
    this.scoreManager = new ScoreManager(initial);
    const client = new SyncReplyClient(
      (evenId: string, event: PlayerEvent) => this.enqueue(evenId, event) // bind this
    );

    // init players and hands
    for (let id of this.playerIDs) this.players[id] = new Player(id, client);
    this.initHands();
  }
  player(w: Wind) {
    const id = this.placeManager.playerID(w);
    return this.players[id];
  }
  boardParams(w: Wind): BoardParams {
    const p = this.player(w);
    return {
      dora: this.wall.doras,
      round: this.placeManager.round,
      myWind: w,
      sticks: this.placeManager.sticks,
      blindDora: p.hand.reached ? this.wall.blindDoras : undefined, // FIXME blind doras are clear when game ended
      reached: !p.hand.reached
        ? undefined
        : this.river.discards(w).length != 0
        ? 1
        : 2,
    };
  }
  // this method will called by player client to sync
  enqueue(eventID: string, event: PlayerEvent): void {
    if (this.mailBox[eventID] == null) this.mailBox[eventID] = [];
    this.mailBox[eventID].push(event);
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
        `num of event: got: ${wind.length}, want: ${events.length}`
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
          assert(e.choices.RON != 0, "ron choice is none");
          this.actor.send({
            type: selected.type,
            iam: e.wind,
            ret: e.choices.RON,
            tileInfo: e.tileInfo,
          });
          break;
        case "DAI_KAN":
          assert(e.choices.DAI_KAN != 0, "daikan choice is none");
          this.actor.send({
            type: selected.type,
            iam: e.wind,
            block: e.choices.DAI_KAN,
          });
          break;
        case "CHI":
        case "PON":
          const c = e.choices[selected.type];
          assert(c != 0, `${selected.type} choice is none`);
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
          assert(e.choices.TSUMO != 0, "tsumo choice is none");
          this.actor.send({
            type: selected.type,
            ret: e.choices.TSUMO,
            lastTile: e.tileInfo.tile,
            iam: w,
          });
          break;
        case "REACH":
        case "DISCARD":
          const c = e.choices[selected.type];
          assert(c != 0, `${selected.type} choice is none`);
          this.actor.send({
            type: selected.type,
            tile: c[0].remove(OPERATOR.TSUMO),
            iam: w,
          });
          break;
        case "AN_KAN":
        case "SHO_KAN":
          const choices = e.choices[selected.type];
          assert(choices != 0, `${selected.type} choice is none`);
          this.actor.send({
            type: selected.type,
            block: choices[0],
            iam: w,
          });
      }
    } else if (sample.type == "CHOICE_AFTER_CALLED") {
      assert(
        sample.choices.DISCARD != 0,
        `discard candidate tile is none: ${JSON.stringify(
          sample,
          null,
          2
        )} ${this.player(sample.wind).hand.toString()}`
      );
      const w = sample.wind;
      const t = sample.choices.DISCARD[0];
      assert(t != null, `undefined tile ${this.player(w).hand.toString()}`);
      this.actor.send({ type: "DISCARD", tile: t, iam: w });
    } else if (sample.type == "CHOICE_FOR_CHAN_KAN") {
      const selected = events.filter((e) => {
        const ce = e as ChoiceForChanKan;
        return ce.choices.RON != 0;
      }) as ChoiceForChanKan[];

      if (selected.length == 0) {
        this.actor.send({ type: "" });
        return;
      }
      const e = selected[0];
      assert(e.choices.RON != 0, "ron choice is none");
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
  load(v: string) {
    const h = JSON.parse(v) as (typeof this.histories)[0];
    this.placeManager = new PlaceManager(h.players);
    this.placeManager.round = h.round;
    this.placeManager.sticks = h.sticks;
    this.scoreManager = new ScoreManager(h.scores);
    this.mailBox = h.choiceEvents;
    this.wall = new Wall(h.wall);
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
      this.river = new River();
      this.initHands();
      this.mailBox = {};
      this.actor = createActor(createControllerMachine(this));

      if (this.placeManager.is("3w1")) break;
    }
  }
  doWin(
    w: Wind,
    t: Tile | null | undefined,
    params?: {
      quadWin?: boolean;
      replacementWin?: boolean;
      oneShot?: boolean;
      whoDiscarded?: Wind;
    }
  ): WinResult | 0 {
    if (t == null) return 0;
    let hand = this.player(w).hand;
    const env = this.boardParams(w);
    if (hand.drawn == null) {
      if (params == null) throw new Error("should ron but params == null");
      if (params.whoDiscarded == w) return 0;
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
    if (ret == 0) return 0;
    if (ret.points.length == 0) return 0;
    return ret;
  }
  doPon(w: Wind, whoDiscarded: Wind, t?: Tile): BlockPon[] | 0 {
    if (t == null) return 0;
    if (w == whoDiscarded) return 0;
    const p = this.player(w);
    if (p.hand.reached) return 0;
    if (p.hand.hands.length < 3) return 0;

    const fake = t.clone().remove(OPERATOR.HORIZONTAL);
    if (t.isNum() && t.n == 0) fake.n = 5;
    if (p.hand.get(t.k, fake.n) < 2) return 0;

    const blocks: BlockPon[] = [];
    let idx = Math.abs(Number(w[0]) - Number(whoDiscarded[0]));
    if (idx == 3) idx = 0;
    if (idx == 2) idx = 1;
    if (idx == 1) idx = 2;

    const b = new BlockPon([fake.clone(), fake.clone(), fake.clone()]);
    b.tiles[idx] = t.clone().add(OPERATOR.HORIZONTAL);
    if (t.isNum() && fake.n == 5 && p.hand.get(t.k, 0) > 0)
      b.tiles[(idx % 2) + 1].n = 0;
    blocks.push(b);

    if (t.isNum() && t.n == 5 && p.hand.get(t.k, fake.n) == 3) {
      const red = b.clone();
      red.tiles[(idx % 2) + 1].n = 5;
      blocks.push(red);
    }

    return blocks;
  }
  doChi(w: Wind, whoDiscarded: Wind, t?: Tile): BlockChi[] | 0 {
    if (t == null) return 0;
    if (!t.isNum()) return 0;
    if (nextWind(whoDiscarded) != w) return 0;

    const fake = t.clone();
    if (fake.n == 0) fake.n = 5;

    const p = this.player(w);
    if (p.hand.reached) return 0;
    if (p.hand.hands.length < 3) return 0;
    const blocks: BlockChi[] = [];
    const lower =
      fake.n - 2 >= 1 &&
      p.hand.get(t.k, fake.n - 2) > 0 &&
      p.hand.get(t.k, fake.n - 1) > 0;
    if (lower)
      blocks.push(
        new BlockChi([
          t.clone().add(OPERATOR.HORIZONTAL),
          new Tile(t.k, fake.n - 1),
          new Tile(t.k, fake.n - 2),
        ])
      );
    const upper =
      fake.n + 2 <= 9 &&
      p.hand.get(t.k, fake.n + 1) > 0 &&
      p.hand.get(t.k, fake.n + 2) > 0;
    if (upper)
      blocks.push(
        new BlockChi([
          t.clone().add(OPERATOR.HORIZONTAL),
          new Tile(t.k, fake.n + 1),
          new Tile(t.k, fake.n + 2),
        ])
      );
    const kan =
      fake.n - 1 >= 1 &&
      fake.n + 1 <= 9 &&
      p.hand.get(t.k, fake.n - 1) > 0 &&
      p.hand.get(t.k, fake.n + 1) > 0;
    if (kan)
      blocks.push(
        new BlockChi([
          t.clone().add(OPERATOR.HORIZONTAL),
          new Tile(t.k, fake.n - 1),
          new Tile(t.k, fake.n + 1),
        ])
      );

    // 1. check whether can-chi or not with ignoredRed pattern
    // 2. get red patterns if having red
    // 3. if not having normal 5, return only red pattern, else if concat red and normal patterns
    if (blocks.length == 0) return 0;
    const hasRed = p.hand.get(t.k, 0) > 0;
    const reds = this.redPattern(blocks, hasRed);
    if (reds.length > 0 && p.hand.get(t.k, 5) == 1) return reds;
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
  doReach(w: Wind): Tile[] | 0 {
    const p = this.player(w);
    if (p.hand.reached) return 0;
    if (!p.hand.canReach) return 0;
    const s = new ShantenCalculator(p.hand).calc();
    if (s > 0) return 0;
    // FIXME all candidates
    const r = p.choiceForDiscard(p.hand.hands);
    return [r.tile];
  }
  doDiscard(w: Wind): Tile[] | 0 {
    if (this.player(w).hand.reached) return [this.player(w).hand.drawn!];
    return this.player(w).hand.hands;
  }
  doAnKan(w: Wind): BlockAnKan[] | 0 {
    const p = this.player(w);
    const blocks: BlockAnKan[] = [];
    if (p.hand.reached) return 0; // FIXME 待ち変更がなければできる
    for (let k of Object.values(KIND)) {
      for (let n = 1; n < p.hand.getArrayLen(k); n++) {
        if (p.hand.get(k, n) == 4) {
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
    if (blocks.length == 0) return 0;
    for (let b of blocks)
      assert(
        b.tiles.filter((t) => t.has(OPERATOR.HORIZONTAL)).length == 0,
        `h op ${b.toString()}`
      );
    return blocks;
  }
  doShoKan(w: Wind): BlockShoKan[] | 0 {
    const p = this.player(w);
    if (p.hand.reached) return 0;
    const called = p.hand.called.filter((b) => b instanceof BlockPon);
    if (called.length == 0) return 0;
    const blocks: BlockShoKan[] = [];
    for (let c of called) {
      const pick = c.tiles[0];
      if (p.hand.get(pick.k, pick.n) == 1) {
        const cb = c.clone();
        cb.tiles.push(new Tile(pick.k, pick.n, [OPERATOR.HORIZONTAL])); // FIXME position of horizontal
        if (pick.n == 5 && p.hand.get(pick.k, 0) == 1) cb.tiles[3].n == 0;
        blocks.push(new BlockShoKan(cb.tiles));
      }
    }
    if (blocks.length == 0) return 0;
    for (let b of blocks)
      assert(
        b.tiles.filter((t) => t.has(OPERATOR.HORIZONTAL)).length == 2,
        `h op ${b.toString()}`
      );

    return blocks;
  }
  doDaiKan(w: Wind, whoDiscarded: Wind, t: Tile): BlockDaiKan | 0 {
    const p = this.player(w);
    if (p.hand.reached) return 0;
    if (w == whoDiscarded) return 0;
    const fake = t.clone().remove(OPERATOR.HORIZONTAL);
    if (fake.isNum() && fake.n == 0) fake.n = 5;
    if (p.hand.get(fake.k, fake.n) != 3) return 0;
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
  private initHands() {
    const m: [Tile[], Tile[], Tile[], Tile[]] = [[], [], [], []];
    for (let i = 0; i < 3; i++) {
      for (let playerID = 0; playerID < 4; playerID++) {
        for (let j = 0; j < 4; j++) {
          m[playerID].push(this.wall.draw());
        }
      }
    }
    for (let i = 0; i < 4; i++) m[i].push(this.wall.draw());

    let idx = 0;
    for (let id in this.players) {
      this.players[id].newHand(m[idx].toString());
      idx++;
    }
  }
}

// Player reply event to controller by the method
interface ReplyClient {
  reply(eventID: string, e: PlayerEvent): void;
}

class SyncReplyClient implements ReplyClient {
  fn: (eventID: string, e: any) => void;
  constructor(fn: (eventID: string, e: any) => void) {
    this.fn = fn;
  }
  reply(eventID: string, e: any) {
    this.fn(eventID, e);
  }
}

export class Player {
  id: string;
  hand: Hand = new Hand(""); // empty hand for init
  client: ReplyClient;
  constructor(playerID: string, client: ReplyClient) {
    this.client = client;
    this.id = playerID;
  }
  newHand(input: string) {
    this.hand = new Hand(input);
  }
  enqueue(e: PlayerEvent) {
    switch (e.type) {
      case "CHOICE_AFTER_CALLED":
        this.client.reply(e.id, e);
        break;
      case "CHOICE_AFTER_DISCARDED":
        this.client.reply(e.id, e);
        break;
      case "CHOICE_AFTER_DRAWN":
        if (e.choices.DISCARD != 0) {
          const ret = this.choiceForDiscard(e.choices.DISCARD);
          e.choices.DISCARD = [ret.tile];
        }
        this.client.reply(e.id, e);
        break;
      case "CHOICE_FOR_CHAN_KAN":
        this.client.reply(e.id, e);
        break;
      default:
      // this.client.reply(e.id, e);
    }
  }
  choiceForDiscard(choices: Tile[]) {
    assert(choices.length > 0, "choices to discard is zero");
    let ret: { shanten: number; nCandidates: number; tile: Tile } = {
      shanten: Number.POSITIVE_INFINITY,
      nCandidates: 0,
      tile: choices[0],
    };
    for (let t of choices) {
      const tiles = this.hand.dec([t]);
      const c = this.candidateTiles();
      this.hand.inc(tiles);
      if (c.shanten < ret.shanten) {
        ret = {
          shanten: c.shanten,
          nCandidates: c.candidates.length,
          tile: t,
        };
      } else if (
        c.shanten == ret.shanten &&
        ret.nCandidates < c.candidates.length
      ) {
        ret.nCandidates = c.candidates.length;
        ret.tile = t;
      }
    }
    return ret;
  }
  private candidateTiles() {
    let r = Number.POSITIVE_INFINITY;
    let candidates: Tile[] = [];

    for (let k of Object.values(KIND)) {
      if (k == KIND.BACK) continue;
      for (let n = 1; n < this.hand.getArrayLen(k); n++) {
        if (this.hand.get(k, n) >= 4) continue;
        const t = new Tile(k, n);
        const tiles = this.hand.inc([t]);
        const s = new ShantenCalculator(this.hand).calc();
        this.hand.dec(tiles);

        if (s < r) {
          r = s;
          candidates = [t];
        } else if (s == r) candidates.push(t);
      }
    }
    return {
      shanten: r,
      candidates: candidates,
    };
  }
}
