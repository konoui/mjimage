import { Wind, Round } from "../constants";
import {
  BlockAnKan,
  BlockChi,
  BlockDaiKan,
  BlockPon,
  BlockShoKan,
  Tile,
} from "../parser";
import { WinResult } from "../calculator";

type Event =
  | CallEvent
  | "DRAW"
  | "CHOICE_AFTER_DRAWN"
  | "CHOICE_AFTER_DISCARDED"
  | "CHOICE_AFTER_CALLED"
  | "CHOICE_FOR_CHAN_KAN"
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
  | "DAI_KAN";

export interface DistributeEvent {
  id: string;
  type: Extract<Event, "DISTRIBUTE">;
  hands: { [key in Wind]: string };
  wind: Wind;
  sticks: { reach: number; dead: number };
  round: Round;
}

export interface EndEvent {
  id: string;
  type: Extract<Event, "END_GAME">;
  subType: "WIN_GAME" | "DRAWN_GAME" | "FOUR_KAN" | "FOUR_WIND";
  wind: Wind;
  scores: { [key: string]: number };
  sticks: { reach: number; dead: number };
  results: { [key in Wind]: number };
  hands: { [key in Wind]: string };
}

export interface CallEvent {
  id: string;
  type: Extract<ChoiceEvent, "PON" | "CHI" | "AN_KAN" | "SHO_KAN" | "DAI_KAN">;
  iam: Wind;
  wind: Wind;
  block: BlockPon | BlockChi | BlockAnKan | BlockShoKan | BlockDaiKan;
}

export interface RonEvent {
  id: string;
  type: Extract<ChoiceEvent, "RON">;
  iam: Wind;
  wind: Wind;
  ret: WinResult;
  tileInfo: { wind: Wind; tile: Tile };
  quadWin?: boolean;
}

export interface TsumoEvent {
  id: string;
  type: Extract<ChoiceEvent, "TSUMO">;
  iam: Wind;
  wind: Wind;
  lastTile: Tile;
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

export interface NewDoraEvent {
  id: string;
  type: Extract<Event, "NEW_DORA">;
  tile: Tile;
}

export interface ChoiceAfterDrawnEvent {
  id: string;
  type: Extract<Event, "CHOICE_AFTER_DRAWN">;
  wind: Wind;
  tileInfo: { wind: Wind; tile: Tile };
  choices: DrawnChoice;
}

export interface ChoiceAfterDiscardedEvent {
  id: string;
  type: Extract<Event, "CHOICE_AFTER_DISCARDED">;
  wind: Wind;
  tileInfo: { wind: Wind; tile: Tile };
  choices: DiscardedChoice;
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
  tileInfo: { wind: Wind; tile: Tile };
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
  | NewDoraEvent
  | ChoiceAfterDrawnEvent
  | ChoiceAfterDiscardedEvent
  | ChoiceAfterCalled
  | ChoiceForChanKan;

interface DiscardedChoice {
  RON: 0 | WinResult;
  PON: 0 | BlockPon[];
  CHI: 0 | BlockChi[];
  DAI_KAN: 0 | BlockDaiKan;
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
