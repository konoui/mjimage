import {
  ChoiceAfterCalled,
  ChoiceAfterDiscardedEvent,
  ChoiceAfterDrawnEvent,
  ChoiceForChanKan,
  ChoiceForReachAcceptance,
  Controller,
  EventHandler,
  Player,
  PlayerEvent,
  IWall,
  createLocalGame,
  createSeededRand,
  silentLogger,
} from "../../controller";
import { assert } from "../../assert";
import { Tile } from "../../core";
import { OP } from "../../core/constants";
import { HARMLESS_DORA, ScriptedWall, WallScript } from "./wall";

// controller のシナリオテスト用の道具立て。
// 実際の対局を通してしか確かめられない性質（カンドラ・フリテン・和了の検証など）を
// 台本つきの山と、指示どおりに動くプレイヤーで再現する。

/**
 * 指示された選択だけを行うプレイヤー。
 * 各 m*Handlers は先に登録したものから順に呼ばれ、true を返した時点で終わる
 * （そのハンドラが自分で emit する責任を持つ）。
 * どれも true を返さなければ「鳴かない・ツモ切り」の既定動作になる。
 */
export class MockPlayer extends Player {
  mDiscardHandlers: ((
    e: ChoiceAfterDiscardedEvent,
    p: MockPlayer
  ) => boolean)[] = [];
  mDrawHandlers: ((e: ChoiceAfterDrawnEvent, p: MockPlayer) => boolean)[] = [];
  mCalledHandlers: ((e: ChoiceAfterCalled, p: MockPlayer) => boolean)[] = [];
  mChanKanHandlers: ((e: ChoiceForChanKan, p: MockPlayer) => boolean)[] = [];
  mReachAcceptanceHandlers: ((
    e: ChoiceForReachAcceptance,
    p: MockPlayer
  ) => boolean)[] = [];
  doReachRon = false;
  doChankan = false;
  /**
   * 受け取った選択イベントの控え。ハンドラが `e.choices` を書き換える前の値を持つので、
   * 「何を聞かれたか」をあとから確かめられる。
   */
  readonly received: PlayerEvent[] = [];
  constructor(playerID: string, eventHandler: EventHandler) {
    super(playerID, eventHandler);
  }

  /** その種類の選択を受け取ったか。stepUntil の条件に使う。 */
  got(type: PlayerEvent["type"]) {
    return this.received.some((e) => e.type == type);
  }

  /** その種類で受け取った選択をすべて。 */
  all<T extends PlayerEvent["type"]>(type: T) {
    return this.received.filter((e) => e.type == type) as Extract<
      PlayerEvent,
      { type: T }
    >[];
  }

  /** その種類で最後に受け取った選択。まだなら undefined。 */
  last<T extends PlayerEvent["type"]>(type: T) {
    return this.all(type).at(-1);
  }

  /** 控えを捨てる。局をまたぐシナリオで前局の分を混ぜないために使う。 */
  clearReceived() {
    this.received.length = 0;
  }

  override handleEvent(e: PlayerEvent): void {
    switch (e.type) {
      case "CHOICE_AFTER_DISCARDED":
      case "CHOICE_AFTER_CALLED":
      case "CHOICE_AFTER_DRAWN":
      case "CHOICE_FOR_REACH_ACCEPTANCE":
      case "CHOICE_FOR_CHAN_KAN":
        // ハンドラが書き換える前に控える
        this.received.push(structuredClone(e));
    }
    switch (e.type) {
      case "CHOICE_AFTER_DISCARDED":
        for (let h of this.mDiscardHandlers) if (h(e, this)) return;

        // デフォルトは何もしない
        e.choices.CHI = false;
        e.choices.DAI_KAN = false;
        e.choices.PON = false;
        e.choices.RON = false;
        this.eventHandler.emit(e);
        break;
      case "CHOICE_AFTER_CALLED":
        for (let h of this.mCalledHandlers) if (h(e, this)) return;

        // デフォルトは適当に捨てる
        this.eventHandler.emit(e);
        break;
      case "CHOICE_AFTER_DRAWN":
        for (let h of this.mDrawHandlers) if (h(e, this)) return;

        // デフォルトはツモ切り
        e.choices.AN_KAN = false;
        e.choices.DRAWN_GAME_BY_NINE_TERMINALS = false;
        e.choices.SHO_KAN = false;
        e.choices.TSUMO = false;
        e.choices.REACH = false;
        assert(e.choices.DISCARD);
        const tsumo = e.choices.DISCARD.filter((t) =>
          Tile.from(t).has(OP.TSUMO)
        );
        e.choices.DISCARD = tsumo;
        this.eventHandler.emit(e);
        break;
      case "CHOICE_FOR_REACH_ACCEPTANCE":
        for (let h of this.mReachAcceptanceHandlers) if (h(e, this)) return;

        if (!this.doReachRon) e.choices.RON = false;
        this.eventHandler.emit(e);
        break;
      case "CHOICE_FOR_CHAN_KAN":
        for (let h of this.mChanKanHandlers) if (h(e, this)) return;

        if (!this.doChankan) e.choices.RON = false;
        this.eventHandler.emit(e);
        break;
      default:
        super.handleEvent(e);
    }
  }
}

export interface Scenario {
  c: Controller;
  wall: ScriptedWall;
  /** 東家から順に並べたプレイヤー。席をシャッフルしないので players[0] が 1z。 */
  players: [MockPlayer, MockPlayer, MockPlayer, MockPlayer];
}

/**
 * 4 人とも MockPlayer、山は台本つきの局を用意する。
 * 既定は自動進行を止めてあるので、進行は stepUntil で 1 手ずつ進める。
 * autoAdvance: true にすると actor.start() で終局まで一気に進む。
 */
export const createScenario = (params?: {
  seed?: number;
  /** true にすると actor.start() で終局まで一気に進む。既定は 1 手ずつ。 */
  autoAdvance?: boolean;
  /** 山の台本。指定しなかった部分は種つきの乱数で埋まる。 */
  wall?: WallScript;
}): Scenario => {
  const rand = createSeededRand(params?.seed ?? 20260801);
  const wall = new ScriptedWall({
    doraIndicators: HARMLESS_DORA,
    ...params?.wall,
    rand: rand,
  });
  const { c, p1, p2, p3, p4 } = createLocalGame({
    autoAdvance: params?.autoAdvance ?? false,
    shuffle: false,
    rand: rand,
    newWall: () => wall,
    logger: silentLogger, // 進行ログはテストの出力を埋めるだけなので出さない
    playerInjection: {
      p1: MockPlayer,
      p2: MockPlayer,
      p3: MockPlayer,
      p4: MockPlayer,
    },
  });
  const players: [MockPlayer, MockPlayer, MockPlayer, MockPlayer] = [
    p1 as MockPlayer,
    p2 as MockPlayer,
    p3 as MockPlayer,
    p4 as MockPlayer,
  ];
  return { c: c, wall: wall, players: players };
};

const isDone = (c: Controller) => c.actor.getSnapshot().status == "done";

/**
 * 条件が満たされるまで進める。
 * `c.next(true)` を何回呼ぶかを数える書き方は、途中に鳴きが入るだけでずれるので使わない。
 */
export const stepUntil = (
  c: Controller,
  cond: () => boolean,
  limit = 200
): void => {
  for (let i = 0; i < limit; i++) {
    if (cond()) return;
    if (isDone(c)) throw new Error(`the round is done before the condition`);
    c.next(true);
  }
  throw new Error(`the condition is not met in ${limit} steps`);
};

/** 次の局を始められる状態にする。山だけ台本つきのものに差し替えられる。 */
export const startNextRound = (c: Controller, wall?: IWall) => {
  c.prepareNextRound();
  if (wall != null) c.wall = wall;
};

/** observer が適用したイベントを記録する。重複は除かれている。 */
export const recordEvents = (c: Controller) => {
  const log: PlayerEvent[] = [];
  c.observer.eventHandler.on((e: PlayerEvent) => {
    log.push(e);
  });
  return log;
};
