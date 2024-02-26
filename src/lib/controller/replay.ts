import assert from "assert";
import { Controller, River, Wall, History, nextRound, prevRound } from "./";
import { KIND, OPERATOR, Wind, Round, WIND } from "../constants";

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
    const c = new Controller(new Wall(), new River());
    c.load(this.histories[this.index]);
    c.start();
  }
  auto() {
    for (; this.index < this.histories.length; this.next()) {
      this.start();
    }
  }
}
