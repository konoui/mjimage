import { eventmit } from "eventmit";
import { Wind, Round } from "../core/constants";
import { SerializedBlock } from "../core";
import { SerializedTileAnalysis, SerializedWinResult } from "../calculator";

type Event =
  | CallEvent
  | "DRAW"
  | "CHOICE_AFTER_DRAWN"
  | "CHOICE_AFTER_DISCARDED"
  | "CHOICE_AFTER_CALLED"
  | "CHOICE_FOR_CHAN_KAN"
  | "CHOICE_FOR_REACH_ACCEPTANCE"
  | "REACH_ACCEPTED"
  | "DISTRIBUTE"
  | "NEW_DORA"
  | "END_GAME";

type ChoiceEvent =
  | "PON"
  | "CHI"
  | "RON"
  | "DISCARD"
  | "TSUMO"
  | "REACH"
  | "AN_KAN"
  | "SHO_KAN"
  | "DAI_KAN"
  | "DRAWN_GAME_BY_NINE_TERMINALS";

export interface DistributeEvent {
  id: string;
  type: Extract<Event, "DISTRIBUTE">;
  hands: { readonly [w in Wind]: string };
  wind: Wind;
  doraIndicator: string;
  players: readonly string[];
  places: { readonly [id: string]: Wind };
  sticks: { readonly reach: number; readonly dead: number };
  round: Round;
  scores: { readonly [key: string]: number };
}

export interface EndEvent {
  id: string;
  type: Extract<Event, "END_GAME">;
  subType:
    | "WIN_GAME"
    | "DRAWN_GAME"
    | "FOUR_KANS"
    | "FOUR_WINDS"
    | "NINE_TERMINALS";
  wind: Wind;
  scores: { readonly [key: string]: number };
  sticks: { readonly reach: number; readonly dead: number };
  deltas: { readonly [w in Wind]: number };
  hands: { readonly [w in Wind]: string };
  shouldContinue: boolean;
}

export interface CallEvent {
  id: string;
  type: Extract<ChoiceEvent, "PON" | "CHI" | "AN_KAN" | "SHO_KAN" | "DAI_KAN">;
  iam: Wind;
  wind: Wind;
  block: SerializedBlock;
}

export interface RonEvent {
  id: string;
  type: Extract<ChoiceEvent, "RON">;
  iam: Wind;
  wind: Wind;
  ret: SerializedWinResult;
  victimInfo: { readonly wind: Wind; readonly tile: string };
}

export interface TsumoEvent {
  id: string;
  type: Extract<ChoiceEvent, "TSUMO">;
  iam: Wind;
  wind: Wind;
  lastTile: string;
  ret: SerializedWinResult;
}

export interface DiscardEvent {
  id: string;
  type: Extract<ChoiceEvent, "DISCARD">;
  iam: Wind;
  wind: Wind;
  tile: string;
}

export interface DrawEvent {
  id: string;
  type: Extract<Event, "DRAW">;
  /** カンの後の嶺上牌なら "kan"。EndEvent.subType と大文字小文字を揃えてある。 */
  subType?: "kan";
  iam: Wind;
  wind: Wind;
  tile: string;
}

export interface ReachEvent {
  id: string;
  type: Extract<ChoiceEvent, "REACH">;
  tile: string;
  iam: Wind;
  wind: Wind;
}

export interface ReachAcceptedEvent {
  id: string;
  type: Extract<Event, "REACH_ACCEPTED">;
  wind: Wind;
  reacherInfo: { readonly wind: Wind; readonly tile: string };
}

export interface NewDoraEvent {
  id: string;
  type: Extract<Event, "NEW_DORA">;
  doraIndicator: string;
  wind: Wind;
}

export interface ChoiceAfterDrawnEvent {
  id: string;
  type: Extract<Event, "CHOICE_AFTER_DRAWN">;
  wind: Wind;
  drawerInfo: { readonly wind: Wind; readonly tile: string };
  choices: DrawChoice;
}

export interface ChoiceAfterDiscardedEvent {
  id: string;
  type: Extract<Event, "CHOICE_AFTER_DISCARDED">;
  wind: Wind;
  discarterInfo: { readonly wind: Wind; readonly tile: string };
  choices: DiscardChoice;
}

export interface ChoiceForReachAcceptance {
  id: string;
  type: Extract<Event, "CHOICE_FOR_REACH_ACCEPTANCE">;
  wind: Wind;
  reacherInfo: { readonly wind: Wind; readonly tile: string };
  choices: Pick<DiscardChoice, "RON">;
}

export interface ChoiceAfterCalled {
  id: string;
  type: Extract<Event, "CHOICE_AFTER_CALLED">;
  wind: Wind;
  choices: Pick<DrawChoice, "DISCARD">;
}

export interface ChoiceForChanKan {
  id: string;
  type: Extract<Event, "CHOICE_FOR_CHAN_KAN">;
  wind: Wind;
  callerInfo: { readonly wind: Wind; readonly tile: string };
  choices: Pick<DiscardChoice, "RON">;
}

/**
 * プレイヤーが返信する選択イベント。controller が返事を待つのはこの 5 種類だけで、
 * 残りは盤面を伝えるだけの一方通行のイベント。
 */
export type ChoiceReply =
  | ChoiceAfterDrawnEvent
  | ChoiceAfterDiscardedEvent
  | ChoiceAfterCalled
  | ChoiceForReachAcceptance
  | ChoiceForChanKan;

/** 返信の種別。`Record` なので `ChoiceReply` を増やすと追記漏れがコンパイルで止まる。 */
const CHOICE_REPLY_TYPES: Readonly<Record<ChoiceReply["type"], true>> = {
  CHOICE_AFTER_DRAWN: true,
  CHOICE_AFTER_DISCARDED: true,
  CHOICE_AFTER_CALLED: true,
  CHOICE_FOR_REACH_ACCEPTANCE: true,
  CHOICE_FOR_CHAN_KAN: true,
};

/** 返信を待っている種類のイベントか。 */
export function isChoiceReply(e: PlayerEvent): e is ChoiceReply {
  return e.type in CHOICE_REPLY_TYPES;
}

export type PlayerEvent =
  | DistributeEvent
  | EndEvent
  | CallEvent
  | RonEvent
  | TsumoEvent
  | DiscardEvent
  | DrawEvent
  | ReachEvent
  | ReachAcceptedEvent
  | NewDoraEvent
  | ChoiceReply;

interface DiscardChoice {
  RON: false | SerializedWinResult;
  PON: false | readonly SerializedBlock[];
  CHI: false | readonly SerializedBlock[];
  DAI_KAN: false | SerializedBlock;
}

interface DrawChoice {
  TSUMO: false | SerializedWinResult;
  REACH: false | readonly SerializedTileAnalysis[];
  AN_KAN: false | readonly SerializedBlock[];
  SHO_KAN: false | readonly SerializedBlock[];
  DISCARD: false | readonly string[];
  DRAWN_GAME_BY_NINE_TERMINALS: boolean;
}

type ChoiceType = DiscardChoice | DrawChoice;
/**
 * 選択肢の優先順位。数が小さいほど優先される。
 *
 * 並びから漏れた選択肢は永久に選ばれないので、`Record` で全種類を要求する
 * （選択肢を足したときに、ここを直し忘れるとコンパイルで止まる）。
 */
type ChoicePriority<T extends ChoiceType> = Readonly<Record<keyof T, number>>;

const DISCARD_PRIORITY: ChoicePriority<DiscardChoice> = {
  RON: 0,
  DAI_KAN: 1,
  PON: 2,
  CHI: 3,
};

const DRAWN_PRIORITY: ChoicePriority<DrawChoice> = {
  TSUMO: 0,
  REACH: 1,
  AN_KAN: 2,
  SHO_KAN: 3,
  DRAWN_GAME_BY_NINE_TERMINALS: 4,
  DISCARD: 5,
};

/**
 * 捨て牌に対する選択（ロン・大明槓・ポン・チー）から、実際に通るものを選ぶ。
 *
 * 同じ優先順位が複数いる場合（ダブロン）は全員を返すが、並びは頭ハネの順
 * ＝放銃者の下家から反時計回りにしてあるので、1 人だけ選ぶ側は先頭を取ればよい。
 */
export function prioritizeDiscardedEvents(events: ChoiceAfterDiscardedEvent[]) {
  const discardedBy = events[0]?.discarterInfo.wind;
  const selected = prioritize(events, DISCARD_PRIORITY);
  return {
    events: discardedBy == null ? selected : orderByTurn(selected, discardedBy),
    type: highestChoice(DISCARD_PRIORITY, selected[0]?.choices),
  };
}

/** ツモ番の選択（ツモ・立直・暗槓・加槓・九種九牌・打牌）から、通るものを選ぶ。 */
export function prioritizeDrawnEvents(events: ChoiceAfterDrawnEvent[]) {
  const selected = prioritize(events, DRAWN_PRIORITY);
  return {
    events: selected,
    type: highestChoice(DRAWN_PRIORITY, selected[0]?.choices),
  };
}

/**
 * 起点（放銃者・カンした人・立直した人）の下家から反時計回りに並べ替える。
 *
 * 頭ハネはこの並びの先頭が取る。受け取った配列は変更しない。
 */
export function orderByTurn<E extends { wind: Wind }>(
  events: readonly E[],
  from: Wind
): E[] {
  const distance = (w: Wind) =>
    (Number(w[0]) - Number(from[0]) + 4) % 4 || 4; // 起点自身は最後
  return [...events].sort((a, b) => distance(a.wind) - distance(b.wind));
}

/** 最も優先順位の高い選択肢を持つイベントをすべて返す。 */
function prioritize<T extends ChoiceType, E extends { choices: T }>(
  events: readonly E[],
  priority: ChoicePriority<T>
): E[] {
  let selected: E[] = [];
  let highest = NO_CHOICE;
  for (const e of events) {
    const key = highestChoice(priority, e.choices);
    if (key === false) continue; // 選択肢が無い人は候補にしない
    const v = priority[key];
    if (v < highest) {
      highest = v;
      selected = [e];
    } else if (v == highest) {
      selected.push(e);
    }
  }
  return selected;
}

/** 選べる選択肢が 1 つも無いことを表す優先順位。 */
const NO_CHOICE = Number.POSITIVE_INFINITY;

/**
 * その選択肢を実際に選べるか。
 * 候補の一覧は配列で表すが、JS では `[]` も truthy なので、
 * 候補 0 件を「選べる」と判定しないよう長さまで見る。
 */
function selectable(v: unknown): boolean {
  return Array.isArray(v) ? v.length > 0 : !!v;
}

/** 選べるもののうち最も優先順位が高いものの名前。何も選べなければ false。 */
function highestChoice<T extends ChoiceType>(
  priority: ChoicePriority<T>,
  choice: T | undefined
): keyof T | false {
  if (choice == null) return false;
  let best: keyof T | false = false;
  for (const key of Object.keys(priority) as (keyof T)[]) {
    if (!selectable(choice[key])) continue;
    if (best === false || priority[key] < priority[best]) best = key;
  }
  return best;
}

export interface EventHandler {
  emit(e: PlayerEvent): void;
  on(handler: EventHandlerFunc): void;
}

export type EventHandlerFunc = (e: PlayerEvent) => void;

export const createEventPipe = (): [EventHandler, EventHandler] => {
  const e1 = eventmit<PlayerEvent>();
  const e2 = eventmit<PlayerEvent>();
  const p1 = {
    emit: e1.emit,
    on: (h: EventHandlerFunc) => e2.on(h),
  };
  const p2 = {
    emit: e2.emit,
    on: (h: EventHandlerFunc) => e1.on(h),
  };
  return [p1, p2];
};

export const createEventEmitter = () => {
  const emitter = eventmit<PlayerEvent>();
  const emit = (e: PlayerEvent) => {
    emitter.emit(e);
  };
  const on = (h: EventHandlerFunc) => {
    emitter.on(h);
  };
  return {
    emit: emit,
    on: on,
  };
};
