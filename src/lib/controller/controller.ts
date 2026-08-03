import { Actor, createActor } from "xstate";
import { assert } from "../assert";
import {
  TYPE,
  OP,
  Wind,
  WindMap,
  Round,
  WIND,
  ROUND,
  HONOR_NUMBERS,
  TERMINAL_NUMBERS,
  createWindMap,
} from "../core/";
import {
  BoardContext,
  PointCalculator,
  SerializedWinResult,
  WinBy,
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
import {
  PlayerEvent,
  EventHandler,
  createEventEmitter,
  isChoiceReply,
} from "./events";
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
  /** プレイヤーからの返信。イベント ID ごとに 1 種類の選択が溜まる。 */
  mailBox: MailBox = {};
  /**
   * 各家に提示した和了。返信ではこちらを使う（プレイヤーの申告は信用しない）。
   * 提示したときと同じ直列化済みの形で持つので、返信の側は復元するだけでよい。
   */
  private winOffers: { [eventID: string]: WindMap<SerializedWinResult | false> } =
    {};
  histories: RoundHistory[] = [];
  /**
   * 状態機械を自分で進めるか。false にすると `next()` が黙って何もしないので、
   * テストが `next(true)` で 1 手ずつ進められる。
   */
  autoAdvance: boolean;
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
      /** @deprecated `autoAdvance: false` を使うこと。 */
      debug?: boolean;
      shuffle?: boolean;
      rand?: Rand;
      newWall?: () => IWall;
      /** この局に達した時点で終局する。既定は西入り（＝東南戦）。 */
      endRound?: Round;
      /** 進行ログの出し先。既定は console。 */
      logger?: Logger;
      /** false にすると `next()` で進まなくなる。既定は true。 */
      autoAdvance?: boolean;
    }
  ) {
    this.autoAdvance = params?.autoAdvance ?? !(params?.debug ?? false);
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
    this.winOffers = {};
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
  /** @param force 自動進行を止めていても 1 手だけ進める。 */
  next(force?: boolean) {
    if (this.autoAdvance || force) this.actor.send({ type: "NEXT" });
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
    // プレイヤーが返してよいのは、こちらが返事を求めた選択イベントだけ。
    // 盤面を伝えるだけのイベントが返ってくるのは Player 側の組み立て誤り。
    assert(
      isChoiceReply(event),
      `[bug] unexpected reply from a player: ${event.type}`
    );
    if (this.mailBox[event.id] == null) this.mailBox[event.id] = [];
    this.mailBox[event.id].push(event);
  }
  /**
   * 和了の選択肢として提示した内容を控える。
   * 提示と返信で同じイベント ID を使うので、返信側はここから引き直せる。
   */
  recordWinOffer(eventID: string, w: Wind, ret: SerializedWinResult | false) {
    if (this.winOffers[eventID] == null)
      this.winOffers[eventID] = createWindMap<SerializedWinResult | false>(
        () => false
      );
    // 同じ物体をプレイヤーにも渡すので、控えは写しにする
    // （プレイヤーが手元で書き換えても点数には出ない）。
    this.winOffers[eventID][w] =
      ret === false ? false : (JSON.parse(JSON.stringify(ret)) as typeof ret);
  }
  /** 提示した和了。提示していなければ false。 */
  winOffer(eventID: string, w: Wind): SerializedWinResult | false {
    return this.winOffers[eventID]?.[w] ?? false;
  }
  /**
   * プレイヤーから返ってきた選択を 1 つ選び、状態機械に送る。
   * 和了の申告はここで controller の控えに置き換わる（`mailbox.ts`）。
   * 打牌・鳴きで返ってきた牌やブロックが提示したものかは、まだ照合していない。
   */
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
    // 始めた局は必ず履歴に残す。局の途中で落ちても `export()` で取り出せるように、
    // actor を動かす前に積む（`choiceEvents` は mailBox の参照なので、進行に従って埋まる）。
    this.histories.push(ent);
    this.actor.start();
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
  /**
   * 最終的な点数を求める。
   *
   * `ret` は controller が提示した和了（`winOffer`）なので、盤面もブロック分解も自前のもの。
   * ここで計算し直すのは、和了して初めて確定する供託と裏ドラを足すため。
   */
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
  /**
   * 和了できるかを controller 側で判定し、できるならその内容を返す。
   *
   * ロンかツモかは呼び出し側が `winBy` で決める。`actions.doWin` も同じ値を見るので、
   * 「どちらであがったか」の判断が 2 か所に分かれない（ロン牌を手牌に加えるのは向こうの仕事）。
   */
  doWin(
    w: Wind,
    t: Tile | null | undefined,
    params: {
      winBy: WinBy;
      quadWin?: boolean;
      replacementWin?: boolean;
      oneShot?: boolean;
      missingRon?: boolean;
    }
  ): WinResult | false {
    if (t == null) return false;
    const hand = this.hand(w);
    const discarded = this.river.discards(w);
    const base = this.getBaseBoardParams(w);
    const winBy = params.winBy;
    const env: BoardContext = { ...base, winBy: winBy };
    if (winBy.type == "ron") {
      // 4 家ぶんまとめて聞くので、捨てた人・カンした人自身もここに来る。
      // その人はツモ牌を持ったままのことがあるので、先に落とす。
      if (winBy.from == w) return false; // 自分が出した牌ではあがれない
      if (params.missingRon) return false; // フリテン
      // ほかの人がツモ牌を持ったままロンにはならない。食い違うなら進行側の組み立て誤り。
      assert(
        hand.drawn == null,
        `[bug] ron with a drawn tile: ${hand.drawn?.toString()}`
      );
      env.finalDiscardWin = !this.wall.canDraw;
      env.quadWin = params.quadWin;
    } else {
      env.finalWallWin = !this.wall.canDraw;
      env.replacementWin = params.replacementWin;
    }
    env.oneShotWin = params.oneShot;
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
  // カンは嶺上牌の数（4 回）が上限。4 回目のカンの打牌に誰も反応しなければ
  // `cannotContinue` で流局するが、その打牌が鳴かれると次のカンの機会が回るので、
  // 選択肢を出す側で止める。
  doAnKan(w: Wind): readonly BlockAnKan[] | false {
    if (!this.wall.canKan) return false;
    const hand = this.hand(w);
    return actions.doAnKan(hand);
  }
  doShoKan(w: Wind): readonly BlockShoKan[] | false {
    if (!this.wall.canKan) return false;
    const hand = this.hand(w);
    return actions.doShoKan(hand);
  }
  doDaiKan(w: Wind, discardedBy: Wind, t: Tile): BlockDaiKan | false {
    if (!this.wall.canKan) return false;
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
