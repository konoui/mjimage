import type { Controller } from "../controller/controller";
import type { PlayerEvent } from "../controller/events";
import { MjaiEncoder } from "./encode";
import { MjaiEvent } from "./types";

// mjson 牌譜の書き出し（replay mode）。
//
// 変換そのものは encode.ts が持つ。ここがやるのは溜めて 1 行 1 JSON にすることだけ。
//
// observer に繋ぐと牌が伏せられていない列が取れる。Controller.applyToObserver は
// `iam` を持つイベントについて `wind == iam` の写し（＝マスクされていない方）だけを
// observer に渡すので、全員の手牌とツモが実牌で流れてくる。
// 1 プレイヤーの EventHandler に繋いだ場合は、他家の牌が "?" のままの牌譜になる。
//
// Controller.export() / Replayer の RoundHistory は「山＋選択の記録」で、
// 局を同じようにやり直すためのもの。mjai 牌譜とは別物なので、両方を並立させる。

export class MjaiLogWriter {
  private readonly encoder = new MjaiEncoder();
  private readonly events: MjaiEvent[] = [];
  private finished = false;

  /** 変換で取りこぼしたものの報告。空でなければ牌譜として不完全。 */
  get warnings(): readonly string[] {
    return this.encoder.warnings;
  }

  /** 盤面のイベントを 1 つ受け取る。選択イベントは牌譜に出ない。 */
  write(e: PlayerEvent): void {
    if (this.finished)
      throw new Error(`[mjai] the log is already finished`);
    this.events.push(...this.encoder.encode(e));
  }

  /**
   * 半荘の終わりを書いて閉じる。mjimage に半荘終了のイベントが無いので明示的に呼ぶ（§5.9）。
   * 呼ばないと `end_game` の無い牌譜になる。
   */
  finish(scores?: { readonly [playerID: string]: number }): void {
    if (this.finished) return;
    this.events.push(...this.encoder.finish(scores));
    this.finished = true;
  }

  /** 書き出したイベント。手を入れずに読むだけ。 */
  get log(): readonly MjaiEvent[] {
    return this.events;
  }

  /** 1 行 1 JSON の各行。 */
  lines(): string[] {
    return this.events.map((e) => JSON.stringify(e));
  }

  /** mjson 本体。末尾に改行を付けるので、そのままファイルに書ける。 */
  toString(): string {
    return this.lines().join("\n") + "\n";
  }
}

/**
 * controller の observer に繋いで牌譜を取り始める。
 *
 * ```ts
 * const log = recordMjaiLog(c);
 * c.startGame();
 * log.finish(c.scoreManager.summary);
 * writeFileSync("game.mjson", log.toString());
 * ```
 */
export const recordMjaiLog = (c: Controller): MjaiLogWriter => {
  const writer = new MjaiLogWriter();
  c.observer.eventHandler.on((e: PlayerEvent) => writer.write(e));
  return writer;
};
