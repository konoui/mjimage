import {
  OP,
  TYPE,
  WIND,
  Wind,
  createWindMap,
  prevWind,
} from "../core/";
import { Block, BlockAnKan, BlockShoKan, Tile } from "../core";
import { Hand } from "../calculator";
import { DistributeEvent, EventHandler, PlayerEvent } from "./events";
import { PlaceManager, ScoreManager, Counter } from "./managers";
import { IRiver, River } from "./river";
import { consoleLogger, Logger } from "./logger";

// イベントを受け取って盤面を再現する側。
// Controller（進行を決める側）からは独立していて、参照を持たない。

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
  protected logger: Logger;
  constructor(id: string, eventHandler: EventHandler, logger?: Logger) {
    this.id = id;
    this.eventHandler = eventHandler;
    this.logger = logger ?? consoleLogger;
  }
  get doraIndicators(): readonly Tile[] {
    return this._doraIndicators;
  }
  hand(w: Wind) {
    return this.hands[w];
  }
  /**
   * 打牌を盤面に反映する。
   * @param iam 捨てた人
   * @param wind このイベントを受け取っている人（自分の捨て牌は DRAW で数え済み）
   */
  private applyDiscard(t: Tile, iam: Wind, wind: Wind) {
    this.river.discard(t, iam);
    this.hands[iam].discard(t); // FIXME
    if (iam == wind) return;
    this.counter.dec(t);
    this.counter.addTileToSafeMap(t, iam); // そのユーザの捨て牌を現物に追加
    // 立直されている場合、捨て牌は立直ユーザの現物になる
    for (const w of Object.values(WIND))
      if (this.hand(w).reached) this.counter.addTileToSafeMap(t, w);
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
      case "DISTRIBUTE": {
        // 局の初期化はここに集める
        this.counter.reset();
        this.river.reset();

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
      }
      case "DRAW": {
        const t = Tile.from(e.tile);
        this.hands[e.iam].draw(t);
        this.counter.dec(t);
        break;
      }
      case "DISCARD": {
        this.applyDiscard(Tile.from(e.tile), e.iam, e.wind);
        break;
      }
      case "PON":
      case "CHI":
      case "DAI_KAN": {
        const block = Block.deserialize(e.block);
        this.hands[e.iam].call(block);
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
        // 立直の宣言牌も打牌なので、印をつけてから DISCARD と同じ扱いにする
        this.hands[e.iam].reach();
        this.applyDiscard(Tile.from(e.tile), e.iam, e.wind);
        break;
      }
      case "REACH_ACCEPTED": {
        // handle reach stick
        const pid = this.placeManager.playerID(e.reacherInfo.wind);
        this.scoreManager.reach(pid);
        this.placeManager.incrementReachStick();
        break;
      }
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
  constructor(eventHandler: EventHandler, logger?: Logger) {
    super("observer", eventHandler, logger);
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
        this.logger.debug(
          `DISTRIBUTE:`,
          `round: ${this.placeManager.round}`,
          `scores: ${JSON.stringify(this.scoreManager.summary, null, 2)}`,
          `map: ${JSON.stringify(this.placeManager.playerMap, null, 2)}`,
          `sticks: ${JSON.stringify(this.placeManager.sticks, null, 2)}`
        );
        for (const w of Object.values(WIND))
          this.logger.debug(
            `${this.placeManager.playerID(w)}(${w})`,
            `init hand: ${this.hand(w).toString()}`
          );
        break;
      case "DRAW":
        this.logger.debug(
          `${this.placeManager.playerID(e.iam)}(${e.iam})`,
          `draw: ${this.hand(e.iam).drawn}`,
          `hand: ${this.hand(e.iam).toString()}`
        );
        break;
      case "DISCARD":
        this.logger.debug(
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
        this.logger.debug(
          `${this.placeManager.playerID(e.iam)}(${e.iam})`,
          `call: ${e.block.tiles}`,
          `hand: ${this.hand(e.iam).toString()}`
        );
        break;
      case "REACH":
        this.logger.debug(
          `${this.placeManager.playerID(e.iam)}(${e.iam})`,
          `reach: ${e.tile}`,
          `hand: ${this.hand(e.iam).toString()}`
        );
        break;
      case "TSUMO":
      case "RON":
        this.logger.debug(
          `${this.placeManager.playerID(e.iam)}(${e.iam})`,
          `ron/tsumo: ${JSON.stringify(e.ret, null, 2)}`,
          `hand: ${this.hand(e.iam).toString()}`
        );
        break;
      case "END_GAME":
        for (const w of Object.values(WIND)) {
          // Note: show prev wind as wind of player is updated by BaseActor handler
          this.logger.debug(
            `${this.placeManager.playerID(w)}(${prevWind(w)})`,
            `end hand: ${this.hand(w).toString()}`
          );
        }
        this.logger.debug(
          "END_GAME",
          e.subType,
          "scores",
          JSON.stringify(this.scoreManager.summary, null, 2),
          `sticks: ${JSON.stringify(this.placeManager.sticks, null, 2)}`
        );
    }
  }
}
