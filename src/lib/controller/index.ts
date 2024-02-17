import assert from "assert";
import {
  BoardParams,
  Hand,
  ShantenCalculator,
  TileCalculator,
} from "../calculator";
import { KIND, OPERATOR, Wind, Round, ROUND_MAP } from "../constants";
import {
  Block,
  BlockAnKan,
  BlockChi,
  BlockDaiKan,
  BlockPon,
  BlockShoKan,
  Parser,
  Tile,
} from "../parser";
import { DoubleCalculator, WinResult } from "../calculator";
import {
  createControllerMachine,
  nextWind,
  prevWind,
  createWindMap,
} from "./state-machine";
import { createActor } from "xstate";
import {
  ChoiceAfterDiscardedEvent,
  PlayerEvent,
  ChoiceAfterDrawnEvent,
  prioritizeDiscardedEvents,
  prioritizeDrawnEvents,
  ChoiceForChanKan,
} from "./events";

class ScoreManager {
  private m: { [key: string]: number } = {};
  private tmp: { [key: string]: number } = {};
  constructor(playerIDs: string[]) {
    this.init(playerIDs);
  }
  init(ids: string[]) {
    const base = 25000;
    for (let id of ids) {
      this.m[id] = base;
    }
  }
  get summary() {
    return this.m;
  }
  reach(id: string) {
    const base = 1000;
    this.m[id] -= base;
    this.tmp[id] = 1;
    // FIXME register callback
    // if 流局 then tmp => sticks
    // if 立直直後のロン then tmp => back to the reached user
  }
  update(
    result: {
      "1w": number;
      "2w": number;
      "3w": number;
      "4w": number;
    },
    windMap: { [key: string]: Wind }
  ) {
    for (let id in windMap) {
      const w = windMap[id];
      const point = result[w];
      this.m[id] += point;
    }
  }
}

class PlaceManager {
  private pToW: { [key: string]: Wind } = {};
  private wToP = createWindMap("");
  round: Round;
  sticks: { reach: number; dead: number } = { reach: 0, dead: 0 };
  constructor(playerIDs: string[], init?: Wind) {
    this.round = "1w1";
    const w = init == null ? this.randWind() : prevWind(init);
    this.init(playerIDs, w);
  }

  private init(ids: string[], init: Wind) {
    this.pToW = {
      [ids[0]]: init,
      [ids[1]]: nextWind(init),
      [ids[2]]: nextWind(nextWind(init)),
      [ids[3]]: nextWind(nextWind(nextWind(init))),
    };
    this.update();
  }
  private randWind() {
    const n = Math.floor(Math.random() * 4) + 1;
    const w = `${n}w` as Wind;
    return prevWind(w);
  }
  private update() {
    for (let playerID in this.pToW) {
      const next = nextWind(this.pToW[playerID]);
      this.pToW[playerID] = next;
      this.wToP[next] = playerID;
    }
  }
  continueRound() {
    this.sticks.dead++;
  }
  incrementReachStick() {
    this.sticks.reach++;
  }
  incrementRound() {
    const next = PlaceManager.nextRound(this.round);
    this.round = next;
    this.update();
  }
  is(r: Round) {
    return this.round == r;
  }
  wind(id: string) {
    return this.pToW[id];
  }
  playerID(w: Wind) {
    return this.wToP[w];
  }
  get playerMap() {
    return this.pToW;
  }
  static nextRound(r: Round) {
    let w = r.substring(0, 2) as Wind;
    let n = Number(r.substring(2, 3));
    if (n == 4) {
      n = 1;
      w = nextWind(w);
    } else n++;
    return `${w}${n}` as Round;
  }
}

export class Controller {
  wall: Wall;
  river: River;
  private players: { [key: string]: Player } = {};
  playerIDs: string[];
  placeManager: PlaceManager;
  scoreManager: ScoreManager;
  actor = createActor(createControllerMachine(this));
  mailBox: { [id: string]: PlayerEvent[] };
  constructor(wall: Wall, river: River, params?: { initWind: Wind }) {
    this.wall = wall;
    this.river = river;
    this.mailBox = {};

    this.playerIDs = ["player-1", "player-2", "player-3", "player-4"];
    this.placeManager = new PlaceManager(this.playerIDs, params?.initWind);
    this.scoreManager = new ScoreManager(this.playerIDs);
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
    return {
      dora: this.wall.doras,
      round: this.placeManager.round,
      myWind: w,
      sticks: this.placeManager.sticks,
    };
  }
  // this method will called by player client to sync
  enqueue(eventID: string, event: PlayerEvent): void {
    if (this.mailBox[eventID] == null) this.mailBox[eventID] = [];
    this.mailBox[eventID].push(event);
  }
  // TODO event instead of eventID to validate choice here
  pollReplies(eventID: string, winds: Wind[]) {
    const events = this.mailBox[eventID];
    if (events == null) {
      throw new Error(
        `not enqueued ${eventID} at ${this.actor.getSnapshot().value}`
      );
    }
    if (events.length != winds.length) {
      throw new Error(
        `num of event: got: ${winds.length}, want: ${events.length}`
      );
    }
    if (winds.length == 0) {
      console.warn("no events to handle");
      return;
    }
    const sample = events[0];
    if (sample.type == "CHOICE_AFTER_DISCARDED") {
      const selected = prioritizeDiscardedEvents(
        events as ChoiceAfterDiscardedEvent[]
      );
      if (selected.events.length == 0) this.actor.send({ type: "" });
      else {
        const e = selected.events[0];
        if (selected.type == "RON") {
          assert(e.choices.RON != 0, "ron choice is none");
          this.actor.send({
            type: selected.type,
            iam: e.wind,
            ret: e.choices.RON,
            tileInfo: e.tileInfo,
          });
        } else if (selected.type == "PON") {
          assert(e.choices.PON != 0, "pon choice is none");
          assert(
            selected.events.length == 1,
            `found more than one selected: ${JSON.stringify(selected, null, 2)}`
          );
          this.actor.send({
            type: selected.type,
            iam: e.wind,
            block: e.choices.PON[0],
          });
        } else if (selected.type == "CHI") {
          assert(e.choices.CHI != 0, "chi choice is none");
          assert(
            selected.events.length == 1,
            `found more than one selected: ${JSON.stringify(selected, null, 2)}`
          );
          this.actor.send({
            type: selected.type,
            iam: e.wind,
            block: e.choices.CHI[0],
          });
        }
      }
    } else if (sample.type == "CHOICE_AFTER_DRAWN") {
      const selected = prioritizeDrawnEvents(events as ChoiceAfterDrawnEvent[]);
      assert(
        selected.events.length == 1,
        `found more than one selected: ${JSON.stringify(selected, null, 2)}`
      );
      const e = selected.events[0];
      const w = e.wind;
      if (selected.type == "TSUMO") {
        assert(e.choices.TSUMO != 0, "tsumo choice is none");
        this.actor.send({
          type: "TSUMO",
          ret: e.choices.TSUMO,
          lastTile: e.tileInfo.tile,
          iam: w,
        });
      } else if (selected.type == "REACH") {
        assert(e.choices.REACH != 0, "reach choice is none");
        this.actor.send({
          type: "REACH",
          tile: e.choices.REACH[0].remove(OPERATOR.TSUMO),
          iam: w,
        });
      } else if (selected.type == "AN_KAN") {
        assert(e.choices.AN_KAN != 0, "ankan choice is none");
        this.actor.send({
          type: "AN_KAN",
          block: e.choices.AN_KAN[0],
          iam: w,
        });
      } else if (selected.type == "SHO_KAN") {
        assert(e.choices.SHO_KAN != 0, "ankan choice is none");
        this.actor.send({
          type: "SHO_KAN",
          block: e.choices.SHO_KAN[0],
          iam: w,
        });
      } else if (selected.type == "DISCARD") {
        assert(e.choices.DISCARD != 0, "discard choice is none");
        this.actor.send({
          type: "DISCARD",
          tile: e.choices.DISCARD[0].remove(OPERATOR.TSUMO),
          iam: w,
        });
      } else {
        throw new Error(
          `unexpected selected events: ${JSON.stringify(selected, null, 2)}`
        );
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

      if (selected.length == 0) this.actor.send({ type: "" });
      else {
        const e = selected[0];
        assert(e.choices.RON != 0, "ron choice is none");
        console.error(`chankan event ${JSON.stringify(e, null, 2)}`);
        this.actor.send({
          type: "RON",
          iam: e.wind,
          ret: e.choices.RON,
          quadWin: true,
          tileInfo: e.tileInfo,
        });
      }
    }
  }
  start() {
    this.actor.subscribe((snapshot) => {
      console.debug("Value:", snapshot.value);
    });
    this.actor.start();
    const v = this.actor.getSnapshot().status;
    // if (!(v == "done"))
    //   throw new Error(
    //     `unexpected state ${this.actor.getSnapshot().value}(${v})`
    //   );
  }
  startGame() {
    for (;;) {
      console.debug(`start========${this.placeManager.round}=============`);
      this.start();
      const v = this.actor.getSnapshot().value;
      if (v == "drawn_game") this.placeManager.continueRound();
      else if (v == "roned" || v == "tsumo") this.placeManager.incrementRound();
      else throw new Error(`unexpected state ${v}`);

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
    whoDiscarded?: Wind,
    quadWin?: boolean
  ): WinResult | 0 {
    if (t == null) return 0;
    let hand = this.player(w).hand;
    const env = this.boardParams(w);
    if (hand.drawn == null) {
      if (whoDiscarded == w) return 0;
      hand = hand.clone();
      env.ronWind = whoDiscarded;
      env.finalDiscardWin = !this.wall.canDraw;
      hand.inc([t]); // TODO hand.draw looks good but it adds OP.TSUMO
    } else env.finalWallWin = !this.wall.canDraw;
    // if (hand.reached)  FIXME oneshot
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
    if (p.hand.get(t.k, t.n) < 2) return 0;
    const blocks: BlockPon[] = [];
    if (t.n == 5 && p.hand.get(t.k, 0) > 0) {
      blocks.push(
        new BlockPon([
          new Tile(t.k, t.n, [OPERATOR.HORIZONTAL]),
          new Tile(t.k, 0), // red
          new Tile(t.k, t.n),
        ])
      );
      if (p.hand.get(t.k, t.n) > 2) {
        blocks.push(
          new BlockPon([
            new Tile(t.k, t.n, [OPERATOR.HORIZONTAL]),
            new Tile(t.k, t.n),
            new Tile(t.k, t.n),
          ])
        );
      }
      return blocks;
    }
    return [
      new BlockPon([
        new Tile(t.k, t.n, [OPERATOR.HORIZONTAL]),
        new Tile(t.k, t.n),
        new Tile(t.k, t.n),
      ]),
    ];
  }
  doChi(w: Wind, whoDiscarded: Wind, t?: Tile): BlockChi[] | 0 {
    if (t == null) return 0;
    if (t.k == KIND.Z) return 0;
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
    const b: BlockAnKan[] = [];
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
          b.push(new BlockAnKan(tiles));
        }
      }
    }
    return b.length > 0 ? b : 0;
  }
  doShoKan(w: Wind): BlockShoKan[] | 0 {
    const p = this.player(w);
    if (p.hand.reached) return 0;
    const called = p.hand.called.filter((b) => b instanceof BlockPon);
    if (called.length == 0) return 0;
    const b: BlockShoKan[] = [];
    for (let c of called) {
      const pick = c.tiles[0];
      if (p.hand.get(pick.k, pick.n) == 1) {
        const cb = c.clone();
        cb.tiles.push(new Tile(pick.k, pick.n, [OPERATOR.HORIZONTAL]));
        if (pick.n == 5 && p.hand.get(pick.k, 0) == 1) cb.tiles[3].n == 0;
        b.push(new BlockShoKan(cb.tiles));
      }
    }
    return b.length > 0 ? b : 0;
  }
  doDaiKan(w: Wind, whoDiscarded: Wind, t: Tile): BlockDaiKan | 0 {
    const p = this.player(w);
    if (p.hand.reached) return 0;
    if (w == whoDiscarded) return 0;
    const fake = t.clone().remove(OPERATOR.HORIZONTAL);
    if (fake.k != KIND.Z && fake.n == 0) fake.n = 5;
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
    if (fake.k != KIND.Z && fake.n == 5 && t.n == 5)
      b.tiles[(idx % 3) + 1].n = 0;
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
    if (e.type == "CHOICE_AFTER_DISCARDED") {
      this.client.reply(e.id, e);
      return;
    }
    if (e.type == "CHOICE_AFTER_DRAWN") {
      if (e.choices.DISCARD != 0) {
        const ret = this.choiceForDiscard(e.choices.DISCARD);
        e.choices.DISCARD = [ret.tile];
      }
      this.client.reply(e.id, e);
      return;
    }
    if (e.type == "CHOICE_AFTER_CALLED") {
      if (e.choices.DISCARD != 0) {
        const ret = this.choiceForDiscard(e.choices.DISCARD);
        e.choices.DISCARD = [ret.tile];
      }
      this.client.reply(e.id, e);
      return;
    }
    if (e.type == "CHOICE_FOR_CHAN_KAN") {
      this.client.reply(e.id, e);
      return;
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
      const dtiles = this.hand.dec([t]);
      const c = this.candidateTiles();
      this.hand.inc(dtiles);
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
        const itiles = this.hand.inc([t]);
        const s = new ShantenCalculator(this.hand).calc();
        this.hand.dec(itiles);

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

export class Wall {
  private raw = "";
  private drawableWall: Tile[] = [];
  private deadWall: Tile[] = [];
  private replacementWall: Tile[] = [];
  private doraWall: Tile[] = [];
  private blindDoraWall: Tile[] = [];
  constructor(raw?: string) {
    this.init(raw);
  }
  kan() {
    if (this.replacementWall.length == 0)
      throw new Error(`exceeded maximum kan`);
    const t = this.replacementWall.pop()!;
    this.drawableWall.pop();
    return t;
  }
  draw() {
    if (!this.drawableWall) throw new Error("cannot draw any more");
    return this.drawableWall.pop()!;
  }

  get doras() {
    return this.doraWall.slice(0, 4 - this.replacementWall.length);
  }
  get blindDoras() {
    return this.blindDoraWall.slice(0, 4 - this.replacementWall.length);
  }
  get canKan() {
    return this.replacementWall.length > 0;
  }
  get canDraw() {
    return this.drawableWall.length > 0;
  }

  private init(raw?: string) {
    if (raw != null) {
      const blocks = new Parser(raw).parse();
      for (let b of blocks) {
        this.drawableWall.push(...b.tiles);
      }
    } else {
      for (let k of Object.values(KIND)) {
        if (k == KIND.BACK) continue;
        const values =
          k == KIND.Z ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5, 6, 7, 8, 9];
        for (let i = 0; i < 4; i++) {
          for (let n of values) {
            if (i == 3 && n == 5) n = 0;
            this.drawableWall.push(new Tile(k, n));
          }
        }
      }
      this.shuffle(this.drawableWall);
    }

    this.raw = this.drawableWall.map((t) => t.toString()).join();

    for (let i = 0; i < 13; i++) {
      this.deadWall.push(this.drawableWall.pop()!);
    }
    for (let i = 0; i < 4; i++) {
      this.blindDoras.push(this.deadWall.pop()!);
    }
    for (let i = 0; i < 4; i++) {
      this.doras.push(this.deadWall.pop()!);
    }
    for (let i = 0; i < 4; i++) {
      this.replacementWall.push(this.deadWall.pop()!);
    }
  }
  private shuffle(array: Tile[]) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
  export() {
    return this.raw;
  }
}

export class River {
  m: { w: Wind; t: Tile }[] = [];
  constructor() {}
  discard(t: Tile, w: Wind) {
    this.m.push({ w: w, t: t });
  }
  get lastTile() {
    const last = this.m.at(-1);
    assert(
      last != null,
      `lastTile is null(${last}). river: ${JSON.stringify(this.m, null, 2)}`
    );
    return last;
  }
  discards(w: Wind) {
    return this.m.filter((v) => v.w == w);
  }
}
