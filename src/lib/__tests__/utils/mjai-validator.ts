import { checkSchema, MjaiDialect } from "./mjai-schema";

// mjai のイベント列を「プロトコルとして成立しているか」で検査する。
//
// スキーマ（mjai-schema.ts）が 1 件ずつの形を見るのに対し、こちらは列を通して
// 盤面を組み直し、矛盾が無いかを見る。変換のバグはほぼここで捕まる。
//
// 自作のエンコーダを自作の期待値で確かめても準拠の証明にはならないので、
// この validator はまず外部の mjson で較正する（弾かないことを確かめる）。
// 較正を通していない validator は、自分のバグに合わせて緩くなっているとみなす。

export interface MjaiProblem {
  /** 何件目のイベントか（0 始まり）。 */
  index: number;
  type: string;
  message: string;
}

export interface ValidateOptions {
  dialect?: MjaiDialect;
  /** 牌が伏せられていない牌譜（replay mode）なら true。"?" が出たら問題にする。 */
  unmasked?: boolean;
}

type Ev = Record<string, unknown>;

/** 赤を 5 に畳んだ牌の種類。枚数を数えるときは赤と素の 5 を区別しない。 */
const kindOf = (pai: string): string => (pai.endsWith("r") ? pai.slice(0, -1) : pai);

/**
 * 1 人分の手牌。伏せ牌があるので「見えている牌の多重集合」と「伏せ牌の枚数」を持つ。
 * 鳴きは 3 枚（槓も 3 枚と数える。手牌の枚数は槓でも変わらないため）。
 */
class Hand {
  known = new Map<string, number>();
  hidden = 0;
  melds: string[][] = [];

  add(pai: string) {
    if (pai == "?") this.hidden++;
    else this.known.set(pai, (this.known.get(pai) ?? 0) + 1);
  }

  /** 1 枚減らす。見えている牌を優先し、無ければ伏せ牌を崩す。 */
  remove(pai: string): boolean {
    const n = this.known.get(pai) ?? 0;
    if (n > 0) {
      if (n == 1) this.known.delete(pai);
      else this.known.set(pai, n - 1);
      return true;
    }
    if (this.hidden > 0) {
      this.hidden--;
      return true;
    }
    return false;
  }

  /** 手牌にある枚数（鳴きを 3 枚ずつ含む）。 */
  get size(): number {
    let n = this.hidden + this.melds.length * 3;
    for (const v of this.known.values()) n += v;
    return n;
  }

  /** 見えている牌すべて（鳴きを含む）。枚数の上限を数えるのに使う。 */
  *visible(): Generator<string> {
    for (const [pai, n] of this.known) for (let i = 0; i < n; i++) yield pai;
    for (const m of this.melds) for (const pai of m) yield pai;
  }
}

/**
 * イベント列を検査して、見つかった問題を返す。空なら問題なし。
 *
 * 検査するのは §7.5 の不変条件。
 *  - 構造: 各イベントがスキーマに適合する
 *  - 進行: 手牌の枚数、consumed が手牌にあること、dahai の前に必ずツモか鳴きがあること、
 *          立直の 3 段（reach → dahai → reach_accepted）、hora の牌が直前の牌と一致すること
 *  - 枚数: 同じ種類の牌が場に 5 枚以上見えないこと（赤は素の 5 と合算）
 *  - 点数: deltas の総和が 0 であること
 */
export const validateMjaiLog = (
  events: readonly unknown[],
  opts: ValidateOptions = {}
): MjaiProblem[] => {
  const dialect = opts.dialect ?? "strict";
  const problems: MjaiProblem[] = [];

  let hands: Hand[] = [];
  let inKyoku = false;
  /** 場に見えている牌（河・鳴き・ドラ表示牌）。手牌は別に数える。 */
  let table: string[] = [];
  /**
   * 直前の「誰かの行動」。dahai の前にツモか鳴きがあることの確認に使う。
   *
   * `dora` は行動ではなく場の出来事なので飛ばす。原典の実ログでは大明槓が
   * `daiminkan → tsumo → dora → dahai` の順になっていて、新ドラが打牌の前に割り込む。
   */
  let prev: Ev | null = null;
  /** 直前の打牌。鳴き・ロンの対象になる。 */
  let lastDahai: { actor: number; pai: string } | null = null;
  /** 直前のツモ牌。ツモ和了の確認に使う。 */
  let lastTsumo: { actor: number; pai: string } | null = null;
  /** 立直を宣言して、まだ宣言牌を切っていない人。 */
  let reachDeclared: number | null = null;
  /** 宣言牌を切って、まだ供託が成立していない人。 */
  let reachPending: number | null = null;

  const add = (index: number, type: string, message: string) =>
    problems.push({ index, type, message });

  const startKyoku = (index: number, tehais?: unknown) => {
    hands = [new Hand(), new Hand(), new Hand(), new Hand()];
    table = [];
    inKyoku = true;
    lastDahai = null;
    lastTsumo = null;
    reachDeclared = null;
    reachPending = null;
    if (Array.isArray(tehais))
      tehais.forEach((t, i) => {
        if (Array.isArray(t)) t.forEach((p) => hands[i]?.add(String(p)));
      });
    void index;
  };

  /** 場と全員の手牌を合わせて、同じ種類が 5 枚以上見えていないか。 */
  const checkCounts = (index: number, type: string) => {
    const counts = new Map<string, number>();
    const bump = (pai: string) => {
      const k = kindOf(pai);
      const n = (counts.get(k) ?? 0) + 1;
      counts.set(k, n);
      if (n > 4)
        add(index, type, `${k} が場に ${n} 枚見えている（4 枚を超えた）`);
    };
    for (const pai of table) bump(pai);
    for (const h of hands) for (const pai of h.visible()) bump(pai);
  };

  events.forEach((raw, index) => {
    const e = raw as Ev;
    const type = String(e?.type ?? "(no type)");

    const schema = checkSchema(raw, dialect);
    if (schema != null) {
      add(index, type, `スキーマ違反: ${schema}`);
      return; // 形が壊れているものを盤面に入れると、以降が総崩れになる
    }

    const actor = typeof e.actor == "number" ? e.actor : -1;
    const hand = hands[actor];

    if (opts.unmasked && JSON.stringify(e).includes('"?"'))
      add(index, type, `伏せ牌（?）が残っている`);

    switch (type) {
      case "start_kyoku":
        startKyoku(index, e.tehais);
        table.push(String(e.dora_marker));
        checkCounts(index, type);
        break;

      // 原典の古い形。配牌が start_kyoku ではなくこちらで来る。
      case "haipai":
        if (!inKyoku) startKyoku(index);
        (e.pais as unknown[]).forEach((p) => hands[actor]?.add(String(p)));
        break;

      case "tsumo": {
        if (!inKyoku) {
          add(index, type, `局が始まっていない`);
          break;
        }
        hand?.add(String(e.pai));
        lastTsumo = { actor, pai: String(e.pai) };
        if (hand && hand.size != 14)
          add(index, type, `ツモ後の手牌が ${hand.size} 枚（14 枚のはず）`);
        break;
      }

      case "dahai": {
        const pai = String(e.pai);
        // 打牌の前は必ず自分のツモか自分の鳴き
        const ok =
          prev != null &&
          prev.actor === actor &&
          ["tsumo", "chi", "pon", "reach", "haipai"].includes(
            String(prev.type)
          );
        if (!ok)
          add(
            index,
            type,
            `打牌の前が ${prev?.type ?? "(なし)"}（actor ${String(
              prev?.actor
            )}）で、自分のツモでも鳴きでもない`
          );
        if (hand && !hand.remove(pai))
          add(index, type, `手牌に無い ${pai} を切っている`);
        if (hand && hand.size != 13)
          add(index, type, `打牌後の手牌が ${hand.size} 枚（13 枚のはず）`);
        table.push(pai);
        lastDahai = { actor, pai };
        if (reachDeclared != null) {
          if (reachDeclared != actor)
            add(index, type, `立直の宣言牌を別の人が切っている`);
          reachPending = reachDeclared;
          reachDeclared = null;
        }
        checkCounts(index, type);
        break;
      }

      case "chi":
      case "pon":
      case "daiminkan": {
        const consumed = (e.consumed as string[]).map(String);
        const pai = String(e.pai);
        if (lastDahai == null || lastDahai.pai != pai)
          add(index, type, `直前の打牌（${lastDahai?.pai ?? "なし"}）と ${pai} が一致しない`);
        if (lastDahai != null && lastDahai.actor != e.target)
          add(index, type, `target が直前の打牌者と一致しない`);
        for (const p of consumed)
          if (hand && !hand.remove(p))
            add(index, type, `手牌に無い ${p} を鳴きに使っている`);
        // 鳴かれた牌は河から鳴きへ移る。二重に数えない。
        const i = table.lastIndexOf(pai);
        if (i >= 0) table.splice(i, 1);
        hand?.melds.push([pai, ...consumed]);
        lastDahai = null;
        checkCounts(index, type);
        break;
      }

      case "ankan": {
        const consumed = (e.consumed as string[]).map(String);
        for (const p of consumed)
          if (hand && !hand.remove(p))
            add(index, type, `手牌に無い ${p} を暗槓に使っている`);
        // 暗槓は 4 枚だが、手牌の枚数の数え方は鳴きと同じ 3 枚扱いにする
        hand?.melds.push(consumed.slice(0, 3));
        table.push(consumed[3]);
        checkCounts(index, type);
        break;
      }

      case "kakan": {
        const pai = String(e.pai);
        if (hand && !hand.remove(pai))
          add(index, type, `手牌に無い ${pai} を加槓に使っている`);
        table.push(pai);
        checkCounts(index, type);
        break;
      }

      case "dora":
        table.push(String(e.dora_marker));
        checkCounts(index, type);
        break;

      case "reach":
        if (reachDeclared != null)
          add(index, type, `前の立直の宣言牌がまだ切られていない`);
        reachDeclared = actor;
        break;

      case "reach_accepted":
        if (reachPending == null)
          add(index, type, `宣言牌を切っていないのに供託が成立している`);
        else if (reachPending != actor)
          add(index, type, `立直した人と供託の成立した人が違う`);
        reachPending = null;
        break;

      case "hora": {
        const pai = String(e.pai);
        const tsumoWin = actor === e.target;
        const expected = tsumoWin ? lastTsumo : lastDahai;
        if (expected == null || expected.pai != pai)
          add(
            index,
            type,
            `あがり牌 ${pai} が直前の ${
              tsumoWin ? "ツモ" : "打牌"
            }（${expected?.pai ?? "なし"}）と一致しない`
          );
        if (tsumoWin && lastTsumo != null && lastTsumo.actor != actor)
          add(index, type, `ツモ和了の actor が直前のツモ者と違う`);
        checkDeltas(index, type, e);
        break;
      }

      case "ryukyoku":
        checkDeltas(index, type, e);
        break;

      case "end_kyoku":
        inKyoku = false;
        break;
    }

    // dora は場の出来事で、行動の連なりを切らない（上の prev の注記を参照）。
    if (type != "dora") prev = e;
  });

  /**
   * 点棒の保存則。
   *
   * 和了では供託（1000 の倍数）と積み棒（1 本場 300 点）が場から和了者へ流れるので、
   * 総和は 0 以上になる。ちょうど 0 になるとは限らないし、1000 の倍数にもならない
   * （1 本場だけなら 300）。確かめられるのは「100 点単位であること」と「負にならないこと」まで。
   * 供託と積み棒の本数まで見て厳密に照合するには `start_kyoku` の `honba` / `kyotaku` が要るが、
   * 原典の古いログはそれを持たない。
   *
   * 流局は場から点棒が出ないので、総和はちょうど 0 になる。
   */
  function checkDeltas(index: number, type: string, e: Ev) {
    const d = e.deltas;
    if (!Array.isArray(d)) return;
    const sum = d.reduce((a: number, b) => a + Number(b), 0);
    if (sum % 100 != 0)
      add(index, type, `deltas の総和が ${sum} で 100 点単位でない`);
    if (type == "hora" && sum < 0)
      add(index, type, `和了の deltas の総和が ${sum}（場から点棒が減っている）`);
    if (type == "ryukyoku" && sum != 0)
      add(index, type, `流局の deltas の総和が ${sum}（0 のはず）`);
  }

  return problems;
};
