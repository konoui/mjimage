import { WIND, Tile } from "../core/";
import { BaseActor, ActorHand } from "./controller";
import { River } from "./river";
import { PlayerEfficiency, RiskRank } from "./player-efficiency";
import { ShantenCalculator, Efficiency } from "../calculator";
import { PlayerEvent, EventHandler, DistributeEvent } from "./events";

export class Player extends BaseActor {
  river = new River();
  doras: Tile[] = [];
  constructor(playerID: string, eventHandler: EventHandler) {
    super(playerID, eventHandler);
    this.eventHandler.on((e: PlayerEvent) => {
      return this.handleEvent(e);
    }); // bind
  }
  get myWind() {
    return this.placeManager.wind(this.id);
  }
  setHands(e: DistributeEvent): void {
    for (const w of Object.values(WIND))
      this.hands[w] = new ActorHand(e.hands[w]);
  }
  handleDiscard(tiles: Tile[]) {
    const reachUsers = Object.values(WIND).filter((w) => {
      return w == this.myWind ? false : this.hand(w).reached;
    });
    const shanten = new ShantenCalculator(this.hand(this.myWind)).calc();
    if (reachUsers.length > 0 && shanten >= 2) {
      // ベタオリ
      const t = RiskRank.selectTile(this.counter, reachUsers, tiles);
      return t;
    }
    // 枚数が多いものを優先する
    // 同じ枚数の場合は価値が少ないものを選択する
    // TODO 安全牌を残す
    const c = Efficiency.calcEffectiveTiles(this.hand(this.myWind), tiles);
    const candidates = PlayerEfficiency.analyzePlayerEfficiency(
      this.counter,
      c
    );
    const sorted = candidates.sort((a, b) => b.sum - a.sum);
    const filtered = sorted.filter((v) => v.sum == sorted[0].sum);
    const ct = PlayerEfficiency.selectMinPriority(
      this.counter,
      filtered,
      this.doras
    );
    return ct.tile;
  }
  handleEvent(e: PlayerEvent) {
    switch (e.type) {
      case "CHOICE_AFTER_DISCARDED":
        // e.choices.CHI = false;
        // e.choices.DAI_KAN = false;
        // e.choices.PON = false;
        //        e.choices.RON = false;
        this.eventHandler.emit(e);
        break;
      case "CHOICE_AFTER_CALLED":
      case "CHOICE_AFTER_DRAWN":
        if (e.choices.DISCARD) {
          const t = this.handleDiscard(e.choices.DISCARD.map(Tile.from));
          e.choices.DISCARD = [t.toString()];
        }
        this.eventHandler.emit(e);
        break;
      case "CHOICE_FOR_REACH_ACCEPTANCE":
        this.eventHandler.emit(e);
        break;
      case "CHOICE_FOR_CHAN_KAN":
        this.eventHandler.emit(e);
        break;
      default:
        super.handleEvent(e);
    }
  }
}
