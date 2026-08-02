import { Actor, createActor } from "xstate";
import { assert } from "../assert";
import {
  TYPE,
  OP,
  Wind,
  Round,
  WIND,
  ROUND,
  HONOR_NUMBERS,
  TERMINAL_NUMBERS,
} from "../core/";
import {
  BoardContext,
  PointCalculator,
  WinResult,
  TileAnalysis,
} from "../calculator";
import {
  BlockAnKan,
  BlockChi,
  BlockDaiKan,
  BlockPon,
  BlockShoKan,
  Tile,
} from "../core";
import { createControllerMachine } from "./state-machine";
import { PlayerEvent, EventHandler, createEventEmitter } from "./events";
import { Wall, IWall } from "./wall";
import { PlaceManager, ScoreManager, shuffle, Rand } from "./managers";
import * as actions from "./actions";
import { Observer } from "./actor";
import { RoundHistory, restoreRound, snapshotRound } from "./history";
import { MailBox, pollReplies } from "./mailbox";
import { consoleLogger, Logger } from "./logger";

// mailBox の型は Controller の公開フィールドに出るので、名前も一緒に出す。
export type { MailBox };

/** 状態機械を動かす actor。局ごとに作り直す。 */
type ControllerActor = Actor<ReturnType<typeof createControllerMachine>>;

export interface PlayerSession {
  id: string;
  handler: EventHandler;
}

export class Controller {
  wall: IWall;
  playerIDs: string[];
  actor: ControllerActor;
  observer: Observer;
  handlers: { [id: string]: EventHandler } = {};
  // TODO 同じイベント ID は同じ特定イベントの配列になるので特定イベント ID の配列の union が良さそう
  mailBox: MailBox = {};
  histories: RoundHistory[] = [];
  debugMode: boolean;
  /** 席順と山のシャッフルに使う乱数。テストで対局を固定するために差し替えられる。 */
  private rand: Rand;
  /** 局ごとに山を作り直す。テストが台本つきの山を使い続けられるように差し替えられる。 */
  private newWall: () => IWall;
  /** 終局する局。 */
  private endRound: Round;
  /** 進行ログの出し先。状態機械と observer もこれを使う。 */
  readonly logger: Logger;

  constructor(
    players: readonly PlayerSession[],
    params?: {
      debug?: boolean;
      shuffle?: boolean;
      rand?: Rand;
      newWall?: () => IWall;
      /** この局に達した時点で終局する。既定は西入り（＝東南戦）。 */
      endRound?: Round;
      /** 進行ログの出し先。既定は console。 */
      logger?: Logger;
    }
  ) {
    this.debugMode = params?.debug ?? false;
    this.logger = params?.logger ?? consoleLogger;
    this.endRound = params?.endRound ?? ROUND.W1;
    this.rand = params?.rand ?? Math.random;
    this.newWall =
      params?.newWall ?? (() => new Wall(undefined, { rand: this.rand }));
    this.wall = this.newWall();
    this.handlers = Object.fromEntries(players.map((p) => [p.id, p.handler]));

    this.playerIDs = players.map((v) => v.id);

    // listening player choice responses
    players.forEach(
      (p) => p.handler.on((e: PlayerEvent) => this.enqueue(e)) // bind
    );

    const handler: EventHandler = createEventEmitter();
    this.observer = new Observer(handler, this.logger);
    this.observer.eventHandler.on(
      (e: PlayerEvent) => this.observer.handleEvent(e) // bind
    );

    const initial = Object.fromEntries(this.playerIDs.map((i) => [i, 25000]));
    this.observer.scoreManager = new ScoreManager(initial);

    const shuffled =
      params?.shuffle == false
        ? this.playerIDs
        : shuffle([...this.playerIDs], this.rand);
    this.observer.placeManager = new PlaceManager({
      [shuffled[0]]: WIND.E,
      [shuffled[1]]: WIND.S,
      [shuffled[2]]: WIND.W,
      [shuffled[3]]: WIND.N,
    });

    // 状態機械は controller を参照するので、他のフィールドが揃ってから作る
    this.actor = this.newActor();
  }

  private newActor(): ControllerActor {
    return createActor(createControllerMachine(this));
  }

  /**
   * 次の局を始められる状態にする。
   * 手牌・河・点数などの盤面は DISTRIBUTE のハンドラ（`actor.ts`）が作り直すので、
   * ここで面倒を見るのは controller 側の入れ物だけ。
   */
  prepareNextRound() {
    this.wall = this.newWall();
    this.observer.applied = {};
    this.mailBox = {};
    this.actor = this.newActor();
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
    this.applyToObserver(e);
  }
  /**
   * observer は同じ出来事を 4 家ぶん受け取るので、盤面に反映するのは 1 回だけにする。
   * - `iam` を持つイベント（誰かの動作）: その人あてのものだけ反映する
   * - 持たないイベント（場の出来事）: イベント ID につき 1 回だけ反映する
   * - `DISTRIBUTE` だけは例外で 4 家ぶん反映する（observer は全員の配牌を持つ）
   */
  private applyToObserver(e: PlayerEvent) {
    if ("iam" in e) {
      if (e.wind == e.iam) this.observer.eventHandler.emit(e);
      return;
    }
    if (this.observer.applied[e.id] && e.type != "DISTRIBUTE") return;
    this.observer.eventHandler.emit(e);
    this.observer.applied[e.id] = true;
  }
  enqueue(event: PlayerEvent): void {
    if (this.mailBox[event.id] == null) this.mailBox[event.id] = [];
    this.mailBox[event.id].push(event);
  }
  /** プレイヤーから返ってきた選択を 1 つ選び、状態機械に送る。 */
  // TODO イベント ID ではなくイベントを受け取り、選択が妥当かをここで検証する
  pollReplies(eventID: string, winds: readonly Wind[]) {
    pollReplies(this, eventID, winds);
  }
  export() {
    return this.histories.concat();
  }
  static load(h: RoundHistory) {
    // 記録を再生するだけなのでプレイヤーは要らない。
    const empty: EventHandler = { emit: () => {}, on: () => {} };
    const props = Object.keys(h.players).map((id) => {
      return { id: id, handler: empty };
    });
    const c = new Controller(props);
    restoreRound(c, h);
    return c;
  }
  start() {
    this.actor.subscribe((snapshot) => {
      this.logger.debug("State:", snapshot.value);
    });

    const ent = snapshotRound(this);
    this.actor.start();
    this.histories.push(ent);
    const v = this.actor.getSnapshot().status;
    if (v != "done")
      throw new Error(
        `unexpected state ${this.actor.getSnapshot().value}(${v})`
      );
  }
  /**
   * @param endRound この局に達した時点で終局する。
   * 既定は構築子で決めた値（無指定なら西入り＝東南戦）。
   */
  startGame(endRound: Round = this.endRound) {
    for (;;) {
      this.logger.debug(
        `start========${this.placeManager.round}=============`
      );
      this.start();
      this.prepareNextRound();
      if (this.placeManager.is(endRound)) break;
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
    const base = this.getBaseBoardParams(w);
    // あがり方はロンの場合だけ下で上書きする（放銃者が決まって初めて点数移動が決まる）。
    const env: BoardContext = { ...base, winBy: { type: "tsumo" } };
    // ツモ牌が無ければロン。actions.doWin は env.winBy でこれを見るので、
    // ロン牌を手牌に加えるのも向こうに任せる。
    const isRon = hand.drawn == null;
    if (isRon) {
      if (params == null) throw new Error("should ron but params == null");
      if (params.discardedBy == w) return false;
      if (params.missingRon) return false;
      const from = params.discardedBy;
      if (from == null) throw new Error("should ron but discardedBy == null");
      env.winBy = { type: "ron", from };
      env.finalDiscardWin = !this.wall.canDraw;
      env.quadWin = params.quadWin;
    } else {
      env.finalWallWin = !this.wall.canDraw;
      env.replacementWin = params?.replacementWin;
    }
    env.oneShotWin = params?.oneShot;
    env.doubleReached =
      discarded.length == 0 ||
      (discarded.length == 1 && discarded[0].t.has(OP.HORIZONTAL));
    return actions.doWin(hand, env, t, discarded);
  }
  doPon(w: Wind, discardedBy: Wind, t?: Tile): readonly BlockPon[] | false {
    if (t == null) return false;
    const hand = this.hand(w);
    return actions.doPon(hand, w, discardedBy, t);
  }
  doChi(w: Wind, discardedBy: Wind, t?: Tile): readonly BlockChi[] | false {
    if (t == null) return false;
    const hand = this.hand(w);
    return actions.doChi(hand, w, discardedBy, t);
  }
  doReach(w: Wind): readonly TileAnalysis[] | false {
    const hand = this.hand(w);
    return actions.doReach(hand);
  }
  doDiscard(w: Wind, called?: BlockChi | BlockPon): readonly Tile[] {
    const hand = this.hand(w);
    return actions.doDiscard(hand, called);
  }
  doAnKan(w: Wind): readonly BlockAnKan[] | false {
    const hand = this.hand(w);
    return actions.doAnKan(hand);
  }
  doShoKan(w: Wind): readonly BlockShoKan[] | false {
    const hand = this.hand(w);
    return actions.doShoKan(hand);
  }
  doDaiKan(w: Wind, discardedBy: Wind, t: Tile): BlockDaiKan | false {
    const hand = this.hand(w);
    return actions.doDaiKan(hand, w, discardedBy, t);
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
