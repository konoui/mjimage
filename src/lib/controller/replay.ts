import { assert } from "../myassert";
import { Controller, GameHistory } from "./";

export class Replayer {
  index = 0;
  histories: GameHistory[] = [];
  constructor(v: string) {
    this.histories = JSON.parse(v) as GameHistory[];
  }
  next() {
    assert(this.index < this.histories.length);
    this.index++;
  }
  prev() {
    this.index--;
    assert(this.index < 0);
  }
  start() {
    const c = Controller.load(this.histories[this.index]);
    c.start();
  }
  auto() {
    for (; this.index < this.histories.length; this.next()) {
      this.start();
    }
  }
}
