import type { MjaiBot } from "./session";
import {
  MJAI_TYPE,
  MjaiAction,
  MjaiEventWithCanAct,
  isMjaiAction,
} from "./types";

// 線の向こうにいる bot（別プロセス）を MjaiBot として見せる。
//
// 【2 つの形の違い】
// こちらの内部形は `react(events[])` で「溜まったイベントを渡して行動を 1 つ得る」。
// mjai の線上の約束は **イベント 1 行につき応答 1 行**で、行動しない場面でも bot は
// `{"type":"none"}` を返す。その差をここで吸収する。
//
//   react([tsumo, dora, dahai(can_act)])
//     → "tsumo"  を送って応答を読み捨て
//     → "dora"   を送って応答を読み捨て
//     → "dahai"  を送って応答を採用          ← can_act が立っている最後の 1 つ
//
// 【止まる場所】
// `SyncTransport.exchange` は応答が返るまで**同期で待つ**。controller の進行が
// 同期のコールスタックで回っているため（session.ts の注記）。実装は Node の
// worker + Atomics.wait（worker-transport.ts）。

/** 1 行送って 1 行返るまで同期で待つ通信路。 */
export interface SyncTransport {
  /**
   * 1 行送り、応答の 1 行を返す。
   * 待ち time out や相手の異常終了では null を返す（例外にしない）。
   */
  exchange(line: string): string | null;
  close(): void;
}

export interface StdioBotOptions {
  /** `join` に載せる名前。 */
  name?: string;
  /** `hello` に載せるプロトコル名。既定は原典と同じ "mjsonp"。 */
  protocol?: string;
  protocolVersion?: number;
}

/**
 * stdio（1 行 1 JSON）で喋る bot のアダプタ。
 *
 * 通信路を差し替えられるようにしてあるので、プロセスを起こさずに試せる。
 * 実プロセスに繋ぐには `worker-transport.ts` の `createWorkerTransport` を渡す。
 */
export class StdioBot implements MjaiBot {
  private greeted = false;
  readonly warnings: string[] = [];

  constructor(
    private readonly transport: SyncTransport,
    private readonly options: StdioBotOptions = {}
  ) {}

  react(events: readonly MjaiEventWithCanAct[]): MjaiAction {
    this.greet();

    let last: MjaiAction = { type: MJAI_TYPE.NONE };
    for (const e of events) {
      const reply = this.send(e);
      // can_act が立っていない行への応答は none のはずなので採らない。
      if (e.can_act) last = reply;
    }
    return last;
  }

  /** 接続時の挨拶。`hello` を送り `join` を待つ。 */
  private greet() {
    if (this.greeted) return;
    this.greeted = true;
    const reply = this.exchange({
      type: MJAI_TYPE.HELLO,
      protocol: this.options.protocol ?? "mjsonp",
      protocol_version: this.options.protocolVersion ?? 1,
    });
    if (reply == null) return; // 警告は exchange が積んでいる
    if (reply.type != MJAI_TYPE.JOIN)
      this.warn(`hello への応答が join でない: ${reply.type}`);
  }

  private send(e: MjaiEventWithCanAct): MjaiAction {
    const reply = this.exchange(e);
    if (reply == null) return { type: MJAI_TYPE.NONE };
    return reply;
  }

  /**
   * 1 往復する。読めない応答は `none` に倒して警告を積む。
   *
   * 進行は止めない（controller と同じ方針）。`none` は decode 側で
   * 「打牌が必須の場面なら候補の先頭＝ツモ切り」に安全に倒れる。
   */
  private exchange(payload: unknown): MjaiAction | null {
    const line = this.transport.exchange(JSON.stringify(payload));
    if (line == null) {
      this.warn(`応答が返らなかった（timeout か異常終了）。none で進める`);
      return null;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      this.warn(`応答が JSON として読めない: ${line.slice(0, 120)}`);
      return null;
    }
    if (
      parsed == null ||
      typeof parsed != "object" ||
      typeof (parsed as { type?: unknown }).type != "string"
    ) {
      this.warn(`type の無い応答: ${line.slice(0, 120)}`);
      return null;
    }
    const action = parsed as { type: string };
    if (action.type == MJAI_TYPE.ERROR) {
      this.warn(`bot がエラーを返した: ${line.slice(0, 200)}`);
      return null;
    }
    if (!isMjaiAction(action)) {
      this.warn(`行動として扱えない応答: ${action.type}`);
      return null;
    }
    return action;
  }

  private warn(m: string) {
    this.warnings.push(m);
  }

  close() {
    this.transport.close();
  }
}
