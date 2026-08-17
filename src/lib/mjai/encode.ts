import { assert } from "../assert";
import { SerializedWinResult } from "../calculator";
import { Block, Parser, Tile } from "../core";
import { BLOCK, OP, TYPE, WIND, Wind } from "../core/constants";
import type {
  CallEvent,
  DistributeEvent,
  EndEvent,
  PlayerEvent,
  RonEvent,
  TsumoEvent,
} from "../controller/events";
import { toMjaiBakaze, toMjaiPai } from "./pai";
import { toMjaiYakus } from "./yaku";
import {
  MJAI_RYUKYOKU_REASON,
  MJAI_TYPE,
  MjaiActor,
  MjaiEvent,
  MjaiKyoku,
  MjaiPai,
  MjaiQuad,
  MjaiTehai,
} from "./types";

// PlayerEvent → MjaiEvent[]（送出方向）。
//
// 状態を持つのは 4 つだけ。
//   - Wind → MjaiActor の対応表（DISTRIBUTE で作り直す）
//   - 溜めている DISTRIBUTE（observer は 4 家ぶん受け取るので 1 つにまとめる）
//   - 保留中の hora（裏ドラを含む最終結果が END_GAME で来るため）
//   - 直前の打牌者（鳴きの target を決めるのに要る）
//
// 「1 プレイヤー視点」でも「observer 視点（牌譜）」でも同じコードで動く。
// 伏せ牌は Tile が "_" で来るので、toMjaiPai が "?" に変換して素通りする。

/** 変換できなかったときの報告。進行は止めず、呼ぶ側がログに出す。 */
export type MjaiEncodeWarning = string;

export class MjaiEncoder {
  /** 席番号の対応表。DISTRIBUTE のたびに作り直す（風は局ごとに回る）。 */
  private actorOf = new Map<Wind, MjaiActor>();
  private playerIDs: readonly string[] = [];
  /** 溜めている配牌。observer は 4 家ぶん来るので 1 つの start_kyoku にまとめる。 */
  private pendingDistribute: DistributeEvent[] = [];
  /** 溜めている配牌の手牌。席番号順。 */
  private pendingTehais: (string | null)[] = [null, null, null, null];
  /** 保留中の和了。END_GAME で最終結果を載せて出す。 */
  private pendingHora: { actor: MjaiActor; target: MjaiActor; pai: MjaiPai }[] =
    [];
  /** 直前の打牌者。鳴きの target に使う。 */
  private lastDiscarder: Wind | null = null;
  /** start_game を出したか。 */
  private started = false;

  readonly warnings: MjaiEncodeWarning[] = [];

  private warn(message: string) {
    this.warnings.push(message);
  }

  private actor(w: Wind): MjaiActor {
    const a = this.actorOf.get(w);
    if (a == null) {
      this.warn(`席番号が分からない風: ${w}`);
      return 0;
    }
    return a;
  }

  /** 席番号順に並べた点数。`{[playerID]: number}` を配列にする。 */
  private toScores(scores: {
    readonly [key: string]: number;
  }): MjaiQuad<number> {
    return this.playerIDs.map((id) => scores[id] ?? 0) as unknown as MjaiQuad<number>;
  }

  /**
   * イベントを 1 つ渡し、対応する mjai イベントを得る。
   * 選択イベント（返事を待つ 5 種）は盤面を動かさないので空を返す。
   */
  encode(e: PlayerEvent): MjaiEvent[] {
    // 配牌は溜めてあるので、別の種類が来た時点で確定させる。
    const out: MjaiEvent[] =
      e.type == "DISTRIBUTE" ? [] : this.flushDistribute();

    switch (e.type) {
      case "DISTRIBUTE":
        this.acceptDistribute(e);
        return out;

      case "DRAW":
        out.push({
          type: MJAI_TYPE.TSUMO,
          actor: this.actor(e.iam),
          // 嶺上牌（subType: "kan"）は mjai に区別が無いので落とす。
          // 直前の ankan / kakan / daiminkan から自明。
          pai: toMjaiPai(Tile.from(e.tile)),
        });
        return out;

      case "DISCARD":
        this.lastDiscarder = e.iam;
        out.push({
          type: MJAI_TYPE.DAHAI,
          actor: this.actor(e.iam),
          pai: this.pai(e.tile),
          tsumogiri: e.tsumogiri ?? false,
        });
        return out;

      case "REACH":
        // mjimage は宣言と宣言牌を 1 つのイベントで持つ。mjai は 2 つに分ける。
        this.lastDiscarder = e.iam;
        out.push(
          { type: MJAI_TYPE.REACH, actor: this.actor(e.iam) },
          {
            type: MJAI_TYPE.DAHAI,
            actor: this.actor(e.iam),
            pai: this.pai(e.tile),
            tsumogiri: e.tsumogiri ?? false,
          }
        );
        return out;

      case "REACH_ACCEPTED":
        out.push({
          type: MJAI_TYPE.REACH_ACCEPTED,
          actor: this.actor(e.reacherInfo.wind),
        });
        return out;

      case "NEW_DORA":
        out.push({
          type: MJAI_TYPE.DORA,
          dora_marker: this.pai(e.doraIndicator),
        });
        return out;

      case "CHI":
      case "PON":
      case "DAI_KAN":
      case "SHO_KAN":
      case "AN_KAN":
        out.push(...this.encodeCall(e));
        return out;

      case "TSUMO":
      case "RON":
        // 裏ドラを含む最終結果は END_GAME まで分からないので、ここでは溜めるだけ。
        this.holdHora(e);
        return out;

      case "END_GAME":
        out.push(...this.encodeEnd(e));
        return out;

      default:
        // 選択イベント。can_act として添えるのは session.ts の仕事。
        return out;
    }
  }

  /** 半荘の終わり。mjimage に対応するイベントが無いので明示的に呼ぶ（§5.9）。 */
  finish(scores?: { readonly [key: string]: number }): MjaiEvent[] {
    const e: MjaiEvent = { type: MJAI_TYPE.END_GAME };
    if (scores != null) (e as { scores?: MjaiQuad<number> }).scores = this.toScores(scores);
    return [e];
  }

  private pai(tile: string): MjaiPai {
    const p = toMjaiPai(Tile.from(tile));
    if (p == "?") {
      this.warn(`伏せ牌が表向きの位置に来た: ${tile}`);
      return "1m";
    }
    return p;
  }

  // -------------------------------------------------------------------------
  // 配牌
  // -------------------------------------------------------------------------

  private acceptDistribute(e: DistributeEvent) {
    if (this.pendingDistribute.length == 0) {
      // 局ごとに風が回るので、対応表は毎回作り直す。
      this.actorOf = new Map();
      this.playerIDs = e.players;
      for (const [id, w] of Object.entries(e.places)) {
        const i = e.players.indexOf(id);
        if (i < 0) this.warn(`players に無い playerID: ${id}`);
        else this.actorOf.set(w, i as MjaiActor);
      }
      this.pendingTehais = [null, null, null, null];
      this.pendingHora = [];
      this.lastDiscarder = null;
    }
    this.pendingDistribute.push(e);
    // 自分あての配牌だけが実牌で、他家は "_" で埋まっている。
    // observer は 4 家ぶん受け取るので、通しで全員分が埋まる。
    this.pendingTehais[this.actor(e.wind)] = e.hands[e.wind];
  }

  private flushDistribute(): MjaiEvent[] {
    if (this.pendingDistribute.length == 0) return [];
    const e = this.pendingDistribute[0];
    this.pendingDistribute = [];

    const out: MjaiEvent[] = [];
    if (!this.started) {
      this.started = true;
      out.push({
        type: MJAI_TYPE.START_GAME,
        names: [...e.players] as unknown as MjaiQuad<string>,
      });
    }

    const tehais = this.pendingTehais.map((hand, i) => {
      // 受け取っていない家は伏せ牌で埋める（1 プレイヤー視点のとき）。
      const tiles =
        hand == null
          ? Array<Tile>(13).fill(new Tile(TYPE.BACK, 0))
          : new Parser(hand).tiles();
      if (tiles.length != 13)
        this.warn(`配牌が 13 枚でない（席 ${i}）: ${tiles.length} 枚`);
      return tiles.map(toMjaiPai) as unknown as MjaiTehai;
    }) as unknown as MjaiQuad<MjaiTehai>;

    out.push({
      type: MJAI_TYPE.START_KYOKU,
      bakaze: toMjaiBakaze(e.round.slice(0, 2) as Wind),
      kyoku: Number(e.round[2]) as MjaiKyoku,
      honba: e.sticks.dead,
      kyotaku: e.sticks.reach,
      oya: this.actor(WIND.E),
      dora_marker: this.pai(e.doraIndicator),
      tehais: tehais,
      scores: this.toScores(e.scores),
    });
    return out;
  }

  // -------------------------------------------------------------------------
  // 鳴き
  // -------------------------------------------------------------------------

  /**
   * 鳴きブロックを mjai の形にする。
   *
   * 横向き（`OP.HORIZONTAL`）が鳴いた牌を指す。位置は鳴かれた相手との関係で変わる
   * （`controller/call-index.ts`）ので、添字を決め打ちにしない。
   */
  private encodeCall(e: CallEvent): MjaiEvent[] {
    const tiles = Block.deserialize(e.block).tiles;
    const actor = this.actor(e.iam);
    const horizontal = tiles
      .map((t, i) => (t.has(OP.HORIZONTAL) ? i : -1))
      .filter((i) => i >= 0);
    const others = (skip: readonly number[]) =>
      tiles.filter((_, i) => !skip.includes(i)).map((t) => this.pai(t.toString()));

    const target = (): MjaiActor => {
      if (this.lastDiscarder == null) {
        this.warn(`鳴きの直前に打牌が無い: ${e.type}`);
        return actor;
      }
      return this.actor(this.lastDiscarder);
    };

    switch (e.type) {
      case "CHI":
      case "PON":
      case "DAI_KAN": {
        if (horizontal.length != 1) {
          this.warn(`${e.type} の横向きが ${horizontal.length} 枚（1 枚のはず）`);
          return [];
        }
        const i = horizontal[0];
        const consumed = others([i]);
        const pai = this.pai(tiles[i].toString());
        const type =
          e.type == "CHI"
            ? MJAI_TYPE.CHI
            : e.type == "PON"
              ? MJAI_TYPE.PON
              : MJAI_TYPE.DAIMINKAN;
        return [
          {
            type: type,
            actor: actor,
            target: target(),
            pai: pai,
            consumed: consumed,
          } as unknown as MjaiEvent,
        ];
      }

      case "SHO_KAN": {
        // 横向きが 2 枚ある。加槓牌はポン牌の直前に挿されるので添字が小さい方
        // （BlockShoKan.fromPon）。
        if (horizontal.length != 2) {
          this.warn(`SHO_KAN の横向きが ${horizontal.length} 枚（2 枚のはず）`);
          return [];
        }
        const i = Math.min(...horizontal);
        return [
          {
            type: MJAI_TYPE.KAKAN,
            actor: actor,
            pai: this.pai(tiles[i].toString()),
            consumed: others([i]),
          } as unknown as MjaiEvent,
        ];
      }

      case "AN_KAN":
        return [
          {
            type: MJAI_TYPE.ANKAN,
            actor: actor,
            consumed: others([]),
          } as unknown as MjaiEvent,
        ];
    }
  }

  // -------------------------------------------------------------------------
  // 和了・流局
  // -------------------------------------------------------------------------

  private holdHora(e: RonEvent | TsumoEvent) {
    const actor = this.actor(e.iam);
    this.pendingHora.push({
      actor: actor,
      target: e.type == "RON" ? this.actor(e.victimInfo.wind) : actor,
      pai: this.pai(
        e.type == "RON" ? e.victimInfo.tile : e.lastTile
      ),
    });
  }

  private encodeEnd(e: EndEvent): MjaiEvent[] {
    const out: MjaiEvent[] = [];

    if (e.subType == "WIN_GAME") {
      if (this.pendingHora.length == 0) this.warn(`WIN_GAME に和了が無い`);
      for (const h of this.pendingHora) out.push(this.buildHora(h, e));
    } else {
      out.push(this.buildRyukyoku(e));
    }
    this.pendingHora = [];

    out.push({ type: MJAI_TYPE.END_KYOKU });
    return out;
  }

  private buildHora(
    h: { actor: MjaiActor; target: MjaiActor; pai: MjaiPai },
    e: EndEvent
  ): MjaiEvent {
    const hora: Record<string, unknown> = {
      type: MJAI_TYPE.HORA,
      actor: h.actor,
      target: h.target,
      pai: h.pai,
    };

    const deltas = this.deltas(e.deltas);
    hora.deltas = deltas;
    // EndEvent.scores は emit の前に読まれた「移動前」の点数。mjai は移動後。
    const before = this.toScores(e.scores);
    hora.scores = before.map((v, i) => v + deltas[i]) as unknown as MjaiQuad<number>;

    // 裏ドラを含む最終結果。Phase 0 で EndEvent に載せたもの。
    const ret = e.ret;
    if (ret == null) {
      // 無くても deltas だけで Mortal 系とは繋がる（§5.8 の最小形）。
      this.warn(`EndEvent に最終結果（ret）が無いので、役・符・裏ドラを出せない`);
      return hora as unknown as MjaiEvent;
    }

    const { yakus, unknown } = toMjaiYakus(ret.yakus);
    for (const n of unknown) this.warn(`mjai に対応する識別子が無い役: ${n}`);
    hora.yakus = yakus;
    hora.fu = ret.fu;
    hora.fan = ret.han;
    hora.hora_points = ret.pointsWithoutSticks;

    const ura = ret.boardContext.hiddenDoraIndicators;
    if (ura != null && ura.length > 0) {
      const markers = ura.map((t) => this.pai(t));
      // 原典は uradora_markers、Mortal 系は ura_markers。実害が無いので両方載せる。
      hora.uradora_markers = markers;
      hora.ura_markers = markers;
    }

    hora.hora_tehais = this.horaTehais(ret);
    return hora as unknown as MjaiEvent;
  }

  /**
   * あがり形の手牌。門前部分 + あがり牌に絞る（§8-1）。
   * 鳴きは既に chi / pon / kan で伝えてあるので重ねない。
   */
  private horaTehais(ret: SerializedWinResult): MjaiPai[] {
    const called = new Set<string>([
      BLOCK.PON,
      BLOCK.CHI,
      BLOCK.AN_KAN,
      BLOCK.DAI_KAN,
      BLOCK.SHO_KAN,
    ]);
    const out: MjaiPai[] = [];
    for (const b of ret.hand) {
      if (called.has(b.type)) continue;
      for (const t of Block.deserialize(b).tiles) out.push(this.pai(t.toString()));
    }
    return out;
  }

  private buildRyukyoku(e: EndEvent): MjaiEvent {
    const reason = {
      DRAWN_GAME: MJAI_RYUKYOKU_REASON.FANPAI,
      NINE_TERMINALS: MJAI_RYUKYOKU_REASON.KYUSHUKYUHAI,
      FOUR_KANS: MJAI_RYUKYOKU_REASON.SUUKAIKAN,
      FOUR_WINDS: MJAI_RYUKYOKU_REASON.SUUFONRENDA,
      WIN_GAME: MJAI_RYUKYOKU_REASON.FANPAI, // ここには来ない
    }[e.subType];

    const deltas = this.deltas(e.deltas);
    const before = this.toScores(e.scores);
    return {
      type: MJAI_TYPE.RYUKYOKU,
      reason: reason,
      // hands は空文字が「テンパイでない」を表す。
      tenpais: Object.values(WIND).map(
        (w) => (e.hands[w] ?? "").length > 0
      ) as unknown as MjaiQuad<boolean>,
      deltas: deltas,
      scores: before.map((v, i) => v + deltas[i]) as unknown as MjaiQuad<number>,
    };
  }

  /** 風ごとの点数移動を席番号順に並べ替える。 */
  private deltas(d: { readonly [w in Wind]: number }): MjaiQuad<number> {
    const out: number[] = [0, 0, 0, 0];
    for (const w of Object.values(WIND)) out[this.actor(w)] = d[w];
    return out as unknown as MjaiQuad<number>;
  }
}

/** イベント列をまとめて変換する。牌譜の書き出しに使う。 */
export const encodeAll = (
  events: readonly PlayerEvent[]
): { events: MjaiEvent[]; warnings: MjaiEncodeWarning[] } => {
  const enc = new MjaiEncoder();
  const out: MjaiEvent[] = [];
  for (const e of events) out.push(...enc.encode(e));
  out.push(...enc.finish());
  assert(out.length > 0, `no events`);
  return { events: out, warnings: enc.warnings };
};
