import { Worker } from "node:worker_threads";
import type { SyncTransport } from "./bot";

// 同期の controller から、非同期でしか読めない子プロセスを叩くための橋。
//
// controller の進行は 1 局まるごとが 1 つの同期コールスタックで、途中に中断点が無い
// （session.ts の注記）。一方 Node の子プロセスのパイプは non-blocking で開かれるので、
// `fs.readSync` で素直に待つことはできない（EAGAIN を投げる）。リトライで回すと
// bot の数だけ CPU を焼く。
//
// そこで **I/O を worker に出し、こちらは Atomics.wait で止まる**。
//
//   main（controller）                worker
//   ─────────────────────────        ──────────────────────────
//   postMessage(line)         ─────▶ 子プロセスの stdin へ書く
//   Atomics.wait(...)  ← CPU を       stdout から 1 行読む（非同期でよい）
//                使わず停止    ◀───── SAB に書いて Atomics.notify
//
// postMessage してから wait に入るのが要点。Atomics.notify は event loop を
// 起こさないので、要求の通知は postMessage 側でやる。
//
// **ブラウザでは使えない**（メインスレッドの Atomics.wait が禁止）。Node 専用。

export interface WorkerTransportOptions {
  /** 起動する bot。 */
  command: string;
  args?: readonly string[];
  cwd?: string;
  env?: Record<string, string>;
  /** 1 往復の待ち時間。超えたら null を返す（bot 側は none に倒れる）。既定 10 秒。 */
  timeoutMs?: number;
  /** やり取り 1 行の上限。既定 1 MiB。配牌 4 家ぶんでも数 KB なので十分。 */
  bufferBytes?: number;
}

/** ヘッダは [状態, 長さ] の 2 word。0 = 待ち、1 = 応答あり。長さ -1 は異常終了。 */
const HEADER_WORDS = 2;
const HEADER_BYTES = HEADER_WORDS * 4;

/**
 * worker のソース。文字列で持つのは、ライブラリとして束ねたときに
 * worker のファイルだけ配布物から外れる事故を避けるため（`eval: true` で起こす）。
 */
const WORKER_SOURCE = `
const { parentPort, workerData } = require("node:worker_threads");
const { spawn } = require("node:child_process");

const { sab, command, args, cwd, env, headerBytes } = workerData;
const header = new Int32Array(sab, 0, 2);
const body = new Uint8Array(sab, headerBytes);
const encoder = new TextEncoder();

const child = spawn(command, args, {
  cwd: cwd,
  env: env ? { ...process.env, ...env } : process.env,
  // stderr は親に素通しする。bot 側の落ち方を握りつぶさない。
  stdio: ["pipe", "pipe", "inherit"],
});

/** 読めた行を溜める。要求より先に届くことがあるのでキューにする。 */
const lines = [];
/** 行を待っている解決関数。 */
let waiting = null;
let dead = false;

let buffered = "";
child.stdout.on("data", (chunk) => {
  buffered += chunk.toString();
  let i;
  while ((i = buffered.indexOf("\\n")) >= 0) {
    const line = buffered.slice(0, i).trim();
    buffered = buffered.slice(i + 1);
    if (line.length === 0) continue;
    if (waiting) { const w = waiting; waiting = null; w(line); }
    else lines.push(line);
  }
});

const die = () => {
  dead = true;
  if (waiting) { const w = waiting; waiting = null; w(null); }
};
child.on("exit", die);
child.on("error", die);

const nextLine = () =>
  new Promise((resolve) => {
    if (lines.length > 0) return resolve(lines.shift());
    if (dead) return resolve(null);
    waiting = resolve;
  });

/** 応答を SAB に書いて、待っている main を起こす。 */
const answer = (line) => {
  if (line == null) {
    Atomics.store(header, 1, -1);
  } else {
    const bytes = encoder.encode(line);
    if (bytes.length > body.length) {
      Atomics.store(header, 1, -1);
    } else {
      body.set(bytes);
      Atomics.store(header, 1, bytes.length);
    }
  }
  Atomics.store(header, 0, 1);
  Atomics.notify(header, 0);
};

parentPort.on("message", async (msg) => {
  if (msg && msg.close) {
    child.kill();
    process.exit(0);
  }
  if (dead) return answer(null);
  try {
    child.stdin.write(msg + "\\n");
  } catch (e) {
    return answer(null);
  }
  answer(await nextLine());
});
`;

/**
 * 子プロセスを起こし、同期で 1 往復できる通信路を返す。
 *
 * `exchange` は応答が返るか time out するまでこのスレッドを止める。
 * CPU は消費しない（`Atomics.wait` で眠る）。
 */
export const createWorkerTransport = (
  options: WorkerTransportOptions
): SyncTransport => {
  const capacity = options.bufferBytes ?? 1024 * 1024;
  const timeoutMs = options.timeoutMs ?? 10_000;

  const sab = new SharedArrayBuffer(HEADER_BYTES + capacity);
  const header = new Int32Array(sab, 0, HEADER_WORDS);
  const body = new Uint8Array(sab, HEADER_BYTES);
  const decoder = new TextDecoder();

  const worker = new Worker(WORKER_SOURCE, {
    eval: true,
    workerData: {
      sab,
      command: options.command,
      args: options.args ?? [],
      cwd: options.cwd,
      env: options.env,
      headerBytes: HEADER_BYTES,
    },
  });
  // 対局が終われば閉じる。worker が生きているだけで process が終わらないのを防ぐ。
  worker.unref();

  let closed = false;

  return {
    exchange(line: string): string | null {
      if (closed) return null;
      Atomics.store(header, 0, 0);
      Atomics.store(header, 1, 0);
      worker.postMessage(line);

      // 応答が先に来ていれば "not-equal" ですぐ戻る。どちらでも下で長さを見る。
      const r = Atomics.wait(header, 0, 0, timeoutMs);
      if (r == "timed-out") return null;

      const len = Atomics.load(header, 1);
      if (len < 0) return null; // 異常終了、または 1 行が上限を超えた
      return decoder.decode(body.subarray(0, len));
    },
    close() {
      if (closed) return;
      closed = true;
      worker.postMessage({ close: true });
      void worker.terminate();
    },
  };
};
