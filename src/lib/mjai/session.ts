import type { EventHandler, PlayerEvent } from "../controller/events";
import { isChoiceReply } from "../controller/events";
import { MjaiEncoder } from "./encode";
import { applyAction, hasSelectableChoice } from "./decode";
import {
  MJAI_TYPE,
  MjaiAction,
  MjaiActor,
  MjaiDahaiEvent,
  MjaiEvent,
  MjaiEventWithCanAct,
} from "./types";

// Controller に挿す mjai のアダプタ。
//
// Controller から見ると Player と同じ EventHandler にすぎないので、
// createLocalGame の playerInjection にそのまま差し込める。
//
// 【同期であること】
// controller の進行は emit → ハンドラ → emit が同期で回る。pollReplies は
// 4 家の返信が揃っていないと投げるので、**bot の応答も同期でなければならない**。
// stdio や WebSocket 越しの bot をここに直接挿すことはできない（Phase 5 で、
// 進行を待たせる駆動側を別に用意する）。

/** mjai の bot。イベント列を渡すと行動を 1 つ返す。 */
export interface MjaiBot {
  /**
   * 直前の呼び出し以降に起きたイベントを渡し、行動を得る。
   * 最後の要素だけが `can_act: true` で、それに対する行動を返す。
   */
  react(events: readonly MjaiEventWithCanAct[]): MjaiAction;
}

/**
 * 1 プレイヤー分の mjai アダプタ。
 *
 * `Player` と同じ形（`(playerID, eventHandler)` で作り、イベントを購読する）にしてあるので、
 * `createLocalGame` の `playerInjection` に差し込める。
 */
export class MjaiPlayer {
  private readonly encoder = new MjaiEncoder();
  /** bot にまだ渡していないイベント。選択イベントを区切りにまとめて渡す（§6.3）。 */
  private queue: MjaiEvent[] = [];
  /** 自分の席番号。DISTRIBUTE で決まる。 */
  private myActor: MjaiActor | null = null;
  /** 立直を宣言して、宣言牌をまだ controller に渡していない状態。 */
  private pendingReach = false;

  readonly warnings: string[] = [];

  constructor(
    readonly id: string,
    readonly eventHandler: EventHandler,
    private readonly bot: MjaiBot
  ) {
    this.eventHandler.on((e: PlayerEvent) => this.handleEvent(e));
  }

  handleEvent(e: PlayerEvent) {
    if (e.type == "DISTRIBUTE") {
      const i = e.players.indexOf(this.id);
      this.myActor = i < 0 ? null : (i as MjaiActor);
      if (i < 0) this.warnings.push(`players に自分の playerID が無い: ${this.id}`);
      this.pendingReach = false;
    }

    this.queue.push(...this.encoder.encode(e));
    this.warnings.push(...this.encoder.warnings.splice(0));

    if (!isChoiceReply(e)) return;

    // 選択肢が 1 つも無い家にも選択イベントは配られる（broadcast）。
    // pollReplies は 4 家の返信が揃うまで進まないので、必ず返信する義務がある。
    // 選べるものが無ければ bot に聞かず、その場で「全部選ばない」を返す。
    if (!hasSelectableChoice(e)) {
      this.warnings.push(...applyAction(e, { type: MJAI_TYPE.NONE }));
      this.eventHandler.emit(e);
      return;
    }

    const action = this.ask();
    let reachDahai: MjaiDahaiEvent | undefined;

    // 立直は mjai では宣言と宣言牌が別イベント。mjimage は 1 つで両方決めるので、
    // その場で続きを聞いて宣言牌まで取る（§5.4）。
    if (action.type == MJAI_TYPE.REACH) {
      this.queue.push({ type: MJAI_TYPE.REACH, actor: action.actor });
      const next = this.ask();
      if (next.type == MJAI_TYPE.DAHAI) reachDahai = next;
      else
        this.warnings.push(
          `立直の次に打牌以外が返ってきた: ${next.type}。候補の先頭で進める`
        );
      // 続けて来る REACH イベントでは、もう bot に聞かない（送信済みのため）。
      this.pendingReach = true;
    }

    this.warnings.push(...applyAction(e, action, reachDahai));
    this.eventHandler.emit(e);
  }

  /** 溜めたイベントを bot に渡して行動を 1 つ得る。 */
  private ask(): MjaiAction {
    const events: MjaiEventWithCanAct[] = this.queue.map((v, i) =>
      i == this.queue.length - 1 ? { ...v, can_act: true } : v
    );
    this.queue = [];
    const action = this.bot.react(events);
    if (action == null || typeof (action as { then?: unknown }).then == "function")
      throw new Error(
        `[mjai] bot must answer synchronously; the controller drives replies inline`
      );
    return action;
  }

  /** 自分の席番号。start_game の id に相当する。局が始まるまでは null。 */
  get actor(): MjaiActor | null {
    return this.myActor;
  }

  /** 立直の宣言牌を bot から受け取り済みか（REACH イベントの重複送信を避けるため）。 */
  get reachSent(): boolean {
    return this.pendingReach;
  }

  /** 半荘の終わりに end_game を bot へ流す。 */
  finish() {
    this.queue.push(...this.encoder.finish());
    if (this.queue.length == 0) return;
    const events: MjaiEventWithCanAct[] = this.queue;
    this.queue = [];
    this.bot.react(events);
  }
}
