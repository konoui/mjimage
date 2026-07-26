import { assert } from "../assert";
import { Wind } from "../core/constants";
import { Tile } from "../core/parser";

type DiscardEntry = { w: Wind; t: Tile; callMarker?: boolean };

export interface IRiver {
  discard(t: Tile, w: Wind): void;
  discards(w?: Wind): readonly DiscardEntry[];
  lastTile: DiscardEntry;
  markCalled(): void;
  isFourWindsAbort(): boolean;
  reset(): void;
}

export class River implements IRiver {
  private all: DiscardEntry[] = [];
  private byWind: Map<Wind, DiscardEntry[]> = new Map();

  discard(t: Tile, w: Wind) {
    const entry: DiscardEntry = { w, t };
    this.all.push(entry);
    const arr = this.byWind.get(w);
    if (arr) arr.push(entry);
    else this.byWind.set(w, [entry]);
  }

  discards(w?: Wind): readonly DiscardEntry[] {
    return w == undefined ? this.all : (this.byWind.get(w) ?? []);
  }

  get lastTile(): DiscardEntry {
    const last = this.all.at(-1);
    assert(
      last != null,
      `lastTile is null. river: ${JSON.stringify(this.all, null, 2)}`,
    );
    return last;
  }

  markCalled() {
    this.lastTile.callMarker = true;
  }

  isFourWindsAbort() {
    if (this.all.length != 4) return false;
    const first = this.all[0].t;
    if (first.isNum()) return false;
    return this.all.every((d) => first.equals(d.t));
  }

  reset() {
    this.all = [];
    this.byWind.clear();
  }
}
