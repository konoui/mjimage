import { WIND } from "../constants";
import { Tile } from "../parser";
import { BaseActor, River, Efficiency, PlayerEfficiency } from "./";
import { Hand } from "../calculator";
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
    for (let w of Object.values(WIND)) this.hands[w] = new Hand(e.hands[w]);
  }
  handleEvent(e: PlayerEvent) {
    switch (e.type) {
      case "CHOICE_AFTER_CALLED":
        this.eventHandler.emit(e);
        break;
      case "CHOICE_AFTER_DISCARDED":
        e.choices.DAI_KAN = false;
        e.choices.PON = false;
        this.eventHandler.emit(e);
        break;
      case "CHOICE_AFTER_DRAWN":
        if (e.choices.DISCARD) {
          const c = Efficiency.calcCandidates(
            this.hand(this.myWind),
            e.choices.DISCARD
          );
          // 枚数が多いものを優先する
          // 同じ枚数の場合は価値が少ないものを選択する
          // TODO 安全牌を残す
          const candidates = PlayerEfficiency.calcPlayerCandidates(
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
          e.choices.DISCARD = [ct.tile];
        }
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
