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
  Rand,
  IWall,
  Wall,
  createLocalGame,
  createSeededRand,
  silentLogger,
} from "../../controller";
import { assert } from "../../assert";
import { Parser, Tile, Wind, createWindMap } from "../../core";
import { OP, WIND } from "../../core/constants";

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
  constructor(playerID: string, eventHandler: EventHandler) {
    super(playerID, eventHandler);
  }
  override handleEvent(e: PlayerEvent): void {
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

/**
 * 台本つきの山。
 * 明示していない部分（指定しなかった家の配牌と、台本を使い切った後のツモ）は
 * 本物の山に任せる。乱数を渡せば、その部分も含めて再現できる。
 */
export class MockWall extends Wall {
  private initial = createWindMap(() => "");
  // カンのたびに 1 枚めくるので 4 枚用意しておく。
  // 点数を固定したいので、どの台本の手牌にも乗らない字牌を選んである
  // （中→白, 發→中, 白→發, 北→東）。
  private doras: string[] = ["7z", "6z", "5z", "4z"];
  private openedCount = 1;
  wall: string[] = [];
  /** 嶺上牌の台本。空なら本物の嶺上牌を使う。 */
  replacement: string[] = [];
  oWall: Wall;
  exclude: string[] = [];
  constructor(params?: { rand?: Rand }) {
    super(undefined, params);
    this.oWall = new Wall(undefined, params);
  }
  /**
   * ある家の配牌を決める。
   * 使った牌は自動で除外するので、他家の配牌や本物の山から同じ牌は出てこない
   * （除外しないと 5 枚目が現れ `[counter] tile ... appears more than 4 times` で落ちる）。
   */
  setInitialHand(w: Wind, v: string) {
    this.initial[w] = v;
    this.addExclude(...new Parser(v).tiles().map((t) => t.toString()));
  }
  /** ツモ牌を台本に足す。使った牌は setInitialHand と同じ理由で自動で除外する。 */
  pushTile(t: string) {
    this.wall.push(t);
    this.addExclude(t);
  }
  /** カンしたときに引く嶺上牌を指定する。使った牌は pushTile と同様に除外する。 */
  pushReplacement(t: string) {
    this.replacement.push(t);
    this.addExclude(t);
  }
  /**
   * ドラ表示牌を指定する。先頭が最初の表示牌で、以降はカンごとにめくられる。
   * 点数を固定したいときは、どの手牌にも乗らない牌を選ぶこと。
   */
  setDoraIndicators(...tiles: readonly string[]) {
    this.doras = [...tiles];
  }
  /**
   * これまでにめくられたドラ表示牌の枚数。
   * 名前を base の private フィールド（openedDoraCount）とぶつけないこと。
   * クラスフィールドは派生クラスの getter を own property で覆い隠す。
   */
  get revealedDoraCount() {
    return this.openedCount;
  }
  override get doraIndicators(): Tile[] {
    return this.doras.slice(0, this.openedCount).map(Tile.from);
  }
  override get hiddenDoraIndicators(): Tile[] {
    return this.doraIndicators;
  }
  override openDoraIndicator() {
    if (this.openedCount >= this.doras.length)
      throw new Error(
        `[mock wall] no dora indicator to open: ${this.doras.join(",")}`
      );
    this.openedCount++;
    return Tile.from(this.doras[this.openedCount - 1]);
  }

  /**
   * 台本で使う牌を、山からも他家の配牌からも取り除く。
   * setInitialHand / pushTile は自動で呼ぶので、明示的に呼ぶ必要があるのは
   * 「あとで台本に足す牌を、配牌の時点から避けておきたい」ときだけ。
   */
  addExclude(...tiles: readonly string[]) {
    for (const t of tiles) if (!this.exclude.includes(t)) this.exclude.push(t);
  }

  /**
   * 除外した牌を避けて本物の山から 1 枚引く。
   * 山の終盤で残りが除外牌だけになると引けなくなるので、
   * 局を最後まで回す台本には向かない（必要なところまで stepUntil で進めること）。
   */
  private drawUnexcluded(): Tile {
    // 同じ牌は高々 4 枚なので、除外牌の 4 倍も引けば必ず別の牌に当たる。
    for (let i = 0; i < this.exclude.length * 4 + 1; i++) {
      if (!this.oWall.canDraw)
        throw new Error(
          `[mock wall] no tile left outside the excluded: ${this.exclude}`
        );
      const d = this.oWall.draw();
      if (!this.exclude.includes(d.toString())) return d;
    }
    throw new Error(`could not draw a tile outside: ${this.exclude}`);
  }

  /** 配牌から除外牌を取り除き、別の牌で埋め直す。 */
  private withoutExcluded(hand: string): string {
    if (this.exclude.length == 0) return hand;
    return new Parser(hand)
      .tiles()
      .map((t) =>
        this.exclude.includes(t.toString()) ? this.drawUnexcluded() : t
      )
      .join("");
  }

  override draw() {
    const t = this.wall.shift();
    // 台本を使い切ったら本物の山から引く
    if (t == null) return this.drawUnexcluded();
    return Tile.from(t);
  }
  override kan() {
    const t = this.replacement.shift();
    if (t == null) return this.drawUnexcluded();
    return Tile.from(t);
  }
  // draw / kan は台本と oWall から引くので、残りもそちらで数える。
  // base の walls は減らないため、そのままでは「常にツモれる」ことになり
  // 誰も和了らない局が終わらない。
  override get canDraw() {
    return this.wall.length > 0 || this.oWall.canDraw;
  }
  override get canKan() {
    return this.replacement.length > 0 || this.oWall.canKan;
  }
  override initialHands(): { readonly [key in Wind]: string } {
    const i = this.oWall.initialHands();
    for (let w of Object.values(WIND)) {
      // 明示していない家の配牌は本物の山任せなので、除外牌だけ入れ替える
      i[w] =
        this.initial[w] != "" ? this.initial[w] : this.withoutExcluded(i[w]);
    }
    return i;
  }
}

export interface Scenario {
  c: Controller;
  wall: MockWall;
  /** 東家から順に並べたプレイヤー。席をシャッフルしないので players[0] が 1z。 */
  players: [MockPlayer, MockPlayer, MockPlayer, MockPlayer];
}

/**
 * 4 人とも MockPlayer、山は台本つきの局を用意する。
 * 既定は debug: true なので、進行は stepUntil で 1 手ずつ進める。
 * debug: false にすると actor.start() で終局まで一気に進む。
 */
export const createScenario = (params?: {
  seed?: number;
  debug?: boolean;
}): Scenario => {
  const rand = createSeededRand(params?.seed ?? 20260801);
  const wall = new MockWall({ rand: rand });
  const { c, p1, p2, p3, p4 } = createLocalGame({
    debug: params?.debug ?? true,
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
