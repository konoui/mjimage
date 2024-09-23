import { assert } from "../myassert";
import { Controller, History } from "./";

export class Replayer {
  index = 0;
  histories: History[] = [];
  constructor(v: string) {
    this.histories = JSON.parse(v) as History[];
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
