import assert from "assert";
import { Wind } from "../constants";
import { Tile } from "../parser";

export class River {
  private m: { w: Wind; t: Tile; callMarker?: boolean }[] = [];
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
  discards(w?: Wind) {
    if (w == undefined) return [...this.m];
    return this.m.filter((v) => v.w == w);
  }
  markCalled() {
    this.lastTile.callMarker = true;
  }
  cannotContinue() {
    const discards = this.discards();
    if (discards.length != 4) return false;
    let t = discards[0].t;
    if (t.isNum()) return false;
    for (let i = 0; i < 4; i++) if (!t.equals(discards[i].t)) return false;
    return true;
  }
}
