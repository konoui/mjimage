import { BLOCK, KIND, OPERATOR } from "./constants";
import { Block, Tile, Parser } from "./parser";

type FixedNumber = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number
];

export interface HandData {
  [KIND.M]: FixedNumber;
  [KIND.S]: FixedNumber;
  [KIND.P]: FixedNumber;
  [KIND.Z]: [number, number, number, number, number, number, number, number];
  [KIND.BACK]: [number];
  // FIXME using X_BLOCK
  called: Block[];
  tsumo: Tile | null;
  reached: boolean;
}

export class Hand {
  data: HandData;
  input: string;
  constructor(input: string) {
    this.input = input;
    this.data = {
      [KIND.M]: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [KIND.P]: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [KIND.S]: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [KIND.Z]: [0, 0, 0, 0, 0, 0, 0, 0],
      [KIND.BACK]: [0],
      called: [],
      reached: false,
      tsumo: null,
    };
    this.init(input);
  }
  private init(input: string) {
    const blocks = new Parser(input).parse();
    for (let b of blocks) {
      if (b.isCalled()) this.data.called.push(b);
      if (b.is(BLOCK.TSUMO)) {
        const t = b.tiles[0];
        this.data.tsumo = t;
        this.inc(t);
      }

      if (b.is(BLOCK.HAND)) {
        for (let t of b.tiles) this.inc(t);
      }
    }
  }
  inc(...tiles: Tile[]) {
    const backup: Tile[] = [];
    for (let t of tiles) {
      if (t.k != KIND.BACK && this.data[t.k][t.n] > 4) {
        this.dec(...backup);
        throw new Error(`unable to increment ${t}`);
      }
      backup.push(t);
      this.data[t.k][t.n] += 1;
    }
  }
  dec(...tiles: Tile[]) {
    const backup: Tile[] = [];
    for (let t of tiles) {
      if (this.data[t.k][t.n] < 1) {
        this.inc(...backup);
        throw new Error(`unable to decrement ${t}`);
      }
      backup.push(t);
      this.data[t.k][t.n] -= 1;
    }
  }
  tsumo(t: Tile) {
    t.op = OPERATOR.TSUMO;
    this.data.tsumo = t;
    this.inc(t);
    return this;
  }
  discard(t: Tile) {
    this.dec(t);
    return this;
  }
  call(b: Block) {
    if (b.is(BLOCK.AN_KAN) || b.is(BLOCK.SHO_KAN))
      throw new Error(`unexpected input ${b}`);

    const toRemove = b.tiles.filter((v) => v.op != OPERATOR.HORIZONTAL);
    if (toRemove == null) throw new Error(`unable to find ${b}`);

    for (let t of toRemove) this.dec(t);
    this.data.called.push(b);
    return this;
  }
  kan(b: Block) {
    if (b.is(BLOCK.AN_KAN)) {
      const t = b.tiles.filter((v) => v.k != KIND.BACK);
      this.dec(t[0], t[0], t[0], t[0]);
      this.data.called.push(b);
      return this;
    }

    if (b.is(BLOCK.SHO_KAN)) {
      const idx = this.data.called.findIndex(
        (v) => v.is(BLOCK.PON) && v.tiles[0].equals(b.tiles[0])
      );
      if (idx == -1) throw new Error(`unable to find ${b.tiles[0]}`);
      this.data.called.splice(idx, 1);
      this.data.called.push(b);
      return this;
    }

    throw new Error(`unexpected input ${b}`);
  }
  clone(): Hand {
    const c = new Hand(this.input);
    c.data[KIND.M] = this.data[KIND.M].concat() as FixedNumber;
    c.data[KIND.S] = this.data[KIND.S].concat() as FixedNumber;
    c.data[KIND.P] = this.data[KIND.P].concat() as FixedNumber;
    c.data[KIND.BACK] = this.data[KIND.BACK];
    c.data.called = this.data.called.concat();
    c.data.reached = this.data.reached;
    c.data.tsumo = this.data.tsumo;
    return c;
  }
}
