# mjai プロトコル対応計画（TypeScript イベント型定義 + 既存実装のラッパー設計）

対象リポジトリ: `/Users/tanaka/dev/src/github.com/konoui/mjimage`
作成日: 2026-08-12

## 0. この文書の位置づけ

現状の対局進行（`src/lib/controller/`）は独自のイベント語彙（`events.ts` の `PlayerEvent`）を持つ。
これを **mjai プロトコルのラッパーで包み**、mjai 準拠のクライアント（Mortal 等）を
そのまま `Controller` のプレイヤーとして接続できるようにする。

この文書は次の 3 つを扱う。

1. mjai プロトコルの仕様調査結果（全イベントの網羅）
2. TypeScript イベント型定義の案（そのまま `src/lib/mjai/types.ts` に置ける形）
3. 既存 `PlayerEvent` との対応表・変換上の論点・ラッパーの設計と実装フェーズ

### 0.1 決定事項

| # | 判断 | 結論 |
| --- | --- | --- |
| 1 | 送出（牌譜出力）と受信（bot 接続）のどちらが主か | **両方**。牌譜も出すし、自作クライアントを Mortal と繋ぐ |
| 2 | Phase 0 の upstream 変更を入れるか | **入れる**。§0.2 のとおり mjai とは独立した欠落なので、未決事項から外した |
| 3 | mjai を公開 API に出すか | **出す**（§6.5）。Phase 0 で足す任意フィールドも公開面に入る |

判断 1 が「両方」なので、フェーズは省略できない。`decode.ts` / `session.ts`（bot 接続）も
`log.ts`（牌譜出力）も作る。

### 0.2 Phase 0 は mjai のための変更ではない

調査の結果、Phase 0 で足す情報は **mjai と無関係に欠けている**ことが分かった。

- **`EndEvent` が和了の最終結果を捨てている（不備）** — `Controller.finalResult()`（`controller.ts:287`）が
  裏ドラと供託を入れて役・翻・符を計算し直しているのに、`notify_end`（`state-machine.ts:561`）は
  `deltas` だけ取り出して残りを捨てる。`TsumoEvent.ret` / `RonEvent.ret` は裏ドラ計算前なので、
  **立直で和了した局の結果をクライアントが正しく表示できない**。`EndEvent` は公開 API に
  出ている（`src/index.ts`）が、このリポジトリ内に消費者がいないので今まで踏まれなかっただけ。
- **`tsumogiri` が語彙に無い（欠落）** — バグではない。他家のツモをマスクするのは情報の境界として
  正しい。ただし手出し／ツモ切りは卓上で全員が見える情報で、人間向けの対局 UI でも要る。
  ホストは知っているのに誰にも伝えていない。

したがって Phase 0 は **mjai の前提ではなく独立した修正**として、単独でコミットしてよい。

### 0.3 不備ではないもの（切り分け）

**選択イベント方式（§5.10）は不備ではない。** mjimage は「返事を待つ 5 種の選択イベントを配り、
4 家の返信が揃うまで進まない」、mjai は「直前のイベントに対して行動を返す」。違うだけで
どちらも正しく、mjimage の方は合法手を先に列挙する分クライアントが楽。

ここを「mjai と違うから直す」と見て controller を作り替えるのは筋が悪い。§6.2 のとおり
`EventHandler` を実装したアダプタを挿すだけで済むので、**controller の語彙は守ったまま
変換層で吸収する**。

---

## 1. 仕様の出典と「3 つの系統」

mjai は単一の厳密な仕様書を持たない。実務上は次の 3 系統が存在し、**フィールド名が一部食い違う**。

| 系統 | 出典 | 特徴 |
| --- | --- | --- |
| **原典（gimite）** | [Mjai 麻雀AI対戦サーバ](https://gimite.net/pukiwiki/index.php?Mjai%20%E9%BA%BB%E9%9B%80AI%E5%AF%BE%E6%88%A6%E3%82%B5%E3%83%BC%E3%83%90) / [gimite/mjai](https://github.com/gimite/mjai)（`lib/mjai/action.rb`） | `hora` / `ryukyoku` に `yakus` `fu` `fan` `hora_points` `uradora_markers` `tenpais` `reason` `scores` まで載る**最も情報量が多い**形 |
| **標準化プロジェクト（Cryolite）** | [Cryolite/mjai](https://github.com/Cryolite/mjai)（`schema/*.json`） | JSON Schema で機械可読。ただし `hora` / `ryukyoku` は **TODO で未定義** |
| **Mortal 系（実装デファクト）** | [Equim-chan/Mortal](https://github.com/Equim-chan/Mortal)（`libriichi/src/mjai/event.rs`）、[smly/mjai.app](https://github.com/smly/mjai.app)、[convlog](https://github.com/NikkeTryHard/tenhou-to-mjai) | `hora` は `actor` `target` `deltas` `ura_markers` のみの**最小サブセット**。`ura_markers`（原典は `uradora_markers`）と名前が違う |

### 1.1 実装方針（結論）

- **送出は原典のスーパーセット**を既定にする。Mortal 系の serde / Python 実装はいずれも未知フィールドを無視するので、`yakus` や `fu` を足しても壊れない。
- 名前が食い違う `uradora_markers` / `ura_markers` は **両方入れる**（`dialect` オプションで切替可能にする）。
- 受信（プレイヤー → ホスト）は**最小サブセットのみを必須**とし、余分なフィールドは無視する。

### 1.2 牌表記（pai notation）

```
数牌: 1m..9m, 1p..9p, 1s..9s
字牌: E(東) S(南) W(西) N(北) P(白) F(發) C(中)
赤牌: 5mr, 5pr, 5sr
非公開: ?
```

`0m` のような赤の別名表記は mjai には無い。

---

## 2. mjai イベント全種（網羅表）

`D` 列: `H→P` = ホストからプレイヤー、`P→H` = プレイヤーからホスト。

| # | type | D | フィールド | 備考 |
| --- | --- | --- | --- | --- |
| 1 | `hello` | H→P | `protocol?` `protocol_version?` `can_act?` | 接続開始の挨拶 |
| 2 | `join` | P→H | `name?` `room?` | `hello` への応答 |
| 3 | `start_game` | H→P | `id?`(0-3) `names?` `seed?` | `id` が自分の席番号。以後 `actor` はこの番号 |
| 4 | `start_kyoku` | H→P | `bakaze` `kyoku`(1-4) `honba` `kyotaku` `oya` `dora_marker` `tehais`(4×13) `scores?` | 配列は**席番号順**（親から順ではない） |
| 5 | `tsumo` | H→P | `actor` `pai` | 他家のツモは `pai:"?"` |
| 6 | `dahai` | 双方向 | `actor` `pai` `tsumogiri` | |
| 7 | `chi` | 双方向 | `actor` `target` `pai` `consumed`(2) | |
| 8 | `pon` | 双方向 | `actor` `target` `pai` `consumed`(2) | |
| 9 | `daiminkan` | 双方向 | `actor` `target` `pai` `consumed`(3) | |
| 10 | `kakan` | 双方向 | `actor` `pai` `consumed`(3) | `target` なし |
| 11 | `ankan` | 双方向 | `actor` `consumed`(4) | `pai` なし |
| 12 | `dora` | H→P | `dora_marker` | カンドラ表示 |
| 13 | `reach` | 双方向 | `actor` | **宣言のみ。打牌は続く `dahai`** |
| 14 | `reach_accepted` | H→P | `actor` `deltas?` `scores?` | 立直棒の供託が成立 |
| 15 | `hora` | 双方向 | `actor` `target` `pai` / (H→P で) `uradora_markers?` `hora_tehais?` `yakus?` `fu?` `fan?` `hora_points?` `deltas?` `scores?` `pao?` | ツモは `actor == target`。P→H は `actor` `target` `pai` のみで足る |
| 16 | `ryukyoku` | 双方向 | `reason?` `tehais?` `tenpais?` `deltas?` `scores?` | P→H は九種九牌の宣言に使う |
| 17 | `end_kyoku` | H→P | （なし） | 1 局の終わり |
| 18 | `end_game` | H→P | （なし。`scores?` を足す実装あり） | 半荘の終わり |
| 19 | `none` | P→H | （なし） | 「何もしない」。**受信したほぼ全イベントへの既定の応答** |
| 20 | `error` | H→P | `message?` `text?` | 原典の語彙にある拡張枠 |

### 2.1 `ryukyoku.reason` の値（gimite `active_game.rb` 由来）

| 値 | 意味 | 親継続 |
| --- | --- | --- |
| `fanpai` | 荒牌平局（通常の流局） | テンパイなら継続 |
| `nagashimangan` | 流し満貫 | 同上 |
| `kyushukyuhai` | 九種九牌 | 継続 |
| `suchareach` | 四家立直 | 継続 |
| `sanchaho` | 三家和 | 継続 |
| `suukaikan` | 四開槓 | 継続（原典に無い**拡張**） |
| `suufonrenda` | 四風連打 | 継続（原典に無い**拡張**） |

### 2.2 `yakus` の識別子（gimite `hora.rb` 由来）

`[["reach",1],["akadora",1],["menzenchin_tsumoho",1]]` のように `[名前, 飜]` の配列。
mjimage の日本語役名との対応は §5.6 に表で示す。

### 2.3 進行のサンプル（原典より、抜粋・整形）

立直〜ツモあがりの 1 巡（`<-` がホスト、`->` がプレイヤー）:

```jsonc
<- {"type":"tsumo","actor":1,"pai":"2m"}
-> {"type":"reach","actor":1}
<- {"type":"reach","actor":1}
-> {"type":"dahai","actor":1,"pai":"7s","tsumogiri":false}
<- {"type":"dahai","actor":1,"pai":"7s","tsumogiri":false}
-> {"type":"none"}
<- {"type":"reach_accepted","actor":1,"deltas":[0,-1000,0,0],"scores":[28000,23000,24000,24000]}
-> {"type":"none"}
```

```jsonc
<- {"type":"tsumo","actor":2,"pai":"2m"}
-> {"type":"hora","actor":2,"target":2,"pai":"2m"}
<- {"type":"hora","actor":2,"target":2,"pai":"2m","uradora_markers":["8p"],
    "hora_tehais":["1m","3m","5m","6m","7m","1p","2p","3p","4p","5pr","6p","W","W","2m"],
    "yakus":[["akadora",1],["reach",1],["menzenchin_tsumoho",1]],
    "fu":30,"fan":3,"hora_points":4000,
    "deltas":[-2100,-1100,6300,-1100],"scores":[25900,21900,29300,22900]}
-> {"type":"none"}
<- {"type":"end_kyoku"}
```

**重要な観測**: 立直は `reach`（宣言）→ `dahai`（宣言牌）→ `reach_accepted`（供託成立）の **3 段**に分かれる。
mjimage の `ReachEvent` は宣言牌を内包した 1 イベントなので、ここが最大の変換点になる（§5.4）。

---

## 3. TypeScript イベント型定義（`src/lib/mjai/types.ts` 案）

既存コードの流儀に合わせる。

- 定数は `as const` のオブジェクト、型は `(typeof X)[keyof typeof X]`（`core/constants.ts` と同じ）
- 直列化された値は `readonly` を付ける（`events.ts` と同じ）
- 判別可能ユニオン + `Record` による網羅性チェック（`events.ts` の `CHOICE_REPLY_TYPES` と同じ手口）

```ts
// ---------------------------------------------------------------------------
// 牌の表記
// ---------------------------------------------------------------------------

/** 数牌の種類。mjai は m/p/s のみ（mjimage の "z" / "_" は持たない）。 */
export type MjaiSuit = "m" | "p" | "s";

/** 数牌。1m..9m, 1p..9p, 1s..9s の 27 種。 */
export type MjaiNumberPai = `${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}${MjaiSuit}`;

/** 字牌。東南西北白發中。 */
export type MjaiHonorPai = "E" | "S" | "W" | "N" | "P" | "F" | "C";

/** 赤牌。 */
export type MjaiRedPai = "5mr" | "5pr" | "5sr";

/** 表向きの牌。 */
export type MjaiPai = MjaiNumberPai | MjaiHonorPai | MjaiRedPai;

/** 非公開の牌。他家の手牌・ツモ牌に現れる。 */
export const MJAI_HIDDEN_PAI = "?" as const;
export type MjaiHiddenPai = typeof MJAI_HIDDEN_PAI;

/** 表向き・非公開のどちらもあり得る牌。 */
export type MjaiMaybeHiddenPai = MjaiPai | MjaiHiddenPai;

/** 場風。`bakaze` に入る。 */
export type MjaiBakaze = "E" | "S" | "W" | "N";

// ---------------------------------------------------------------------------
// 席と局
// ---------------------------------------------------------------------------

/** 席番号。start_game の id で割り当てられ、半荘中は変わらない。 */
export type MjaiActor = 0 | 1 | 2 | 3;

/** 局番号。1-4。 */
export type MjaiKyoku = 1 | 2 | 3 | 4;

/** 席番号順に 4 つ並べた値。 */
export type MjaiQuad<T> = readonly [T, T, T, T];

/** 配牌。常に 13 枚。 */
export type MjaiTehai = readonly [
  MjaiMaybeHiddenPai, MjaiMaybeHiddenPai, MjaiMaybeHiddenPai,
  MjaiMaybeHiddenPai, MjaiMaybeHiddenPai, MjaiMaybeHiddenPai,
  MjaiMaybeHiddenPai, MjaiMaybeHiddenPai, MjaiMaybeHiddenPai,
  MjaiMaybeHiddenPai, MjaiMaybeHiddenPai, MjaiMaybeHiddenPai,
  MjaiMaybeHiddenPai,
];

// ---------------------------------------------------------------------------
// イベント種別
// ---------------------------------------------------------------------------

export const MJAI_TYPE = {
  HELLO: "hello",
  JOIN: "join",
  START_GAME: "start_game",
  START_KYOKU: "start_kyoku",
  TSUMO: "tsumo",
  DAHAI: "dahai",
  CHI: "chi",
  PON: "pon",
  DAIMINKAN: "daiminkan",
  KAKAN: "kakan",
  ANKAN: "ankan",
  DORA: "dora",
  REACH: "reach",
  REACH_ACCEPTED: "reach_accepted",
  HORA: "hora",
  RYUKYOKU: "ryukyoku",
  END_KYOKU: "end_kyoku",
  END_GAME: "end_game",
  NONE: "none",
  ERROR: "error",
} as const;

export type MjaiType = (typeof MJAI_TYPE)[keyof typeof MJAI_TYPE];

/** 流局の理由。原典の 5 種に四開槓・四風連打を足したもの。 */
export const MJAI_RYUKYOKU_REASON = {
  /** 荒牌平局 */
  FANPAI: "fanpai",
  /** 流し満貫 */
  NAGASHIMANGAN: "nagashimangan",
  /** 九種九牌 */
  KYUSHUKYUHAI: "kyushukyuhai",
  /** 四家立直 */
  SUCHAREACH: "suchareach",
  /** 三家和 */
  SANCHAHO: "sanchaho",
  /** 四開槓（原典に無い拡張） */
  SUUKAIKAN: "suukaikan",
  /** 四風連打（原典に無い拡張） */
  SUUFONRENDA: "suufonrenda",
} as const;

export type MjaiRyukyokuReason =
  (typeof MJAI_RYUKYOKU_REASON)[keyof typeof MJAI_RYUKYOKU_REASON];

/** 役。`[識別子, 飜]`。 */
export type MjaiYaku = readonly [name: string, fan: number];

// ---------------------------------------------------------------------------
// 接続
// ---------------------------------------------------------------------------

export interface MjaiHelloEvent {
  type: typeof MJAI_TYPE.HELLO;
  protocol?: string;
  protocol_version?: number;
}

export interface MjaiJoinAction {
  type: typeof MJAI_TYPE.JOIN;
  name?: string;
  room?: string;
}

// ---------------------------------------------------------------------------
// 対局の枠
// ---------------------------------------------------------------------------

export interface MjaiStartGameEvent {
  type: typeof MJAI_TYPE.START_GAME;
  /** 自分の席番号。牌譜（replay mode）では省略される。 */
  id?: MjaiActor;
  names?: MjaiQuad<string>;
  /** 山の再現用の種。実装依存なので unknown で受ける。 */
  seed?: unknown;
}

export interface MjaiStartKyokuEvent {
  type: typeof MJAI_TYPE.START_KYOKU;
  bakaze: MjaiBakaze;
  kyoku: MjaiKyoku;
  /** 本場。 */
  honba: number;
  /** 供託（立直棒）の本数。 */
  kyotaku: number;
  oya: MjaiActor;
  dora_marker: MjaiPai;
  tehais: MjaiQuad<MjaiTehai>;
  /** 原典のサンプルには無いが Mortal 等が必須で読む。 */
  scores?: MjaiQuad<number>;
}

export interface MjaiEndKyokuEvent {
  type: typeof MJAI_TYPE.END_KYOKU;
}

export interface MjaiEndGameEvent {
  type: typeof MJAI_TYPE.END_GAME;
  /** 実装によって付く終局時点の点数。 */
  scores?: MjaiQuad<number>;
}

// ---------------------------------------------------------------------------
// 摸打
// ---------------------------------------------------------------------------

export interface MjaiTsumoEvent {
  type: typeof MJAI_TYPE.TSUMO;
  actor: MjaiActor;
  /** 自分以外のツモは "?"。嶺上牌かどうかは区別しない。 */
  pai: MjaiMaybeHiddenPai;
}

export interface MjaiDahaiEvent {
  type: typeof MJAI_TYPE.DAHAI;
  actor: MjaiActor;
  pai: MjaiPai;
  /** ツモ切りなら true。 */
  tsumogiri: boolean;
}

// ---------------------------------------------------------------------------
// 鳴き
// ---------------------------------------------------------------------------

/** 他家の牌を使う鳴きの共通形。 */
interface MjaiCallFromOtherBase {
  actor: MjaiActor;
  /** 鳴かれた側（牌を出した人）。 */
  target: MjaiActor;
  /** 鳴いた牌。 */
  pai: MjaiPai;
}

export interface MjaiChiEvent extends MjaiCallFromOtherBase {
  type: typeof MJAI_TYPE.CHI;
  /** 手牌から使った 2 枚。 */
  consumed: readonly [MjaiPai, MjaiPai];
}

export interface MjaiPonEvent extends MjaiCallFromOtherBase {
  type: typeof MJAI_TYPE.PON;
  consumed: readonly [MjaiPai, MjaiPai];
}

export interface MjaiDaiminkanEvent extends MjaiCallFromOtherBase {
  type: typeof MJAI_TYPE.DAIMINKAN;
  consumed: readonly [MjaiPai, MjaiPai, MjaiPai];
}

export interface MjaiKakanEvent {
  type: typeof MJAI_TYPE.KAKAN;
  actor: MjaiActor;
  /** ポンに加えた 1 枚。 */
  pai: MjaiPai;
  /** 既にポンしていた 3 枚。 */
  consumed: readonly [MjaiPai, MjaiPai, MjaiPai];
}

export interface MjaiAnkanEvent {
  type: typeof MJAI_TYPE.ANKAN;
  actor: MjaiActor;
  consumed: readonly [MjaiPai, MjaiPai, MjaiPai, MjaiPai];
}

/** 鳴きイベントの総称。 */
export type MjaiCallEvent =
  | MjaiChiEvent
  | MjaiPonEvent
  | MjaiDaiminkanEvent
  | MjaiKakanEvent
  | MjaiAnkanEvent;

// ---------------------------------------------------------------------------
// ドラ・立直
// ---------------------------------------------------------------------------

export interface MjaiDoraEvent {
  type: typeof MJAI_TYPE.DORA;
  dora_marker: MjaiPai;
}

export interface MjaiReachEvent {
  type: typeof MJAI_TYPE.REACH;
  actor: MjaiActor;
}

export interface MjaiReachAcceptedEvent {
  type: typeof MJAI_TYPE.REACH_ACCEPTED;
  actor: MjaiActor;
  /** 立直棒 -1000 の点数移動。原典は載せる、Mortal 系は見ない。 */
  deltas?: MjaiQuad<number>;
  scores?: MjaiQuad<number>;
}

// ---------------------------------------------------------------------------
// 和了・流局
// ---------------------------------------------------------------------------

/**
 * 和了。ツモの場合 `actor == target`。
 *
 * プレイヤーが申告するときは `actor` `target` `pai` だけを埋める。
 * ホストが結果を配るときは点数の内訳まで載せる（原典の形）。
 */
export interface MjaiHoraEvent {
  type: typeof MJAI_TYPE.HORA;
  actor: MjaiActor;
  /** ロンなら放銃者、ツモなら自分。 */
  target: MjaiActor;
  pai: MjaiPai;
  /** 裏ドラ表示牌。原典の名前。 */
  uradora_markers?: readonly MjaiPai[];
  /** 裏ドラ表示牌。Mortal 系の名前。互換のため両方載せる。 */
  ura_markers?: readonly MjaiPai[];
  /** あがり形の手牌（あがり牌を含む）。 */
  hora_tehais?: readonly MjaiPai[];
  yakus?: readonly MjaiYaku[];
  fu?: number;
  /** 飜。役満は実装依存（原典は 13 以上の数を入れる）。 */
  fan?: number;
  /** 供託・積み棒を含まない、手牌だけのあがり点。 */
  hora_points?: number;
  /** 供託・積み棒を含む各家の点数移動。 */
  deltas?: MjaiQuad<number>;
  /** 移動後の各家の持ち点。 */
  scores?: MjaiQuad<number>;
  /** 責任払い（包）の対象。 */
  pao?: MjaiActor;
}

/**
 * 流局。
 *
 * プレイヤーが送る場合は九種九牌の宣言で、`reason` 以外は空でよい。
 */
export interface MjaiRyukyokuEvent {
  type: typeof MJAI_TYPE.RYUKYOKU;
  reason?: MjaiRyukyokuReason;
  /** テンパイ者は開示、それ以外は "?" で埋める。 */
  tehais?: MjaiQuad<readonly MjaiMaybeHiddenPai[]>;
  tenpais?: MjaiQuad<boolean>;
  deltas?: MjaiQuad<number>;
  scores?: MjaiQuad<number>;
}

// ---------------------------------------------------------------------------
// その他
// ---------------------------------------------------------------------------

export interface MjaiNoneAction {
  type: typeof MJAI_TYPE.NONE;
}

export interface MjaiErrorEvent {
  type: typeof MJAI_TYPE.ERROR;
  message?: string;
  text?: string;
}

// ---------------------------------------------------------------------------
// ユニオン
// ---------------------------------------------------------------------------

/** ホストからプレイヤーへ送るイベント。 */
export type MjaiEvent =
  | MjaiHelloEvent
  | MjaiStartGameEvent
  | MjaiStartKyokuEvent
  | MjaiTsumoEvent
  | MjaiDahaiEvent
  | MjaiCallEvent
  | MjaiDoraEvent
  | MjaiReachEvent
  | MjaiReachAcceptedEvent
  | MjaiHoraEvent
  | MjaiRyukyokuEvent
  | MjaiEndKyokuEvent
  | MjaiEndGameEvent
  | MjaiErrorEvent;

/** プレイヤーからホストへ送る応答。 */
export type MjaiAction =
  | MjaiNoneAction
  | MjaiJoinAction
  | MjaiDahaiEvent
  | MjaiCallEvent
  | MjaiReachEvent
  | MjaiHoraEvent
  | MjaiRyukyokuEvent;

/**
 * 行動が可能かをイベントに添えて渡す形。
 * mjai の `hello` にある `can_act` と同じ意図で、Mortal の `EventWithCanAct` 互換。
 * false のイベントに対してプレイヤーは応答しなくてよい。
 */
export type MjaiEventWithCanAct = MjaiEvent & { can_act?: boolean };

/** 牌譜（replay mode）の 1 行。メタ情報を許す。 */
export type MjaiLogLine = MjaiEvent & { meta?: Record<string, unknown> };

// ---------------------------------------------------------------------------
// 網羅性チェック
// ---------------------------------------------------------------------------

/**
 * 応答として受け付ける種別。`Record` なので `MjaiAction` を増やすと
 * ここの追記漏れがコンパイルで止まる（events.ts の CHOICE_REPLY_TYPES と同じ手口）。
 */
const MJAI_ACTION_TYPES: Readonly<Record<MjaiAction["type"], true>> = {
  none: true,
  join: true,
  dahai: true,
  chi: true,
  pon: true,
  daiminkan: true,
  kakan: true,
  ankan: true,
  reach: true,
  hora: true,
  ryukyoku: true,
};

export function isMjaiAction(v: { type: string }): v is MjaiAction {
  return v.type in MJAI_ACTION_TYPES;
}
```

---

## 4. 現状 `PlayerEvent` との対応表

### 4.1 送出方向（mjimage → mjai）

| mjimage `PlayerEvent` | mjai イベント | 1:N | 備考 |
| --- | --- | --- | --- |
| （対局開始時に 1 回） | `hello` → `start_game` | 1:2 | `id` は `players` 配列の添字 |
| `DISTRIBUTE` | `start_kyoku` | 1:1 | 局ごとに風→席の対応表を作り直す |
| `DRAW` | `tsumo` | 1:1 | `subType:"kan"`（嶺上）は mjai に区別が無いので落とす |
| `DISCARD` | `dahai` | 1:1 | `tsumogiri` はラッパー側で算出（§5.5） |
| `CHI` | `chi` | 1:1 | `block` → `pai` + `consumed`（§5.3） |
| `PON` | `pon` | 1:1 | 同上 |
| `DAI_KAN` | `daiminkan` | 1:1 | 同上 |
| `SHO_KAN` | `kakan` | 1:1 | 横向き 2 枚のうち**前側**が加槓牌（§5.3） |
| `AN_KAN` | `ankan` | 1:1 | `consumed` は表向き 4 枚 |
| `NEW_DORA` | `dora` | 1:1 | めくる順序は既に一致（§5.7） |
| `REACH` | `reach` + `dahai` | **1:2** | 宣言と宣言牌に分解（§5.4） |
| `REACH_ACCEPTED` | `reach_accepted` | 1:1 | `deltas` / `scores` はラッパーが算出 |
| `TSUMO` | `hora`（`actor == target`） | 1:1 | 点数の内訳は `END_GAME` を待って確定（§5.8） |
| `RON` | `hora`（`target` = 放銃者） | 1:1 | 同上。ダブロンは 2 通発生しうる |
| `END_GAME` / `WIN_GAME` | `end_kyoku` | 1:1 | 保留した `hora` を確定させてから出す |
| `END_GAME` / `DRAWN_GAME` | `ryukyoku`(`fanpai`) + `end_kyoku` | 1:2 | `tenpais` は `hands` の非空判定から |
| `END_GAME` / `NINE_TERMINALS` | `ryukyoku`(`kyushukyuhai`) + `end_kyoku` | 1:2 | |
| `END_GAME` / `FOUR_KANS` | `ryukyoku`(`suukaikan`) + `end_kyoku` | 1:2 | |
| `END_GAME` / `FOUR_WINDS` | `ryukyoku`(`suufonrenda`) + `end_kyoku` | 1:2 | |
| `CHOICE_AFTER_DRAWN` | （対応物なし） | 1:0 | `can_act` / `possible_actions` として添える |
| `CHOICE_AFTER_DISCARDED` | 同上 | 1:0 | |
| `CHOICE_AFTER_CALLED` | 同上 | 1:0 | |
| `CHOICE_FOR_REACH_ACCEPTANCE` | 同上 | 1:0 | |
| `CHOICE_FOR_CHAN_KAN` | 同上 | 1:0 | 加槓の直後に来る。mjai では `kakan` の後の `hora` が相当 |
| （`startGame()` 終了時） | `end_game` | 0:1 | mjimage に半荘終了イベントが無い（§5.9） |

### 4.2 受信方向（mjai → mjimage の選択返信）

mjimage の返信は「**受け取った選択イベントの `choices` から、選ぶものだけを残して返す**」という約束（`mailbox.ts`）。
選択肢が配列の場合は**先頭が採用される**ため、意図した候補を先頭に並べ替える必要がある。

| mjai 応答 | 返信する選択イベント | `choices` の作り方 |
| --- | --- | --- |
| `none` | 受け取った選択イベント全て | 全キーを `false` に（`DISCARD` が必須の 2 種を除く） |
| `dahai` | `CHOICE_AFTER_DRAWN` / `CHOICE_AFTER_CALLED` | `DISCARD: [指定牌]`、他は `false` |
| `reach` | `CHOICE_AFTER_DRAWN` | `REACH` の候補を**宣言牌が先頭**になるよう並べ替え、他は `false`（§5.4） |
| `chi` | `CHOICE_AFTER_DISCARDED` | `CHI` の候補から `consumed` が一致するブロックを先頭に、他は `false` |
| `pon` | `CHOICE_AFTER_DISCARDED` | `PON` を同様に。赤 5 の有無で候補が分かれる点に注意 |
| `daiminkan` | `CHOICE_AFTER_DISCARDED` | `DAI_KAN` は単一値なのでそのまま残す |
| `kakan` | `CHOICE_AFTER_DRAWN` | `SHO_KAN` の候補から一致ブロックを先頭に |
| `ankan` | `CHOICE_AFTER_DRAWN` | `AN_KAN` を同様に |
| `hora` (ツモ) | `CHOICE_AFTER_DRAWN` | `TSUMO` を残す。**中身は controller が控えで差し替える**ので真偽だけでよい |
| `hora` (ロン) | `CHOICE_AFTER_DISCARDED` / `CHOICE_FOR_REACH_ACCEPTANCE` / `CHOICE_FOR_CHAN_KAN` | `RON` を残す。同上 |
| `ryukyoku` | `CHOICE_AFTER_DRAWN` | `DRAWN_GAME_BY_NINE_TERMINALS: true` を残す |

---

## 5. 変換上の論点（実装前に押さえるべき差分）

### 5.1 席番号（`actor`）と風（`Wind`）

- mjai の `actor` は **半荘中固定の席番号**。
- mjimage の `Wind`（`1z`..`4z`）は **局ごとに回る**（`PlaceManager.nextRound()` が `prevWind` で更新）。

対応表は `DistributeEvent` の 2 つのフィールドから毎局作れる。

```ts
// players は Controller の playerIDs（半荘中不変）＝席番号の基準
const actorOf = new Map<Wind, MjaiActor>();
for (const [id, w] of Object.entries(e.places)) {
  actorOf.set(w, e.players.indexOf(id) as MjaiActor);
}
const oya = actorOf.get(WIND.E)!;
```

点数（`scores`）は `{[playerID]: number}` なので、`players` の順に並べて配列化する。

### 5.2 局の識別子

| mjai | mjimage | 変換 |
| --- | --- | --- |
| `bakaze` | `Round` の 1-2 文字目（`"1z"`..`"4z"`） | `1z→E, 2z→S, 3z→W, 4z→N` |
| `kyoku` | `Round` の 3 文字目 | `Number(round[2])` |
| `honba` | `sticks.dead` | そのまま |
| `kyotaku` | `sticks.reach` | そのまま |

`ROUND.E1 = "1z1"` なので単純な分解でよい。`roundWind()`（`core/wind-util.ts`）を使ってもよい。

### 5.3 牌とブロックの表記変換

**牌 1 枚**（mjimage `Tile.toString()` → mjai）:

1. オペレータ（`t` ツモ / `v` ロン / `-` 横向き / `^` グレースケール）を落とす
2. `_`（裏牌）は `?` にする
3. 数牌はそのまま（`5m` → `5m`）、赤（`r5m`）は `5mr` へ**位置を入れ替える**
4. 字牌は `1z→E 2z→S 3z→W 4z→N 5z→P 6z→F 7z→C`

逆変換も同じ表を使う。mjimage 側に `0m` 形式の赤の別名入力は無い（`aliasOffset` は `w`/`d` のみ）ので、赤は `r` プレフィクス 1 通りに正規化できる。

**鳴きブロック**（`SerializedBlock` → `pai` / `consumed`）:

| ブロック | 横向き（`OP.HORIZONTAL`）の枚数 | `pai` | `consumed` |
| --- | --- | --- | --- |
| `BlockChi` | 1（**必ず index 0**） | `tiles[0]` | 残り 2 枚 |
| `BlockPon` | 1（上家=0 / 対面=1 / 下家=2） | 横向きの 1 枚 | 残り 2 枚 |
| `BlockDaiKan` | 1（上家=0 / 対面=2 / 下家=3） | 横向きの 1 枚 | 残り 3 枚 |
| `BlockShoKan` | **2** | 横向きのうち**添字が小さい方**（加槓牌） | 残り 3 枚 |
| `BlockAnKan` | 0 | （なし） | 表向き 4 枚（`tiles`、`tilesWithBack` ではない） |

`BlockShoKan.fromPon()` が加槓牌をポン牌の**直前に挿入**するため、加槓牌は必ずポン牌より小さい添字になる（`core/block.ts`）。
横向きの位置は `getCallBlockIndex()`（`controller/call-index.ts`）が決めており、鳴かれた相手との位置関係で変わるので、**添字を決め打ちにしない**。

### 5.4 立直の 3 段分解（最重要）

mjai:

```
tsumo → (bot) reach → reach → (bot) dahai → dahai → reach_accepted
```

mjimage:

```
CHOICE_AFTER_DRAWN → (返信 REACH) → REACH（宣言牌入り）
  → CHOICE_FOR_REACH_ACCEPTANCE（他家のロン確認）→ REACH_ACCEPTED
```

つまり mjimage は**宣言と宣言牌を同時に決める**。さらに `mailbox.ts` の `afterDrawn` は
`candidates[0].tile` を宣言牌に採るので、bot が選んだ牌を**候補配列の先頭に並べ替える**必要がある。

ラッパーの手順（`CHOICE_AFTER_DRAWN` を受けたとき）:

1. bot に `tsumo` を渡す → 応答が `reach` だった
2. **その場で** bot に `{"type":"reach","actor":me}` を送り返し、続く `dahai` を受け取る（mjai の規約どおり）
3. `e.choices.REACH` を、`dahai.pai` に一致する `SerializedTileAnalysis` が先頭に来るよう並べ替える
4. 他の `choices` を `false` にして返信する
5. 後で来る `REACH` イベントでは、**もう bot に `reach` / `dahai` を送らない**（送信済みのため）。代わりに他家向けには `reach` + `dahai` の 2 本を出す

`doReach()` の候補は「立直できる打牌」の一覧なので、bot が指定した牌が候補に無い場合（バグ・不正）は
候補先頭のまま進め、`logger.error` に残す（controller と同じ「進行は止めない」方針）。

### 5.5 `tsumogiri` の算出

mjimage には**ツモ切りの記録が無い**。`DiscardEvent` は `tile` だけを持ち、
`mailbox.ts` の `DISCARD` 分岐は `OP.TSUMO` を明示的に落としている。

ラッパーが自分で追跡する:

```ts
// DRAW を受けたら覚える。他家は "_" なので "?" 相当として扱う。
lastDrawn[iam] = tile;
// DISCARD / REACH のとき
const tsumogiri = lastDrawn[iam] != null && sameTile(lastDrawn[iam], discarded);
lastDrawn[iam] = null; // 打牌・鳴きで無効化
```

他家の `DRAW` は裏牌（`_`）で来るので、**per-player のラッパーでは他家の `tsumogiri` を判定できない**。

**observer は別**（当初の記述を訂正）。`controller.ts` の `applyToObserver` は `iam` を持つイベントについて
`e.wind == e.iam` のコピー、つまり**マスクされていない方**だけを observer に渡している。
したがって `c.observer.eventHandler` に繋いだラッパー（§6.4 の牌譜出力）は、
**4 家全員の `tsumogiri` を upstream 変更なしに算出できる**。

経路ごとに必要な変更が違う。

| 目的 | 経路 | `tsumogiri` | `hora` の役・符・裏ドラ |
| --- | --- | --- | --- |
| 牌譜出力（Phase 4） | observer | 変換層で算出できる | **`EndEvent.ret` が要る**（§5.8） |
| bot 接続（Phase 3/5） | per-player | **upstream 変更が要る** | 不要（Mortal は `deltas` しか見ない） |

判断 1 が「両方」なので、結局どちらも要る。

対策の選択肢:

- (a) 河の位置で判定する: 「打牌牌が手牌に無かった」判定が要るので、per-player では自分以外に使えない
- **(b) `DiscardEvent` に `tsumogiri: boolean` を足す**（採用）: `state-machine.ts` の `notify_discard` で
  `event.tile` と `c.hand(iam).drawn` を比較して立てる。1 箇所の追加変更で全員分が正確になる
- (c) 常に `false` にする（Mortal の推論精度が落ちるので非推奨）

**(b) を採用**。`events.ts` への追加は任意フィールドにすれば後方互換。実際の差分は Phase 0 に示す。

**タイミング**: observer の手牌が更新されるのは `broadcast` の中で `DISCARD` が emit された時点
（`controller.ts` の `applyToObserver` → `actor.ts` の `applyDiscard`）なので、
`notify_discard` の**冒頭で** `c.hand(iam).drawn` を読む。`broadcast` の後では消えている。

### 5.6 役名の対応表

mjimage は日本語名（`calculator/yaku.ts`）、mjai は gimite 由来のローマ字識別子。

| mjimage | mjai | 備考 |
| --- | --- | --- |
| 立直 | `reach` | |
| ダブル立直 | `double_reach` | |
| 一発 | `ippatsu` | |
| 門前清自摸和 | `menzenchin_tsumoho` | |
| 平和 | `pinfu` | |
| 断么九 | `tanyaochu` | |
| 一盃口 | `ipeko` | |
| 二盃口 | `ryanpeko` | |
| 自風 | `jikaze` | |
| 場風 | `bakaze` | |
| 白 / 發 / 中 | `sangenpai` | **mjai は 1 エントリに枚数分の飜をまとめる**。3 つ出たら `["sangenpai",3]` |
| 嶺上開花 | `rinshankaiho` | |
| 搶槓 | `chankan` | |
| 海底摸月 | `haiteiraoyue` | ツモ側 |
| 河底撈魚 | `hoteiraoyui` | ロン側 |
| 七対子 | `chitoitsu` | |
| 三色同順 | `sanshokudojun` | |
| 三色同刻 | `sanshokudoko` | |
| 一気通貫 | `ikkitsukan` | |
| 対々和 | `toitoiho` | |
| 三暗刻 | `sananko` | |
| 三槓子 | `sankantsu` | |
| 小三元 | `shosangen` | |
| 混老頭 | `honroto` | |
| 混全帯么九 | `honchantaiyao` | |
| 純全帯么九 | `junchantaiyao` | |
| 混一色 | `honiso` | |
| 清一色 | `chiniso` | |
| 国士無双 | `kokushimuso` | |
| 国士無双13面待ち | `kokushimuso` | **mjai に区別が無い**。飜だけ倍で表現 |
| 九蓮宝燈 | `churenpoton` | |
| 四暗刻 | `suanko` | |
| 四暗刻単騎待ち | `suanko` | 同上（区別なし） |
| 大三元 | `daisangen` | |
| 字一色 | `tsuiso` | |
| 清老頭 | `chinroto` | |
| 四槓子 | `sukantsu` | |
| 小四喜 | `shosushi` | |
| 大四喜 | `daisushi` | |
| 緑一色 | `ryuiso` | |
| ドラ | `dora` | |
| 赤ドラ | `akadora` | |
| 裏ドラ | `uradora` | |
| （未実装） | `tenho` / `chiho` | mjimage に天和・地和が無い |

対応表は `Record<string, string>` ではなく **`Record<日本語名, mjai名>` を `satisfies` で全役名から生成**し、
役を足したときに漏れが分かるようにする（`yaku.ts` の役定義から名前の union 型を導出できるとよい）。

### 5.7 新ドラをめくる順序

すでに mjai / 天鳳の慣習と一致している（`state-machine.ts`）。

| カン | mjimage | mjai |
| --- | --- | --- |
| 暗槓 | `AN_KAN` の直後に `NEW_DORA`（`notify_new_dora_if_needed`） | `ankan` → `dora` → `tsumo` |
| 加槓・大明槓 | `pendingNewDora` に予約し、**打牌の後**に `NEW_DORA`（`notify_new_dora_if_pending`） | `kakan`/`daiminkan` → …→ `dahai` → `dora` |

**変換不要**。順序をそのまま流せばよい。

### 5.8 `hora` の情報が足りない（Phase 0 で補完する）

mjai の `hora` は最終的な `fu` / `fan` / `hora_points` / `uradora_markers` / `deltas` を求めるが、
mjimage のイベントには**どちらにも揃っていない**。

| 必要な値 | `RonEvent` / `TsumoEvent` の `ret` | `EndEvent` |
| --- | --- | --- |
| `yakus` `fu` `fan` | ある（ただし**裏ドラ計算前**） | ない |
| `hora_points` | ある（`pointsWithoutSticks`、裏ドラ前） | ない |
| `uradora_markers` | **ない**（`getBaseBoardParams` は `hiddenDoraIndicators` を渡さない） | ない |
| `deltas` | ある（裏ドラ前） | **ある（最終値）** |
| `scores` | ない | ある（**移動前**の点数） |

`Controller.finalResult()` が裏ドラと供託を入れて再計算しているが、その結果は
`notify_end` で `deltas` だけ取り出され、他は捨てられている。

これは mjai と無関係の**不備**（§0.2）。`EndEvent` を受け取るクライアントは、立直で和了した局の
役・翻・符を正しく表示できない。したがって次の変更は「mjai のための upstream 変更」ではなく
**それ自体で価値のある修正**として Phase 0 で入れる（追加のみ・後方互換）。

```ts
export interface EndEvent {
  // ...既存のまま
  /** WIN_GAME のときだけ入る、裏ドラと供託を含めた最終のあがり結果。 */
  ret?: SerializedWinResult;
}
```

`state-machine.ts` の `notify_end` は既に `finalResults` を持っているので、`ret: serializeWinResult(finalResults)` を足すだけ。
これで `yakus` / `fu` / `han` / `points` / `boardContext.hiddenDoraIndicators` が全部揃う。

> 却下した代替案: ラッパーに `Controller` の参照を渡して `wall.hiddenDoraIndicators` を直接読む方法は、
> 層を跨ぐので採らない。`deltas` だけ載せる最小形（Mortal 系互換）は bot 接続には足りるが、
> 判断 1 が「両方」なので牌譜側で成立しない。

**`scores` の注意**: `EndEvent.scores` は `c.scoreManager.summary` を `emit` の**前**に読んでいるので
「移動前」の点数。mjai の `scores` は移動後なので `scores[i] + deltas[i]` を出す。

**`hora_tehais`**: `ret.hand`（ブロック分解）を平坦化して作る。鳴きブロックは既に `chi`/`pon`/`kan` で
伝えているので、**門前部分 + あがり牌**に絞るのが原典のサンプルと整合する。

### 5.9 `end_kyoku` / `end_game` の粒度

- mjimage の `END_GAME` は**局の終わり**（名前に反して半荘ではない）→ `end_kyoku` に対応。
- 半荘の終わりは `Controller.startGame()` のループが抜けた時点で、**イベントが出ない**。

ラッパーは次のどちらかで `end_game` を出す。

- **(a)** ラッパーに明示的な `finish()` を持たせ、`startGame()` の後に呼ぶ（薄い・確実）
- **(b)** `EndEvent` に「半荘終了」を示すフィールドを足す（`Controller` の `endRound` 判定が `startGame` 側にあるので、状態機械からは見えない）

**(a) を推奨**。

### 5.10 選択イベントに mjai の対応物が無い

mjimage は**返事を待つ 5 種**（`isChoiceReply`）を別イベントとして送る。mjai にはこれが無く、
「直前のイベントに対して行動を返す」設計。しかも:

- mjimage は `CHOICE_AFTER_DISCARDED` / `CHOICE_FOR_REACH_ACCEPTANCE` / `CHOICE_FOR_CHAN_KAN` を
  **選択肢が 1 つも無い家にも配る**（`broadcast`）
- `pollReplies` は **4 家全員の返信が揃うまで進まない**（`events.length != winds.length` で throw）

よって**ラッパーは必ず全ての選択イベントに返信する**義務がある。
選択肢が空なら bot に問い合わせず、その場で「全 `false`」を返す。

bot に選択肢の内容を伝える手段としては、原典の語彙にある拡張枠を使う:

- `can_act?: boolean` — Mortal の `EventWithCanAct` 互換。**必須**
- `possible_actions?: MjaiAction[]` — `choices` を mjai の行動として列挙したもの（任意）
- `cannot_dahai?: MjaiPai[]` — 食い替え禁止牌（`CHOICE_AFTER_CALLED` の `DISCARD` の補集合）

`possible_actions` を出すと bot 側で合法手の再計算が不要になるが、Mortal 系は自前で計算するため
**Phase 3 以降の任意項目**とする。

### 5.11 その他

- **3 人麻雀**: mjai の schema は 3 人（`minItems: 3`）を許すが、mjimage は 4 人固定（`WIND` の 4 値、`createWindMap`）。**対象外**。
- **ダブロン**: mjimage は `prioritizeDiscardedEvents` が同順位を全員返すが、`mailbox.ts` は先頭 1 人だけを採用（頭ハネ）。mjai 側の想定と一致するので変換不要。
- **`DRAW` の `subType:"kan"`**: mjai の `tsumo` は嶺上牌を区別しない。落として問題ない（直前の `ankan`/`kakan`/`daiminkan` から自明）。
- **`CHOICE_FOR_CHAN_KAN` は暗槓でも飛ぶ**（`RON` は常に `false`）。mjai には対応物が無いので、`can_act: false` で流す。
- **一発・フリテンの状態**は controller 側（`oneShotMap` / `missingMap`）が持ち、イベントに出ない。mjai も出さないので問題なし。

---

## 6. ラッパーの設計

### 6.1 ファイル構成

```
src/lib/mjai/
├── types.ts      §3 の型定義。依存なし（core も import しない）
├── pai.ts        Tile ⇄ MjaiPai の相互変換（§5.3）
├── yaku.ts       日本語役名 → mjai 識別子の対応表（§5.6）
├── encode.ts     PlayerEvent → MjaiEvent[]（送出）
├── decode.ts     MjaiAction → ChoiceReply（受信）
├── session.ts    MjaiPlayer: EventHandler を実装するアダプタ
├── bot.ts        Bot インターフェースと stdio 実装
├── log.ts        replay mode（mjson 牌譜）の書き出し
└── index.ts      外向きの公開面（barrel）
```

`types.ts` を `core` に依存させないのがポイント。mjai の型だけを使う利用者（bot 実装者）が
牌クラスを引き込まずに済む。

### 6.2 中心となる抽象

既存の `PlayerSession` は `{ id, handler: EventHandler }` を要求するだけなので、
**`EventHandler` を実装したアダプタを作れば `Controller` に無改造で挿せる**。

```ts
/** mjai の bot。events を渡すと行動を 1 つ返す。 */
export interface MjaiBot {
  /** 直前の flush 以降に発生したイベントを渡し、行動を得る。 */
  react(events: readonly MjaiEventWithCanAct[]): Promise<MjaiAction> | MjaiAction;
}

/**
 * 1 プレイヤー分の mjai アダプタ。
 * Controller から見ると Player と同じ EventHandler にすぎない。
 */
export class MjaiPlayer {
  constructor(playerID: string, handler: EventHandler, bot: MjaiBot);
  /** 半荘の終わりに end_game を流す。 */
  finish(): void;
}
```

`Player`（`controller/player.ts`）と同じ形にしておくと、`createLocalGame` の
`playerInjection` にそのまま差し込めるので、既存のシナリオテストで検証できる。

### 6.3 イベントのキュー（送出タイミング）

mjimage は「盤面を伝えるイベント」と「返事を求める選択イベント」を**別々に**送る。
bot は 1 回の `react` で 1 行動を返すので、**選択イベントを区切りにしてまとめて渡す**。

```
mjimage の到着順               ラッパーの動作
─────────────────────────────  ────────────────────────────────────────────
DISCARD (他家)                 queue に dahai を積む（bot に渡さない）
NEW_DORA                       queue に dora を積む
CHOICE_AFTER_DISCARDED         選択肢あり → queue を can_act:true で flush、
                               bot の応答を ChoiceReply に変換して emit
                               選択肢なし → can_act:false で flush、
                               その場で「全 false」を emit（bot を待たない）
```

これで bot が受け取る列は mjai のサンプルどおりの順序になり、`can_act` が立った最後の
イベントに対して行動を返す形に収まる。

`END_GAME` / `hora` は §5.8 のとおり `hora` を保留して `END_GAME` で確定させるので、
`hora` → `end_kyoku` の 2 本をまとめて flush する。

### 6.4 replay mode（牌譜出力）

同じ `encode.ts` を、マスクせず（`?` を実牌に）通せば mjson 牌譜になる。
`Observer`（`controller/actor.ts`）は全員分の盤面を持つので、**observer の
`EventHandler` に `log.ts` を繋ぐだけ**で牌譜が取れる。

```ts
const logger = new MjaiLogWriter();
controller.observer.eventHandler.on((e) => logger.write(e));
// logger.toString() で 1 行 1 JSON の mjson が得られる
```

`Controller.export()` / `Replayer` の `RoundHistory` は「山＋選択の記録」で、
mjai 牌譜とは別物（再現用）。両方を並立させる。

### 6.5 公開 API

`src/index.ts` は `export *` を使わず公開面を明示する方針なので、次を追加する。

```ts
// mjai プロトコル。型と変換だけを出し、bot の実行方法（stdio / WebSocket）は出さない。
export type {
  MjaiPai, MjaiActor, MjaiEvent, MjaiAction, MjaiEventWithCanAct,
  /* 各イベント型 */
} from "./lib/mjai/types";
export { MJAI_TYPE, MJAI_RYUKYOKU_REASON, isMjaiAction } from "./lib/mjai/types";
export { MjaiPlayer } from "./lib/mjai/session";
export type { MjaiBot } from "./lib/mjai/bot";
export { MjaiLogWriter } from "./lib/mjai/log";
```

---

## 7. テスト戦略

### 7.1 前提: 自作の検証だけでは「準拠」を示せない

`encode.ts` を自作の期待値で確かめても、**エンコーダと検証コードが同じ誤解を共有する**（フィールド名、
`reach` の 3 段分解、`consumed` の並び）ので準拠の証明にならない。二段構えにする。

1. **先に validator を書き、外部の正しい mjson で較正する**（正しいログを弾かないことを確認）
2. **較正済みの validator を自分の出力に当てる**

順序が逆だと validator が自分のバグに合わせて緩くなる。**層 0 を Phase 2 より先に着手する**こと。

### 7.2 層の一覧

| 層 | 確かめること | 使う道具 | CI |
| --- | --- | --- | --- |
| 0 | validator 自体が正しい | 外部 mjson を `__tests__/__fixtures__/mjai/*.jsonl` に固定 | ○ |
| 1 | 牌・役名の往復 | `TILE_NUMBERS`（`core/constants.ts`）/ `yaku.ts` から全網羅生成 | ○ |
| 2 | 出力が型・スキーマに適合 | valibot | ○ |
| 3 | イベント列がプロトコルとして整合 | `createScenario` + `recordEvents` + validator | ○ |
| 4 | 変換が可逆 | `createLocalGame({ playerInjection })` に `MjaiPlayer` | ○ |
| 5 | fuzz（多数の半荘） | `src/e2e/` の仕組みを流用 | nightly |
| 6 | 実装デファクトが読めるか | Mortal / mjai.app | 手動のみ |

対応する実装フェーズは §8 の各「検証」節に書く。

### 7.3 層 0: 外部 golden ログによる validator の較正

§9 に挙げた実装（`smly/mjai.app`、`Equim-chan/Mortal` の `libriichi`、`tenhou-to-mjai` の変換出力）から
mjson 牌譜を数本取り、fixture としてコミットする。**どのリポジトリのどのファイルが使えるかは着手時に要確認**。

validator は「これらを 1 件も弾かない」ことをテストで固定する。弾いたら validator が厳しすぎる（＝
mjimage 側を不当に縛る）ということなので、validator を直す。

> 注: 外部ログのライセンス表記を確認し、出典を fixture のヘッダコメントに残すこと（§9 の 6 番）。

### 7.4 層 2: スキーマ検証は ajv ではなく valibot

valibot は既に依存にある（`src/lib/input/table-schema.ts` で使用中）。Cryolite の `schema/*.json` は
`hora` / `ryukyoku` が TODO（§1）なので、どのみち自作部分が要る。ajv を足す見返りが薄い。

**valibot スキーマは `types.ts` ではなく `__tests__` 側に置く。** スキーマを正として `InferOutput` で
型を導出すれば一元化できるが、§6.1 の「`types.ts` は依存なし」方針（bot 実装者に余計なものを
引き込ませない）と衝突する。テスト専用に置けば公開面が汚れず、二重管理のずれは「テストが落ちる」形で
必ず顕在化する。

### 7.5 層 3: validator が見る不変条件

形式だけでなく**イベント列から盤面を再構築する**と、変換バグをほぼ全部捕まえられる。

構造:

- `start_kyoku` の `tehais` が全て 13 枚
- `actor` が 0-3 に収まる
- 全イベントが §3 の型（および層 2 のスキーマ）に適合する

進行:

- 各家の手牌枚数が常に 13 or 14（鳴きは 3 枚を 1 面子として数える）
- `dahai` の直前に必ず同じ `actor` の `tsumo` か鳴きがある
- 場に見えた同一牌が 5 枚を超えない（赤 5 は `5m` と別枠にせず合算する）
- `consumed` の各牌が、その時点でその `actor` の手牌にある
- `reach` → 同じ actor の `dahai` → `reach_accepted` がこの順で、間に他家の行動が挟まらない
- `hora.pai` が直前の `tsumo.pai`（ツモ和了）または `dahai.pai`（ロン）と一致

点数:

- **`sum(deltas) + 供託の増減 == 0`** — 点棒の保存則。§5.8 の「移動前 `scores` + `deltas`」変換の
  バグに直接効くので、最優先で入れる

応答:

- `can_act: true` のイベントに対して応答がちょうど 1 つ

### 7.6 層 4 が最も費用対効果が高い

`mailbox.ts` の `pollReplies` は **4 家の返信が揃わないと throw する**ので、`MjaiPlayer` を 4 席に
差し込んで半荘を完走できた時点で、§5.10 の「全ての選択イベントに返信する義務」が自動的に検証済みになる。
固定 seed で `Player` 直結と結果が一致すれば、encode/decode が可逆である強い証拠。

### 7.7 層 5: fuzz

`src/e2e/index.ts` の「ランダムに対局を回し、落ちた対局だけ `games.json` に残す」仕組みがそのまま使える。
N 半荘回して全出力を validator に通す。`Replayer` が決定的なので、**落ちた seed をそのまま回帰テストに
落とせる**。

### 7.8 層 6 だけが本当の「準拠」の証明

Mortal の `libriichi` は Rust の serde で厳格にデシリアライズするので、そこを通ることが最終関門。
ただし CI には載せない（Phase 5 の判断）。

### 7.9 スナップショットの形式

`toMatchFileSnapshot` が既に使われている（`__tests__/table.test.ts` / `image.test.ts`、パスは
`utils/helper.ts` の `snapshotPath`）ので、それに合わせる。

`__snapshots__/mjai.<scenario>.jsonl` に **1 行 1 JSON** で出す。1 ファイル 1 JSON 配列より diff が
読みやすく、そのまま外部ツールに食わせられる。

### 7.10 Phase 0 で足したフィールドもテストで固定する

`tsumogiri`（§5.5）と `EndEvent.ret`（§5.8）は**後から静かに壊れると mjai 出力の質だけが落ちて
誰も気づかない**。`controller-scenario.test.ts` に直接アサートを置く。

- ツモ切りと手出しを 1 回ずつ含む台本で、`DiscardEvent.tsumogiri` の真偽が両方出ること
- 裏ドラが乗る和了で、`EndEvent.ret` の `han` が `TsumoEvent.ret`（裏ドラ前）より大きいこと

---

## 8. 実装フェーズ

各フェーズは単独でコミット可能・テスト可能な単位にする。

### Phase 0: イベント語彙の補完（mjai とは独立）— **完了**

実装済み。`npx tsc --noEmit` / `npm test`（366 件）/ `npm run e2e test` / `npm run build` すべて通過。
`npm run e2e game 30` でも `games.json` は空のまま（落ちた対局なし）。

- `events.ts`: `EndEvent.ret?` / `DiscardEvent.tsumogiri?` / `ReachEvent.tsumogiri?`
- `state-machine.ts`: `isTsumogiri()` ヘルパーを追加し、`notify_discard` / `notify_reach` / `notify_end` で使う
- `controller-scenario.test.ts`: 「ツモ切りの記録」「和了結果の確定値」の 2 グループ（計 5 件）

§0.2 のとおり、これは mjai の下ごしらえではなく**それ自体で価値のある修正**。
mjai の実装を待たずに単独でコミットしてよい。`events.ts` / `state-machine.ts` に**追加のみ**の
変更を入れるので、既存利用者は壊れない。

実測した差分は **2 ファイル・約 8 行**。既存の分岐は 1 つも触らない。

| 変更 | 内訳 | 行数 | 中身 |
| --- | --- | --- | --- |
| `EndEvent.ret?: SerializedWinResult` | `events.ts` +1 / `state-machine.ts` +1 | **2** | `notify_end` の `WIN_GAME` 分岐。`finalResults` は既にスコープにあり、`serializeWinResult` も import 済みなので `ret: serializeWinResult(finalResults)` を足すだけ（§5.8） |
| `DiscardEvent.tsumogiri?: boolean` | `events.ts` +1 / `state-machine.ts` +2 | **3** | `notify_discard` で `broadcast` の**前**に `c.hand(iam).drawn` と比較（§5.5 のタイミング注記） |
| `ReachEvent.tsumogiri?: boolean` | `events.ts` +1 / `state-machine.ts` +2 | **3** | `notify_reach` で同じ。宣言牌がツモ切りのことがある |

比較は赤を区別する必要がある。`drawn` は `OP.TSUMO` 付きで、`event.tile` は素の牌なので、
`hand.ts` と同じ手口（`t.equals(drawn) && drawn.has(OP.RED) == t.has(OP.RED)`）を使う。

**e2e への影響なし**: `npm run e2e test` が再生する `RoundHistory` は `choiceEvents`（選択イベント）
だけを記録していて、通知イベントは持たない。フィールドを足しても再生は壊れない。

**検証（§7.10）**: 既存の `controller-unit.test.ts` / `controller-scenario.test.ts` が通ること。
加えて `controller-scenario.test.ts` に、後退を検知するアサートを置く。

- ツモ切りと手出しを 1 回ずつ含む台本で、`DiscardEvent.tsumogiri` の真偽が両方出ること
- 裏ドラが乗る和了で、`EndEvent.ret` の `han` が `TsumoEvent.ret`（裏ドラ前）より大きいこと

### Phase 1: 型定義と牌の変換 — **完了**

`types.ts` / `pai.ts` / `yaku.ts` を作る。ロジックは純関数のみ。

**検証（層 1）**: 全 34 牌 + 赤 3 種 + `?` の往復変換（`Tile → MjaiPai → Tile`）を網羅する
プロパティテスト。`TILE_NUMBERS`（`core/constants.ts`）から生成すれば漏れない。
役名は `yaku.ts` の全定義を回して未対応が無いことを確認する。

実装済み。`__tests__/mjai-pai.test.ts` に 14 件（全体で 380 件）。

- 表向き 37 種（数牌 27 + 字牌 7 + 赤 3）を `TILE_NUMBERS` から生成して往復・重複なしを確認
- 役名は `YAKU` / `YAKUMAN` + ドラ 3 種を回して、**未対応が無いことと余分が無いことの両方**を検査
  （改名したときに古い名前が表に残るのを防ぐ）

**§5.6 の訂正**: 「`satisfies` で全役名から生成して漏れをコンパイルで止める」は**できない**。
`YAKU` / `YAKUMAN` は `readonly YakuDef[]` として宣言されていて `name` が `string` に広がるため、
リテラルの union を導出できない。`as const satisfies` に変える upstream 変更も考えられるが、
上記のテストで同じ保証が得られるので採らなかった。

**公開 API はまだ触らない**。§6.5 の輸出リストは `MjaiPlayer` / `MjaiBot` / `MjaiLogWriter` を
含むので、半端な面を先に出して後から変えるより、ラッパーが揃う Phase 5 でまとめて足す。

### Phase 1.5: validator（`__tests__` 側）— **完了**

**Phase 2 より先に着手する**（§7.1）。層 2 の valibot スキーマと、層 3 の盤面再構築 validator を書く。

**検証（層 0）**: 外部の mjson 牌譜を `__tests__/__fixtures__/mjai/` に固定し、
validator が 1 件も弾かないことを確認する（§7.3）。弾いたら validator を直す。
この工程を通していない validator は、自分のバグに合わせて緩くなっているとみなす。

実装済み。`utils/mjai-schema.ts` / `utils/mjai-validator.ts` と `mjai-validator.test.ts`（25 件）。

較正の結果、**外部ログ 2021 イベントを 0 件で通過**した（gimite の食い替えログ 6 件 +
1 半荘 2015 件）。あわせて、validator が実際に発火することを 16 件の否定テストで固定してある
（正しいログを通すだけの検査は、何も見ていない validator でも緑になるため）。

較正で分かったことは §9-6 の解決とあわせて `__fixtures__/mjai/README.md` に書いた。要点は 3 つ。

1. **ライセンス**: Mortal / mjai.app はいずれも **AGPL-3.0** で、MIT のこのリポジトリには
   同梱できない（外部プロセスとして使う Phase 5 は問題ない）。**gimite/mjai は New BSD** なので
   同梱できる。作者が手で書いた `test/kuikae.mjson`（6 件）と、1 半荘ぶんの
   `test.mjlog.golden.log`（2015 件）の両方を取り込んだ。後者は**天鳳の対局記録から
   変換したもの**だが、事実の記録であること・出典が明示できること・作者自身がテストデータとして
   配布していることから、経緯を `README.md` に明記した上で同梱する判断をした。
2. **原典の実ログは方言が違う**: `start_kyoku` が `oya` と `dora_marker` しか持たず、配牌は
   `haipai` という別イベントで来る。`dahai` に `tsumogiri` が無く、`hora` も最小形。
   今の形（`bakaze` などを持つ `start_kyoku`）を広めたのは Mortal 系で、そのログは AGPL のため
   較正に使えない。**validator には `dialect`（`"legacy"` / `"strict"`）を持たせた**。
3. **§5.7 の記述が実ログと食い違う**（下記）。

### §5.7 の訂正: 大明槓の新ドラは打牌の前にめくられている

§5.7 は「加槓・大明槓は `dahai` → `dora` の順なので変換不要」と書いたが、原典の実ログは

```
daiminkan → tsumo（嶺上）→ dora → dahai
```

の順で、**新ドラが打牌の前**に来る。mjimage は `pendingNewDora` に予約して打牌の後にめくる
（`notify_new_dora_if_pending`）ので、**順序がそのまま一致するとは限らない**。

これは「どちらが正しい」という話ではなくローカルルールの差（大明槓の新ドラをいつめくるか）で、
Mortal 系がどちらも受け付けるかは Phase 5 まで確定しない。よって **Phase 2 では mjimage の順序を
そのまま流し、この差分を既知の相違として残す**。validator は `dora` を「行動の連なりを切らない
場の出来事」として扱うので、どちらの順序でも通る。

### §7.5 の訂正: 点棒の保存則は「総和 0」ではない

§7.5 に `sum(deltas) + 供託の増減 == 0` と書いたが、そのままでは実装できない。
和了では供託（1000 の倍数）に加えて**積み棒（1 本場 300 点）**が場から和了者へ流れるので、
`deltas` の総和は 1000 の倍数にすらならない（1 本場だけなら 300）。
`start_kyoku` の `honba` / `kyotaku` まで見れば厳密に照合できるが、原典の古いログはそれを持たない。

実装した不変条件は次の 3 つ。

- 総和が 100 点単位であること（麻雀の点数はすべて 100 点単位）
- 和了では総和が 0 以上（場から点棒が減らない）
- 流局では総和がちょうど 0（場から点棒が出入りしない）

### Phase 2: 送出方向（`encode.ts`）— **完了**

`PlayerEvent` → `MjaiEvent[]`。状態を持つのは次の 3 つだけ。

- `Wind → MjaiActor` の対応表（`DISTRIBUTE` で作り直す）
- 保留中の `hora`（`END_GAME` で確定）
- `REACH` の分解に要る自席の情報

**検証（層 3）**: `createScenario` + `recordEvents`（`__tests__/utils/controller.ts`）で台本つきの局を回し、
出力を Phase 1.5 の validator に通す。あわせて mjson を**スナップショット**で固定する
（`__snapshots__/mjai.<scenario>.jsonl`、1 行 1 JSON。§7.9）。

validator が見る不変条件は §7.5 に列挙した。**点棒の保存則
（`sum(deltas) + 供託の増減 == 0`）を最優先で入れる** —— §5.8 の「移動前 `scores` + `deltas`」変換の
バグに直接効く。

台本は最低限、次を覆う局を用意する（変換点が集中する箇所）。

- 立直（宣言 → 宣言牌 → 供託成立の 3 段。§5.4）
- 加槓・暗槓・大明槓（`pai` / `consumed` の切り分けと新ドラの順序。§5.3 / §5.7）
- 裏ドラの乗るツモ和了とロン和了（`hora` の点数内訳。§5.8）
- 流局（`tenpais` と `deltas`）

実装済み。`mjai/encode.ts` と `mjai-encode.test.ts`（11 件）、スナップショットは
`__snapshots__/mjai.tsumo.jsonl`。

**層 5（半荘まるごとの fuzz）は `npm run e2e mjai [N]` に置いた**。vitest に入れると
1 半荘で十数秒かかり、3.6 秒のスイートが 45 秒になるため（計画どおり層 5 は CI の外）。
種を固定しているので、落ちた種はそのまま `mjai-encode.test.ts` の回帰テストに落とせる。

**20 半荘・285 局・33434 mjai イベントで問題 0 件・警告 0 件**。内訳は
`dahai:15986 tsumo:13404 chi:1634 pon:1110 hora:217 dora:151 kakan:82 ryukyoku:68
daiminkan:54 reach:49 reach_accepted:48 ankan:21` で、全種別を踏んでいる。

実装上の判断:

- **配牌は溜めてから確定させる**。observer は `DISTRIBUTE` を 4 家ぶん受け取り、
  各イベントは自分あての手牌だけが実牌で他家は `_`（`notify_distribution`）。
  4 つを 1 つの `start_kyoku` にまとめるため、次の種類のイベントが来た時点で確定させる。
  1 プレイヤー視点では 1 つしか来ないので、同じコードが他家を `?` のまま出す。
- **鳴きの `target` は直前の打牌者から取る**。`CallEvent` は誰から鳴いたかを持たない。
  横向きの位置から逆算する手（`call-index.ts` の逆）もあるが、打牌を追う方が単純。
- **警告は投げずに溜める**。`MjaiEncoder.warnings` に積んで進行は止めない（controller と同じ方針）。
  テストは「警告が 0 件であること」を毎回確かめる。

### Phase 3: 受信方向（`decode.ts`）+ アダプタ（`session.ts`）— **完了**

`MjaiAction` → `ChoiceReply`。候補の並べ替え（§4.2）がここの本体。

実装済み。`mjai/decode.ts` / `mjai/session.ts` と `mjai-decode.test.ts`（18 件）。

**§6.2 の訂正: `MjaiBot.react` は同期でなければならない。**
計画は `Promise<MjaiAction> | MjaiAction` としていたが、controller の進行は
emit → ハンドラ → emit が同期で回り、`pollReplies` は 4 家の返信が揃っていないと投げる。
したがって `MjaiPlayer` に非同期の bot を直接挿すことはできない。
stdio や WebSocket 越しの bot は、進行を待たせる駆動側を別に用意する必要がある（Phase 5）。
`react` は同期の型にし、Promise が返ってきたらその場で投げるようにしてある。

実装上の判断:

- **消してから 1 つ戻す**。`applyAction` はまず全部を `false` にしてから、選んだ 1 つだけを
  元の値に戻す。逆（選ばないものを 1 つずつ消す）にすると、選択肢が増えたときに消し漏れて
  意図しない行動が通る。安全側に倒れる向きを選んだ。
- **打牌が必須の 2 種**（`CHOICE_AFTER_DRAWN` / `CHOICE_AFTER_CALLED`）では `DISCARD` を残す。
  `mailbox.ts` が候補の存在を assert しているため。`none` はここで候補の先頭に倒れる。
- **選択肢が空なら bot に聞かない**。その場で「全部選ばない」を返す。§5.10 のとおり
  返信の義務があるが、bot に問う意味は無い。

**検証（層 4。最も費用対効果が高い）**: `createLocalGame({ playerInjection })` に `MjaiPlayer` を差し込み、
**既存の `Player` の判断を mjai 経由で往復させる**モック bot で 1 半荘完走させる
（`Player.handleDiscard` の結果を mjai の `dahai` に包んで返すだけの bot）。
`silentLogger` + 固定 seed で結果が `Player` 直結の場合と一致すれば、変換が可逆であることの強い証拠になる。

`mailbox.ts` の `pollReplies` は **4 家の返信が揃わないと throw する**ので、完走できた時点で
§5.10 の「全ての選択イベントに返信する義務」が自動的に検証済みになる。

**実際に効いた形**: 同じ種で「`MockPlayer` を 4 席」と「`MjaiPlayer` + ツモ切り bot を 4 席」を
回し、observer のイベント列を mjson にして完全一致を見る（3 種）。山も席順も同じ種から作られるので、
違うのはプレイヤーの実装だけ。mjai を通した側が 1 手でも違えば盤面が分岐して食い違う。

ツモ切り bot だけでは `tsumo` / `dahai` しか通らないので、**自分の手牌を mjai の列だけから
組み直してポンする bot** も足した。鳴きの候補の並べ替えと、鳴いた後の打牌の経路を踏む。
この bot が警告なしで打てること自体が、**送出側が bot に十分な情報を渡せている**ことの裏取りになる。

**検証（層 5、nightly）**: `src/e2e/index.ts` の「ランダムに対局を回し、落ちた対局だけ `games.json` に
残す」仕組みを流用し、N 半荘の全出力を validator に通す。`Replayer` が決定的なので、
落ちた seed をそのまま回帰テストに落とせる。

### Phase 4: 牌譜出力（`log.ts`）— **完了**

observer に繋いで mjson を書く。`?` のマスクを外した replay mode。

実装済み。`mjai/log.ts`（`MjaiLogWriter` / `recordMjaiLog`）と `mjai-log.test.ts`（7 件）。
変換そのものは `encode.ts` が持つので、ここは溜めて 1 行 1 JSON にするだけの薄い層。

- `finish()` の後に書こうとしたら投げる（`end_game` の後ろにイベントが並ぶ壊れた列を防ぐ）
- `finish()` を二度呼んでも `end_game` は 1 つ
- **半荘まるごとの検査は vitest に置かない**（1 回 8 秒）。局またぎは `endRound` で
  東 3 局までに区切って見て、半荘は `npm run e2e mjai` の側で通す。
  同 e2e も `encodeAll` の直呼びから `recordMjaiLog` 経由に変えた（`finish()` の
  呼び忘れや二重書き込みは、log.ts を通さないと出ないため）。

**公開 API を追加した**（§6.5、判断 3）。ラッパーが揃ったのでまとめて出した。
`bot.ts` は作らず、`MjaiBot` は `session.ts` に置いてある（stdio 実装が Phase 5 で
必要になった時点で `bot.ts` を足す）。**配布物は 209.73 kB → 221.46 kB**（gzip 66.93 → 71.49）。

**検証（層 3 + 層 6）**: CI では、マスクを外した出力も validator に通す（`?` が 1 つも残らないことを含む）。
あわせて出力を [mjai-reviewer](https://github.com/Equim-chan/mjai-reviewer) 等の外部ツールに
食わせて読めることを手で確認する（こちらは CI に載せない）。

### Phase 5: 実 bot との接続（`bot.ts`）— **配線まで完了、実 bot での検証は未了**

stdio（1 行 1 JSON）の `MjaiBot` 実装。`hello` / `join` のハンドシェイクはここ。

実装済み。`mjai/bot.ts`（`StdioBot`）/ `mjai/worker-transport.ts` と `mjai-bot.test.ts`（9 件）。

#### 同期の controller と非同期の子プロセスを繋ぐ（§6.6）

controller は 1 局まるごとが 1 つの同期コールスタックで中断点が無い。一方 Node は
子プロセスのパイプを non-blocking で開くので `fs.readSync` は EAGAIN を投げ、
リトライで回すと bot の数だけ CPU を焼く。

そこで **I/O を worker に出し、controller 側は `Atomics.wait` で眠って待つ**。

```
main（controller）                worker
─────────────────────────        ──────────────────────────
postMessage(line)         ─────▶ 子プロセスの stdin へ書く
Atomics.wait(...)  ← CPU を       stdout から 1 行読む（非同期でよい）
             使わず停止    ◀───── SAB に書いて Atomics.notify
```

`postMessage` してから `wait` に入るのが要点（`Atomics.notify` は event loop を起こさない）。
worker のソースは文字列で持ち `eval: true` で起こす —— ライブラリとして束ねたときに
worker のファイルだけ配布物から外れる事故を避けるため。

**却下した案**: controller の非同期化（`pollReplies` を await に）は `Replayer` と `e2e` が壊れ、
xstate のアクションが同期前提なので状態機械の組み替えまで波及する。§0.3 に反するので採らない。
ただし**ブラウザではメインスレッドの `Atomics.wait` が禁止**なので、将来ブラウザから
遠隔 bot に繋ぐならこの非同期化が正しい答えになる。

#### 併せて直したもの

- **`start_game.id` が出ていなかった**（Phase 2 からの欠落）。bot は `id` で自分の席を知るので、
  これが無いと動かない。`MjaiEncoder` に viewer を渡す形にし、`MjaiPlayer` が自分の id を渡す。
  牌譜（replay mode）は誰の視点でもないので従来どおり省く。
- **`react(events[])` と線の約束の差**。線の上は**イベント 1 行につき応答 1 行**（大半は `none`）。
  `StdioBot` が 1 行ずつ送り、`can_act` が立った行への応答だけを採る。
  立直の 2 段（`ask()` を 2 回）は線上の `-> reach` / `<- reach` / `-> dahai` にそのまま対応する。
- **タイムアウトと異常応答**。応答なし・JSON でない・`error`・行動でない、のいずれも `none` に倒して
  警告を積む。`decode.ts` の `none` は打牌が必須の場面で候補の先頭（＝ツモ切り）に安全に倒れるので、
  受け皿は既にある。

#### 検証

- 通信路を差し替えたテスト 6 件（プロセス不要）で線の約束の変換を確かめる
- **本物の子プロセス 4 つで 1 局打ち、`MockPlayer` の対局と mjson が完全一致する**ことを確認
  （テスト用 bot は `__fixtures__/mjai/tsumogiri-bot.cjs`）。実 bot を持ち出さずに
  「線を挟んでも変換が保たれる」ことまで CI で押さえられる
- 起動できない相手・応答なしでも例外にせず進むこと

**残っているのは実 bot（Mortal / mjai.app）との対局だけ**（§9-5 の調査待ち）。

#### 公開 API

`StdioBot` / `SyncTransport` は依存を持たないので公開面に出した。
`createWorkerTransport` は `node:worker_threads` に依存しブラウザで動かないので**出していない**。
Node から使うにはサブパスの輸出（`package.json` の `exports`）を足すか、リポジトリ内から直接 import する。
**配布物は 221.46 kB → 222.82 kB**（ブラウザ配布物は 108.74 kB のまま）。

**Mortal は npm パッケージではない。** Rust（`libriichi`）+ Python の別プログラムなので、
「接続」は import ではなく**別プロセスとの IPC** を指す。`src/lib/mjai/` 側に新しい依存は増えない
（型定義と変換関数だけの純 TypeScript）。

| クライアントの形 | 繋ぎ方 | 追加依存 |
| --- | --- | --- |
| Node / CLI | 子プロセスとして起動し stdio | **なし**（`node:child_process`）|
| ブラウザ | 直接は不可能。Mortal を載せたバックエンドと WebSocket | バックエンドが別途要る |

`bot.ts` が想定するのは前者。ブラウザクライアントを作るなら Mortal を動かすサーバが別に要るが、
これは mjai 対応の設計とは独立した制約（Mortal が Python である以上避けられない）。
`MjaiBot.react` を `Promise` 返しにしてあるのは、どちらの経路にも載るようにするため（§6.2）。

**Phase 1-4 と層 0-5 は Mortal を一切使わない。** 全部 vitest で完結する。
Mortal が要るのはこのフェーズだけで、手動検証・CI 対象外。

**検証（層 6。ここだけが本当の「準拠」の証明）**: `mjai.app` の同梱 bot か Mortal で 1 半荘。
落ちないこと、`error` を返されないこと、`ryukyoku` 率・あがり率が常識的な範囲に収まることを見る。

Mortal の `libriichi` は Rust の serde で厳格にデシリアライズするので、そこを通ることが最終関門。
層 0-5 が全て緑でもここで落ちうる。

> `libriichi` は「厳格な serde を通るか」を**モデルの重みなしで**確かめられる可能性がある
> （mjson を食わせるだけ）。Mortal の学習済み重みが自由に入手できるかは要確認なので、
> それに依存しない検証経路があるなら価値が高い。着手時に調べる（§9-5）。

### Phase 6: 拡張（任意）

- `possible_actions` / `cannot_dahai` の付加（§5.10）
- `dialect` オプション（`"gimite"` = スーパーセット / `"mortal"` = 最小サブセット）
- 天鳳形式など他フォーマットへの変換（mjai をハブ形式として使う）

---

## 9. 未決事項（実装前に判断が要る）

1. **`hora_tehais` の範囲** — 門前部分 + あがり牌だけにするか、鳴きブロックも含めるか。原典サンプルは門前手のみで判別できない。**門前 + あがり牌**を推奨。
2. **役満の `fan`** — 原典は役満に 13 を入れる（ダブル役満は 26）。mjimage は `isYakuman` + `han` を持つので、`fan` にどう畳むか。**`han` をそのまま入れる**のが素直。
3. **`FOUR_KANS` / `FOUR_WINDS` の `reason`** — 原典に無い語彙（`suukaikan` / `suufonrenda`）を使う。受け側が知らない値で落ちる可能性があるので、`dialect: "mortal"` では `reason` を省く選択肢も持たせる。
4. **`uradora_markers` と `ura_markers` の両載せ** — 両方入れるか、`dialect` で選ぶか。**既定は両方**を推奨（実害がなく相互運用性が最大）。
5. **Mortal の入手性（調査事項）** — 学習済み重みが自由に使えるか。使えない場合、層 6 を `libriichi` 単体（厳格な serde に mjson を通すだけ）か `mjai.app` の同梱 bot で代替できるかを Phase 5 着手時に調べる。
6. ~~**層 0 の golden ログの入手元とライセンス**~~ — **解決**（Phase 1.5）。gimite/mjai が New BSD なので `test/kuikae.mjson`（6 件）と `test/test.mjlog.golden.log`（2015 件）の両方を同梱した。Mortal / mjai.app は AGPL-3.0 で同梱不可。経緯は `__fixtures__/mjai/README.md`。
7. **valibot スキーマを `types.ts` の正にするか** — §7.4 の結論は「テスト側に置いて二重管理を許す」。`types.ts` の依存ゼロを捨ててよいなら `InferOutput` で一元化できる。
8. **クライアントの実行形態** — Node / CLI か、ブラウザか（§8 Phase 5 の表）。ブラウザなら Mortal を載せたバックエンドが別に要る。Phase 5 まで先送りできるが、クライアント設計を始める前に決めること。

判断済みのもの（§0.1）: 送出と受信のどちらが主か（両方）、Phase 0 を入れるか（入れる。§0.2 のとおり
mjai とは独立した欠落なので条件付きではない）、公開 API に出すか（出す）。

---

## 10. 参照

- [Mjai 麻雀AI対戦サーバ（原典・gimite）](https://gimite.net/pukiwiki/index.php?Mjai%20%E9%BA%BB%E9%9B%80AI%E5%AF%BE%E6%88%A6%E3%82%B5%E3%83%BC%E3%83%90)
- [gimite/mjai](https://github.com/gimite/mjai) — `lib/mjai/action.rb`（全フィールド）、`lib/mjai/active_game.rb`（`ryukyoku` の reason）、`lib/mjai/hora.rb`（役の識別子）
- [Cryolite/mjai](https://github.com/Cryolite/mjai) — `schema/*.json`（JSON Schema。`hora` / `ryukyoku` は未定義）
- [Equim-chan/Mortal](https://github.com/Equim-chan/Mortal) — `libriichi/src/mjai/event.rs`（実装デファクトの最小サブセット、`can_act`）
- [smly/mjai.app](https://github.com/smly/mjai.app) — 対局サーバ実装、タイムアウトとチョンボの扱い
- [NikkeTryHard/tenhou-to-mjai](https://github.com/NikkeTryHard/tenhou-to-mjai) — `crates/convlog/src/mjai.rs`（天鳳 → mjai 変換）
