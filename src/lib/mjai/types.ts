// mjai プロトコルのイベント型。
//
// このファイルは core にも calculator にも依存しない。mjai の型だけを使う利用者
// （bot の実装者）が、牌クラスまで引き込まずに済むようにするため。
// 牌との相互変換は pai.ts、PlayerEvent との変換は encode.ts / decode.ts が持つ。
//
// mjai には単一の厳密な仕様書が無く、原典（gimite）・標準化（Cryolite）・
// 実装デファクト（Mortal）でフィールドが一部食い違う。ここでは
// 「送出は原典のスーパーセット、受信は最小サブセットのみ必須」を型で表す。

// ---------------------------------------------------------------------------
// 牌の表記
// ---------------------------------------------------------------------------

/** 数牌の種類。mjai は m/p/s のみ（mjimage の "z" / "_" は持たない）。 */
export type MjaiSuit = "m" | "p" | "s";

/** 数牌。1m..9m, 1p..9p, 1s..9s の 27 種。 */
export type MjaiNumberPai = `${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}${MjaiSuit}`;

/** 字牌。東南西北白發中。 */
export type MjaiHonorPai = "E" | "S" | "W" | "N" | "P" | "F" | "C";

/** 赤牌。mjai に "0m" のような別名表記は無い。 */
export type MjaiRedPai = "5mr" | "5pr" | "5sr";

/** 表向きの牌。 */
export type MjaiPai = MjaiNumberPai | MjaiHonorPai | MjaiRedPai;

/** 非公開の牌。他家の手牌・ツモ牌に現れる。 */
export const MJAI_HIDDEN_PAI = "?";
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
  MjaiMaybeHiddenPai,
  MjaiMaybeHiddenPai,
  MjaiMaybeHiddenPai,
  MjaiMaybeHiddenPai,
  MjaiMaybeHiddenPai,
  MjaiMaybeHiddenPai,
  MjaiMaybeHiddenPai,
  MjaiMaybeHiddenPai,
  MjaiMaybeHiddenPai,
  MjaiMaybeHiddenPai,
  MjaiMaybeHiddenPai,
  MjaiMaybeHiddenPai,
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
