import { eventmit } from "eventmit";
import { Wind, Round } from "../core/constants";
import { SerializedBlock } from "../core/parser";
import { SerializedCandidate, SerializedWinResult } from "../calculator";

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
  | "DRAWN_GAME_BY_NINE_ORPHANS";

export interface DistributeEvent {
  id: string;
  type: Extract<Event, "DISTRIBUTE">;
  hands: { [key in Wind]: string };
  wind: Wind;
  doraMarker: string;
  players: string[];
  places: { [key: string]: Wind };
  sticks: { reach: number; dead: number };
  round: Round;
  scores: { [key: string]: number };
}

export interface EndEvent {
  id: string;
  type: Extract<Event, "END_GAME">;
  subType: "WIN_GAME" | "DRAWN_GAME" | "FOUR_KAN" | "FOUR_WIND" | "NINE_TILES";
  wind: Wind;
  scores: { [key: string]: number };
  sticks: { reach: number; dead: number };
  deltas: { [key in Wind]: number };
  hands: { [key in Wind]: string };
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
  victimInfo: { wind: Wind; tile: string };
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
  subtype?: "kan";
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
  reacherInfo: { wind: Wind; tile: string };
}

export interface NewDoraEvent {
  id: string;
  type: Extract<Event, "NEW_DORA">;
  doraMarker: string;
  wind: Wind;
}

export interface ChoiceAfterDrawnEvent {
  id: string;
  type: Extract<Event, "CHOICE_AFTER_DRAWN">;
  wind: Wind;
  drawerInfo: { wind: Wind; tile: string };
  choices: DrawnChoice;
}

export interface ChoiceAfterDiscardedEvent {
  id: string;
  type: Extract<Event, "CHOICE_AFTER_DISCARDED">;
  wind: Wind;
  discarterInfo: { wind: Wind; tile: string };
  choices: DiscardedChoice;
}

export interface ChoiceForReachAcceptance {
  id: string;
  type: Extract<Event, "CHOICE_FOR_REACH_ACCEPTANCE">;
  wind: Wind;
  reacherInfo: { wind: Wind; tile: string };
  choices: Pick<DiscardedChoice, "RON">;
}

export interface ChoiceAfterCalled {
  id: string;
  type: Extract<Event, "CHOICE_AFTER_CALLED">;
  wind: Wind;
  choices: Pick<DrawnChoice, "DISCARD">;
}

export interface ChoiceForChanKan {
  id: string;
  type: Extract<Event, "CHOICE_FOR_CHAN_KAN">;
  wind: Wind;
  callerInfo: { wind: Wind; tile: string };
  choices: Pick<DiscardedChoice, "RON">;
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
  | ChoiceAfterDrawnEvent
  | ChoiceAfterDiscardedEvent
  | ChoiceAfterCalled
  | ChoiceForReachAcceptance
  | ChoiceForChanKan;

interface DiscardedChoice {
  RON: false | SerializedWinResult;
  PON: false | SerializedBlock[];
  CHI: false | SerializedBlock[];
  DAI_KAN: false | SerializedBlock;
}

interface DrawnChoice {
  TSUMO: false | SerializedWinResult;
  REACH: false | SerializedCandidate[];
  AN_KAN: false | SerializedBlock[];
  SHO_KAN: false | SerializedBlock[];
  DISCARD: false | string[];
  DRAWN_GAME_BY_NINE_ORPHANS: boolean;
}

type ChoiceType = DiscardedChoice | DrawnChoice;
type ChoiceOrder<T extends ChoiceType> = (keyof T)[];

export function prioritizeDiscardedEvents(events: ChoiceAfterDiscardedEvent[]) {
  const order: ChoiceOrder<DiscardedChoice> = ["RON", "DAI_KAN", "PON", "CHI"];
  const choices = events.map((e) => e.choices);
  const indexes = prioritizeEvents(choices, order);
  const selected = indexes.map((idx) => events[idx]);
  return {
    events: selected,
    type: priorityIndex(order, selected[0]?.choices),
  };
}

export function prioritizeDrawnEvents(events: ChoiceAfterDrawnEvent[]) {
  const order: ChoiceOrder<DrawnChoice> = [
    "TSUMO",
    "REACH",
    "AN_KAN",
    "SHO_KAN",
    "DRAWN_GAME_BY_NINE_ORPHANS",
    "DISCARD",
  ];
  const choices = events.map((e) => e.choices);
  const indexes = prioritizeEvents(choices, order);
  const selected = indexes.map((idx) => events[idx]);
  return {
    events: selected,
    type: priorityIndex(order, selected[0]?.choices),
  };
}

function prioritizeEvents<T extends ChoiceType>(
  choices: T[],
  order: ChoiceOrder<T>
): number[] {
  let highestPriorityIndices: number[] = [];
  let highestPriority = Number.POSITIVE_INFINITY;
  for (let i = 0; i < choices.length; i++) {
    const choice = choices[i];
    if (hasChoices(choice, order)) {
      const priority = calculatePriority(order, choice);
      if (priority < highestPriority) {
        highestPriority = priority;
        highestPriorityIndices = [i];
      } else if (priority === highestPriority) {
        highestPriorityIndices.push(i);
      }
    }
  }
  return highestPriorityIndices;
}

function hasChoices<T extends ChoiceType>(
  choice: T,
  order: ChoiceOrder<T>
): boolean {
  return order.some((v) => !!choice[v]);
}

function calculatePriority<T extends ChoiceType>(
  order: ChoiceOrder<T>,
  choice: T
): number {
  for (let i = 0; i < order.length; i++) {
    const key = order[i];
    if (!!choice[key]) return i; // Higher priority
  }
  return Number.POSITIVE_INFINITY; // Same priority
}

function priorityIndex<T extends ChoiceType>(order: ChoiceOrder<T>, choice: T) {
  if (choice == null) return false;
  for (const key of order) {
    if (!!choice[key]) return key;
  }
  return false;
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
