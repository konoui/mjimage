import { KIND, OPERATOR, WIND, Wind, Round } from "../constants";
import { BlockAnKan, BlockChi, BlockPon, BlockShoKan, Tile } from "../parser";
import { WinResult } from "../calculator";

type Event =
  | CallEvent
  | "DRAW"
  | "CHOICE_AFTER_DRAWN"
  | "CHOICE_AFTER_DISCARDED"
  | "CHOICE_AFTER_CALLED"
  | "DISTRIBUTE"
  | "WIN_GAME"
  | "DRAWN_GAME";

type ChoiceEvent =
  | "PON"
  | "CHI"
  | "RON"
  | "DISCARD"
  | "TSUMO"
  | "REACH"
  | "AN_KAN"
  | "SHO_KAN";

export interface DistributeEvent {
  id: string;
  type: Extract<Event, "DISTRIBUTE">;
  hand: string;
  wind: Wind;
  round: Round;
}

export interface CallEvent {
  id: string;
  type: Extract<ChoiceEvent, "PON" | "CHI" | "AN_KAN" | "SHO_KAN">;
  iam: Wind;
  wind: Wind;
  block: BlockPon | BlockChi | BlockAnKan | BlockShoKan;
}

export interface RonEvent {
  id: string;
  type: Extract<ChoiceEvent, "RON">;
  iam: Wind;
  wind: Wind;
  ret: WinResult;
}

export interface TsumoEvent {
  id: string;
  type: Extract<ChoiceEvent, "TSUMO">;
  iam: Wind;
  wind: Wind;
  ret: WinResult;
}

export interface DiscardEvent {
  id: string;
  type: Extract<ChoiceEvent, "DISCARD">;
  iam: Wind;
  wind: Wind;
  tile: Tile;
}

export interface DrawEvent {
  id: string;
  type: Extract<Event, "DRAW">;
  iam: Wind;
  wind: Wind;
  tile: Tile;
}

export interface ReachEvent {
  id: string;
  type: Extract<ChoiceEvent, "REACH">;
  iam: Wind;
  wind: Wind;
}

export interface EndEvent {
  id: string;
  type: Extract<Event, "WIN_GAME" | "DRAWN_GAME">;
  wind: Wind;
  scores: { [key: string]: number };
  results: { [key in Wind]: number };
  hands: { [key in Wind]: string };
}

export interface ChoiceAfterDrawnEvent {
  id: string;
  type: Extract<Event, "CHOICE_AFTER_DRAWN">;
  wind: Wind;
  choices: DrawnChoice;
}

export interface ChoiceAfterDiscardedEvent {
  id: string;
  type: Extract<Event, "CHOICE_AFTER_DISCARDED">;
  wind: Wind;
  choices: DiscardedChoice;
}

export interface ChoiceAfterCalled {
  id: string;
  type: Extract<Event, "CHOICE_AFTER_CALLED">;
  wind: Wind;
  choices: Pick<DrawnChoice, "DISCARD">;
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
  | ChoiceAfterDrawnEvent
  | ChoiceAfterDiscardedEvent
  | ChoiceAfterCalled;

interface DiscardedChoice {
  RON: 0 | WinResult;
  PON: 0 | BlockPon[];
  CHI: 0 | BlockChi[];
}

interface DrawnChoice {
  TSUMO: 0 | WinResult;
  REACH: 0 | Tile[];
  AN_KAN: 0 | BlockAnKan[];
  SHO_KAN: 0 | BlockShoKan[];
  DISCARD: 0 | Tile[];
}

type ChoiceType = DiscardedChoice | DrawnChoice;
type ChoiceOrder<T extends ChoiceType> = (keyof T)[];

export function prioritizeDiscardedEvents(events: ChoiceAfterDiscardedEvent[]) {
  const order: ChoiceOrder<DiscardedChoice> = ["RON", "PON", "CHI"];
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
  return order.some((v) => choice[v] !== 0);
}

function calculatePriority<T extends ChoiceType>(
  order: ChoiceOrder<T>,
  choice: T
): number {
  for (let i = 0; i < order.length; i++) {
    const key = order[i];
    if (choice[key] !== 0) return i; // Higher priority
  }
  return Number.POSITIVE_INFINITY; // Same priority
}

function priorityIndex<T extends ChoiceType>(order: ChoiceOrder<T>, choice: T) {
  if (choice == null) return 0;
  for (const key of order) {
    if (choice[key] !== 0) return key;
  }
  return 0;
}
