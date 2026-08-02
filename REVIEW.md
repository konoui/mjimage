# mjimage 全体レビュー（`src/lib/controller/` を除く）

対象: `src/` 配下から `src/lib/controller/` を除いた全て（6,089 行 / テスト 3,882 行）
現状: `npx tsc --noEmit` エラーなし / `npm test` 311 passed + 7 expected fail（2026-08-01 時点）
実施状況: **高・中は全て対応済**（H1〜H5 / M1〜M14）。低は L1・L2・L4・L6・L11 が修正済。
M11・M12 と M9 の一部は指摘そのものに誤りがあったため訂正した。
公開型の変更（M6・M7）は 1.0.0 未リリースのため実施した。
観点: 集約度（責務の置き場所）・メソッドのわかりやすさ・実装内容の正しさ・公開 API・テスト
前提: `refactor-report.md`（phase2/phase3 で削除済み）の高・低はおおむね実施済み。本レポートは
現在のコードを対象に取り直したもので、前レポートからの積み残しには **(旧 Mn)** を付記する。

```
src/lib/core/          1,233 行  constants 208 / lexer 42 / parser 927 / wind-util 51
src/lib/calculator/    2,548 行  block-calculator 389 / yaku 459 / point-calculator 363 / hand 310
                                 shanten 260 / counts 231 / efficiency 118 / score 108 / fu 77
                                 block-util 76 / types 74 / tile 36 / serialize 33
src/lib/image/         1,055 行  image 578 / table 378 / render 64 / constants 30
src/lib/input/           382 行  table-yaml 162 / table-schema 102 / table-input 80 / seats 33
src/lib/svgjs/           488 行  svg 488
src/index.ts             154 行  公開 API の選別
src/browser/ src/cmd/ src/e2e/   274 行
```

全体としては、phase2/phase3 の分割で **calculator と input はかなり良い状態**にある。
役はテーブル駆動（`yaku.ts`）、探索は作業用の写し（`MutableCounts`）の上で行われ手牌を壊さない、
席順の語彙は `seats.ts` に一本化され、公開 API は `src/index.ts` で明示的に選別されている。
コメントも「なぜそうしたか」を書けている箇所が多い。

残っている問題は次の 3 系統に集約される。

1. **`core/parser.ts` だけが分割から取り残されている**（927 行 / 3 責務）
2. **枚数表の操作が `Hand` と `MutableCounts` に二重にある**（赤 5 の巻き戻しという最も繊細な処理が 2 箇所）
3. **入力・状態の検証が層をまたいで薄い**（valibot の issue をそのまま throw、一発が立直なしで成立、など）

---

## サマリ

| #   | 優先度 | 観点 | 箇所 | 概要 | 確認 |
|-----|--------|------|------|------|------|
| H1 | 高 | 集約度 | `core/parser.ts` | 927 行に牌モデル・ブロックモデル・字句/構文解析の 3 責務 | **修正済** |
| H2 | 高 | 正しさ | `calculator/yaku.ts:189` | 一発が立直していなくても成立する。役なしの手があがりになる | **修正済** |
| H3 | 高 | 集約度 | `calculator/hand.ts:155-214` / `counts.ts:172-230` | `inc`/`dec` がほぼ同一実装で二重。赤 5 の巻き戻しが 2 箇所 | **修正済** |
| H4 | 高 | 正しさ | `input/table-schema.ts:99` | `throw ret.issues` で Error でない値が飛ぶ。範囲外エラーはメッセージも空 | **修正済** |
| H5 | 高 | 公開 API | `point-calculator.ts:26-42` | `cfg` / `hand` が public。内部の正規化表現が v1.0.0 で凍結される | **修正済** |
| M1 | 中 | 正しさ | `input/table-yaml.ts:118-121` | `score:`（値なし）が既定 25000 ではなく 0 になる | **修正済** |
| M2 | 中 | 正しさ | `core/parser.ts:911` | オペレータ 4 個以上の牌が「expected a number」で落ちる | **修正済** |
| M3 | 中 | 正しさ | `core/parser.ts:905-927` | 同じオペレータの重複を許す（`rrr5m` が通る） | **修正済** |
| M4 | 中 | 正しさ | `core/parser.ts:404-417` | `new BlockAnKan([裏牌のみ])` が TypeError | **修正済** |
| M5 | 中 | 重複コード | `image/image.ts:238-308` | 5 つの `createBlockXxx` が同一実装。表と二重の分岐 | **修正済** |
| M6 | 中 | わかりやすさ | `point-calculator.ts:84,102` | `base` / `basePoints` / `points` の 3 つが別物で紛らわしい | **修正済** |
| M7 | 中 | API 設計 | `point-calculator.ts:223` | ロン/ツモの区別が牌のオペレータ頼み。渡し忘れは深部の assert で落ちる | **修正済** |
| M8 | 中 | わかりやすさ | `calculator/shanten.ts:121-172` | `patternA`/`patternB` が無名の概念。12 行の比較がコピペで 2 回 | **修正済** |
| M9 | 中 | わかりやすさ | `block-calculator.ts:152-190` | `handleNumType`/`handleZ`/`handleBack`。`.sort()` の理由が不明 | **修正済** |
| M10 | 中 | 死んだコード | `calculator/fu.ts:73` | `isAllRuns` の最終代入が読まれない。`!` は国士/九蓮を暗黙に除外 | **修正済** |
| M11 | 中 | 死んだコード | ~~`image/index.ts`~~ / `table-schema.ts:85` | 未使用の型（barrel は**指摘が誤り**。テストが使っている） | **訂正・一部修正済** |
| M12 | 中 | 正しさ | `core/parser.ts:191-194` | `UNKNOWN` ブロックも牌がソートされ、入力順が失われる | **訂正**（実害なし） |
| M13 | 中 | 出力品質 | `svgjs/svg.ts` / `image/table.ts` | `<g width=...>` という無効属性。回転 0 度でも `<g>` を二重に包む | **修正済** |
| M14 | 中 | テスト | `__tests__/` | 公開 API の `Efficiency`・`score.ts`・`serialize.ts` に専用テストがない | **修正済** |
| L1〜L11 | 低 | 各種 | （後述） | メッセージの誤字、import の表記ゆれ、README の記載漏れ、CI | 読み |

---

## 高

### H1. `core/parser.ts` が 927 行で 3 責務を持つ — 修正済

**箇所**: `src/lib/core/parser.ts`

phase2 で `calc.ts`（1,938 行）は分割されたが、2 番目に大きい `parser.ts` は手つかずで、
現在は非 controller コードで最大のファイルになっている。中身は 3 つに分かれる。

| 範囲 | 内容 | 行数 |
|---|---|---|
| `parser.ts:30-173` | 牌のモデル（`Tile`・比較関数・`is5Tile`） | 約 140 |
| `parser.ts:175-621` | ブロックのモデル（`Block` + 派生 11 クラス + `blockWrapper`） | 約 450 |
| `parser.ts:623-927` | 字句/構文解析（`Parser`・`detectBlockType`・`makeTiles` ほか） | 約 300 |

問題は行数そのものより **依存の向きが混ざっている**こと。ブロックのモデル（`Block.from` /
`Block.deserialize`、`BlockChi.from` など 10 個の static）が `Parser` を呼び、`Parser` が
`blockWrapper` を呼ぶ、という相互参照がファイル内に閉じているため、外からは循環に見えない。
`core/index.ts:1-2` のコメントが「barrel を挟むと TDZ になる」と警告しているのは、この構造の裏返し。

**修正内容**: 3 ファイルに分けた。循環の原因は「文字列から生成する static」だけだったので、
`Parser` が抱えていた 2 つの処理を下の層へ出して解いた。

| ファイル | 内容 | 行数 |
|---|---|---|
| `core/tile.ts` | `Tile`、比較関数、`is5Tile`、牌 1 枚単位の字句解析、`scanTileSeparators` | 361 |
| `core/block.ts` | `Block` + 派生 11 クラス、`blockWrapper`、`detectBlockType`、`makeBlocks` | 557 |
| `core/parser.ts` | `Parser` のみ（走査 → 暗黙のツモブロック → ブロック組み立て） | 70 |

```
core/tile.ts  ←  core/block.ts  ←  core/parser.ts     依存は一方向
```

- `Parser.tileSeparators()` の走査ループ → `tile.ts` の `scanTileSeparators(input)`
- `Parser.makeBlocks()` → `block.ts` の `makeBlocks(tileSeparators)`

これで `Tile.from` は `tile.ts` 内、`Block.from` は `block.ts` 内で完結し、どちらも `Parser` を
参照しなくなった。`options.enableImplicitTsumoBlock` と `reconstruct` は `Parser` にそのまま残る
（`Block.from` は元から通っておらず、`Tile.from` は 1 枚の入力では `reconstruct` が必ず
早期 return するため、挙動は変わらない）。牌レベルの字句解析を `tile.ts` から切り離さないのは、
`Tile.from` があるため「牌の値」と「牌の書き方」を分けると必ず循環するため。

`from "../core/parser"` と書いていた 33 ファイルは `../core`（barrel）へ寄せた。
`core/index.ts` の「barrel は外向きの公開面、兄弟モジュールは実体を直接参照する」という
既存の規約どおりになる。controller の 7 ファイルは import 行のみの変更。

**検証**: `src/index.ts` が公開する 88 個の名前がセッション開始時（HEAD）と完全に一致することを
差分で確認。スナップショット差分なし、`npm test` 310 passed、ビルド 2 種・e2e リプレイ・
30 局のシミュレーションも通過。`grep` で `tile.ts` / `block.ts` が `./parser` を
import していないことも確認した。

### H2. 一発が立直していなくても成立する — 修正済

**箇所**: `src/lib/calculator/yaku.ts:189`

```ts
{ name: "一発", han: 1, match: (_h, ctx) => ctx.oneShotWin },
```

`ctx.reached` を見ていない。裏ドラは同じファイルの `yaku.ts:456` で
`if (ctx.isHandReached && hidden > 0)` と立直を条件にしているので、一発だけが素通しになっている。

**確認**（立直していない手に `oneShotWin: true` を渡す）:

```
入力: 234m234p234s55z67s + ロン 8s / reached なし / oneShotWin: true
結果: 40符3飜 5200  yakus = 一発1, 三色同順2
```

`BoardContext.oneShotWin` は利用者（controller や外部の呼び出し側）が渡す値なので、
計算器側が守っていないと、役なしの手があがりになる。

**修正内容**: `ctx.reached`（0: なし / 1: 立直 / 2: ダブル立直）を条件に加えた。

```ts
match: (_h, ctx) => ctx.reached > 0 && ctx.oneShotWin,
```

回帰テストを `yaku.test.ts` に 3 本足した（修正前は後者 2 本が落ちることを確認済み）。

- `一発/ダブル立直でも成立する` — `reached == 2` を落とさないこと
- `一発は立直していないときは付かない` — 役一覧に「一発」が出ないこと
- `一発だけでは役なしのままあがれない` — 西の単騎待ち（役なし）で `calc()` が `false` を返すこと

同様に `replacementWin`（嶺上開花＝カンが前提）・`quadWin`（搶槓＝他家のカンが前提）も
手牌だけからは検証できないが、こちらは計算器側で検証する手段がないため、
「呼び出し側が保証する値」であることを `BoardContext`（`types.ts:7-23`）に明記するのが現実的。

### H3. `Hand` と `MutableCounts` が枚数表の操作を二重に持つ — 修正済

**箇所**: `src/lib/calculator/hand.ts:155-214` と `src/lib/calculator/counts.ts:172-230`

`Hand.inc`/`Hand.dec` と `MutableCounts.inc`/`MutableCounts.dec` は、エラーメッセージまで含めて
ほぼ同一の実装（各 30 行 × 2 組 = 約 120 行）。中でも次の巻き戻しは、このライブラリで最も
間違えやすい処理が 2 箇所に写経されている状態にある。

```ts
// hand.ts:205-210
// r5 ではなく 5 で減算される際に最後の牌が red であれば red を 0 にする。
if (is5Tile(t) && this.get(t.t, 5) == 0 && this.get(t.t, 0) > 0) { ... }

// counts.ts:196-200  ← 同じコメント・同じ条件
if (is5Tile(t) && counts[5] == 0 && counts[0] > 0) { ... }
```

差分は「巻き戻した牌をどう返すか」（`backup.pop()` して差し替える / 配列の末尾を直接書く）と、
`Hand` 側が `data.backCount` を持つ点だけ。`counts.ts:61-69` に `countsOf(hand)` があるので、
**`Hand` が `TileCounts` を直接持つのをやめ、枚数の増減を counts 側の関数へ委譲する**のが素直。

**修正内容**: 枚数の増減を持つ `TileStore`（`counts.ts`）を作り、`Hand` と `MutableCounts` の
両方がこれを持つ形にした。`inc`/`dec`/`get`/`sum`/`clone` の実装は 1 つだけになる。

```
Hand.data          counts: TileCounts + backCount: number  →  counts: TileStore
Hand.get/inc/dec/sum                                       →  TileStore へ委譲
MutableCounts      counts + backCount を自前で持つ           →  TileStore を包む

src/lib/calculator/hand.ts     310 行 → 245 行
src/lib/calculator/counts.ts   231 行 → 296 行   （重複していた約 120 行が 1 実装に）
```

赤 5 の巻き戻し（`counts[0] = 0` の箇所）と枚数の検査は、リポジトリ全体で 1 箇所になった。
`MutableCounts` の公開面（`Counts` の実装・`without`/`with`）と `Hand` の公開面は変えていない。

**副作用**: `Hand` の枚数エラーの文脈が「晒した牌を含む手牌の文字列」から「手の内の牌」に変わった。
枚数の検査はもともと手の内だけを見ている（`Hand.get` は晒した牌を数えない）ので、
表示もそちらに揃う形になる。

**検証**:

- `calculator.test.ts` の白箱テストを内部構造から切り離した（`(h as any).data` を
  素の値へ落とす `HandSnapshot` に変更）。`backCount` の期待値は `back` になる。
- 「赤 5 の扱いが `Hand` と `MutableCounts` で揃う」ことを見るテストを 1 本追加した。
- `npm test` 289 passed。`npm run e2e test`（保存済み対局のリプレイ）と
  20 局のシミュレーションが通ることも確認した（`ActorHand` が `Hand` を継承しているため）。

### H4. 入力エラーが `Error` ではない値として投げられる — 修正済

**箇所**: `src/lib/input/table-schema.ts:94-102`

```ts
const ret = safeParse(tableInputSchema, rawInput);
if (!ret.success) {
  throw ret.issues;   // valibot の issue 配列がそのまま飛ぶ
}
```

`e instanceof Error` が false、`e.message` も stack もない。卓の入力は利用者が手で書くものなので、
ここは「利用者の誤りを伝える」唯一の場所にあたる。実際の挙動:

```
入力: table: / 1z: / score: abc
throw: [{"kind":"schema","type":"number","input":null,...,"message":"Invalid type: Expected number but received NaN", "path":[...]}]

入力: table: / board: / sticks: / reach: 99
throw: [{"kind":"validation","type":"max_value","message":"", ...}]   ← message が空
```

2 番目は `table-schema.ts:58,62` で `minValue(0, "")` / `maxValue(9, "")` と
空文字のメッセージを渡しているため。ブラウザ入口（`browser/mjimage.ts:77-80`）は
`console.error("encounter unexpected error:", e)` で受けるだけなので、
利用者には「何が悪いか」がまったく届かない。

**修正内容**: `summarize(ret.issues)` で人が読める文にして `Error` にし、
元の issue は `cause` に残した。空文字のメッセージは削り、valibot の既定文言に任せた。

```ts
throw new Error(`invalid table input:\n${summarize(ret.issues)}`, {
  cause: ret.issues,
});
```

修正後の出力:

```
入力: table: / board: / sticks: / reach: 99
Error: invalid table input:
× Invalid value: Expected <=9 but received 99
  → at board.sticks.reach
```

回帰テストは M1 と併せて `table-input.test.ts` に 3 本（修正前に落ちることを確認済み）。

### H5. `PointCalculator` の内部状態が公開 API に出ている — 修正済

**箇所**: `src/lib/calculator/point-calculator.ts:25-42`、`dist/index.d.ts:726-748`

`cfg`（17 フィールド）と `hand` が public のため、`BoardContext` を正規化した内部表現が
そのまま `.d.ts` に出ている。`package.json` は既に `1.0.0` なので、
`cfg.orig` のような実装都合の名前が semver で凍結されることになる。

```ts
export declare class PointCalculator {
    hand: Hand;
    cfg: { doras: readonly Tile[]; ...; orig: BoardContext; };
```

前レポート H1 の残り。

**修正内容**: `cfg` / `hand` を `private readonly` にした。`cfg` は `PointCalculator` の
内部からしか参照されておらず（`point-calculator.ts` 内 20 箇所のみ）、外部の参照はゼロだった。
同じ理由で `BlockCalculator.hand` / `ShantenCalculator.hand` も `private readonly` にしている。

```
dist/index.d.ts   1,138 行 → 1,119 行
    hand: Hand;                                     →  private readonly hand;
    cfg: { doras; ...17 フィールド...; orig };       →  private readonly cfg;
```

`getWinningHands` は `yaku.test.ts` / `calculator.test.ts` が
「役の一覧だけを見る」ために使っているので public のまま残した。

---

## 中

### M1. `score:`（値が空）が 0 点になる — 修正済

**箇所**: `src/lib/input/table-yaml.ts:117-121`

```ts
const num = (node: Section, key: string): number | undefined => {
  const v = text(node, key);
  return v == null ? undefined : Number(v);   // Number("") === 0
};
```

キーだけ書いて値を省いた場合、`text()` は `""` を返すので `undefined` にならず、
schema の既定値（25000）が使われずに 0 になる。

```
入力: table: / 1z: / score:
結果: {"discard":"","hand":"","score":0}     ← 期待は 25000
```

`sticks.reach` / `dead` も同様（既定値がたまたま 0 なので露見しない）。

**修正内容**: 空文字を「無い」とみなして `undefined` を返し、既定値を schema に任せるようにした。
併せて、数値として読めない値はキー名付きで弾く（従来は valibot まで NaN が流れていた）。

```ts
if (v == null || v == "") return undefined;
const n = Number(v);
if (Number.isNaN(n)) throw new Error(`${key} must be a number: ${v}`);
```

```
入力: table: / 1z: / score:        => score: 25000       （旧: 0）
入力: table: / 1z: / score: abc    => Error: score must be a number: abc
```

### M2. 1 枚の牌に付けられるオペレータが実質 3 個まで — 修正済

**箇所**: `src/lib/core/parser.ts:905-927`

```ts
// 4 is temporary value
for (let i = 0; i < 4; i++) {
  const c = l.peekCharN(i);
  if (ops.includes(c)) found.push(c as Operator);
  else { ... return tile; }
}
return null;   // 4 個読んでも数字に届かなければ「オペレータではない」と判断
```

`OP` は 6 種類あるのに、4 文字目までに数字が来ないと `null` を返し、
呼び出し側（`parser.ts:699-700`）で数字として読み直そうとして落ちる。

```
'-5m'     => -5m
'-t5m'    => -t5m
'-t^5m'   => -t^5m
'-t^r5m'  => !! expected a number but got: -     ← オペレータ 4 個で破綻
```

`^`（ツモ切り）は河の牌に、`-`（横向き）は鳴かれた牌に付くので、`-^r5m` のような
3 個以上の組み合わせは実際に起こりうる。

**修正内容**: 上限をオペレータの種類の数（`Object.values(OP).length`）に変え、
数字に届かなかった場合は「牌ではない」と「オペレータが多すぎる」を区別するようにした。

```
'-t^5m'      => -t^5m
'-^rt5m'     => -t^r5m   （旧: expected a number but got: -）
'rrrrrrrr5m' => Error: too many operators for a tile: rrrrrrr in rrrrrrrr5m
```

### M3. 同じオペレータの重複が通る — 修正済

**箇所**: `src/lib/core/parser.ts:909-923`

`found` は配列で、重複を弾いていない。`new Parser("rrr5m").tiles()` は `rrr5m` を返していた。
`Tile.clone` は `Set` で畳んでいる（`parser.ts:142`）のに、パース時だけ畳まれない。

**修正内容**: `Tile` のコンストラクタでオペレータを正規化（重複除去 + 並びを固定）した。
`toString()` 側の `sort` は不要になり、書く順番が違っても同じ牌になる。

```
'rrr5m'  => r5m
'--5m'   => -5m
't-5m' と '-t5m'  => どちらも -t5m
```

牌は探索中に大量に作られるため、オペレータが 0 個・1 個のときは畳む処理を通さない。

### M4. `BlockAnKan` が裏牌だけの配列で TypeError になる — 修正済

**箇所**: `src/lib/core/parser.ts:403-417`

```ts
const nonBacks = tiles.filter((v) => v.t != TYPE.BACK);
const s = nonBacks[0];                 // 全部裏牌なら undefined
if (nonBacks.length < tiles.length) {
  if (is5Tile(s)) { ... }              // TypeError
```

```
new BlockAnKan([_, _, _, _])  =>  !! Cannot read properties of undefined (reading 'isNum')
```

`BlockAnKan.from("____")` は `deserialize` の型照合が先に弾くので、パース経由では起きない。
ただし `BlockAnKan` は公開クラスなので、直接 new すると落ちる。

**修正内容**: コンストラクタで「表向きの牌が 1 枚以上必要」を `assert` で表明した。

```
new BlockAnKan([_, _, _, _])
  => Error: an-kan block must have at least one face-up tile: ____
     （旧: Cannot read properties of undefined (reading 'isNum')）
```

### M5. `createBlockXxx` 5 つが同一実装 — 修正済

**箇所**: `src/lib/image/image.ts:236-308`

```ts
createBlockDiscard(block) { return this.createHorizontalBlock(block.tiles); }
createBlockHand(block)    { return this.createHorizontalBlock(block.tiles); }
createBlockChi(block)     { this.assertHasHorizontal(block); return this.createHorizontalBlock(block.tiles); }
createBlockPon(block)     { this.assertHasHorizontal(block); return this.createHorizontalBlock(block.tiles); }
createBlockDaiKan(block)  { this.assertHasHorizontal(block); return this.createHorizontalBlock(block.tiles); }
```

種別ごとの分岐は既に `BLOCK_RENDERERS`（`image.ts:426-460`）にテーブル化されているので、
`ImageHelper` 側で同じ分類を 5 メソッドに分ける意味がなくなっていた。

**修正内容**: 5 つを `createBlockRow(block, { requireHorizontal })` 1 つにまとめ、
横向きの牌を要求するかどうかは呼び出し側（テーブル）が指定する形にした。

```ts
[BLOCK.PON]: (b, h) => sized(h, b, h.createBlockRow(b, { requireHorizontal: true })),
[BLOCK.HAND]: (b, h) => sized(h, b, h.createBlockRow(b)),
```

残るのは形が本当に違う 4 つ（`createBlockShoKan` の 2 段積み、`createBlockAnKan` の
`tilesWithBack`、`createBlockDora`/`Tsumo` の注記）だけになった。

### M6. `base` / `basePoints` / `points` の 3 つが紛らわしい — 修正済

**箇所**: `src/lib/calculator/point-calculator.ts:70-107`

- `scoreInfo.base` — 点数計算の基礎点（満貫 2000 など）
- `basePoints` — 供託・積み棒を足す**前**のあがり点
- `points` — 供託・積み棒を足した**後**のあがり点

名前からは `basePoints` が `base` の複数形にしか見えない。さらに:

```ts
const basePoints = deltas[scoreInfo.myWind];        // :84  ← 供託前
this.addStickPoints(deltas, ...);                   // :86  ← deltas を破壊的に更新
return { ..., points: deltas[scoreInfo.myWind], basePoints, ... };  // :102
```

`points` と `basePoints` の違いが「84 行目と 102 行目の間に 86 行目がある」という
**文の順序だけ**で決まっていた。

**修正内容**（1.0.0 未リリースのため公開型を変更した）:

| 変更前 | 変更後 |
|---|---|
| `WinResult.basePoints` | `WinResult.pointsWithoutSticks` |
| ローカル変数 `base`、`getPointDescription({ base })` | `baseScore` |
| `HAN_SCORING_TABLE` の `points` | `baseScore` |
| `getBasePoints()` | `baseScoreOf()` |

`addStickPoints`（`deltas` を書き換える）をやめ、`stickDeltas()` が供託・積み棒の
点数移動を別の表として返すようにした。あがり点と供託を足して最終的な `deltas` を作るので、
`points` と `pointsWithoutSticks` の違いが文の順序ではなく値の出どころで決まる。

```ts
const winDeltas = this.calculateDeltas(...);      // 手牌のあがり点だけ
const stickDeltas = this.stickDeltas(myWind);     // 供託・積み棒だけ
// deltas = winDeltas + stickDeltas
points: deltas[myWind], pointsWithoutSticks: winDeltas[myWind],
```

### M7. ロン/ツモの区別が牌のオペレータ頼み — 修正済

**箇所**: `src/lib/calculator/point-calculator.ts:206-230`、`block-calculator.ts:332-336`

あがり方は `BoardContext` にはなく、`BlockCalculator.markedHand` が
「あがり牌に `OP.RON` が付いていたらロン、`OP.TSUMO` か `hand.drawn != null` ならツモ、
それ以外はロン」（`block-calculator.ts:332-336`）と推測して牌に印を付ける。
`PointCalculator` はその印を読み直してツモ判定する（`point-calculator.ts:206-208`）。

結果、`ronWind` を渡し忘れると次の場所で落ちる。

```
new PointCalculator(hand, { doraIndicators: [], round: "1z1", myWind: "2z" }).calc(...)
  => Error: tumo is false but ron wind is null      （point-calculator.ts:223、"tumo" は誤字）
```

利用者から見ると「`BoardContext` の必須項目は満たしたのに、手牌の書き方によって
`ronWind` が要る/要らない」という関係になっていて、型では表せていなかった。

**修正内容**: `ronWind?: Wind` を判別可能ユニオンの必須項目に置き換えた。

```ts
export type WinBy =
  | { readonly type: "tsumo" }
  | { readonly type: "ron"; readonly from: Wind };

export interface BoardContext {
  ...
  winBy: WinBy;   // 必須。ロンなら放銃した家も持つ
}
```

- 「ロンなのに放銃者が無い」という状態を型が作れなくなり、深部の assert は消えた。
- あがり方の宣言が手牌のあがり牌の印と食い違っている場合は、
  `win type mismatch: boardContext says tsumo but the winning tile is marked as ron`
  という形で `calc()` の入口に近い場所で落ちる（回帰テストあり）。
- 移行して分かったこと: 既存テストの `ronWind: WIND.S` は 4 箇所中 3 箇所が
  **実際にはツモあがりで、値が使われていなかった**（死んだ設定）。
  型が緩いと設定ミスが放置されるという、この項目の主旨そのものの例になっていた。
- controller 側も `env.ronWind = params.discardedBy`（`discardedBy` は `Wind | undefined`）
  という穴があり、`winBy` 化に伴って「ロンなのに放銃者が無い」場合を明示的に弾くようにした。

### M8. `numberTilePatterns` の `patternA` / `patternB` — 修正済

**箇所**: `src/lib/calculator/shanten.ts:121-172`

シャンテン計算の中核だが、次の点で追いにくい。

- `patternA` / `patternB` が何を表すか、どこにも書かれていない
  （読む限り A は「孤立牌を最小化する取り方」、B は「面子数を最大化する取り方」）
- 面子を取る場合と刻子を取る場合で、**12 行の比較ブロックが完全にコピペで 2 回**現れる（`:137-151` と `:156-170`）
- `(r.patternA[0]++, r.patternB[0]++);` というカンマ式の文（`:138`, `:155`）
- 変数名 `max` に対して `patternA` は最小化、`patternB` は最大化という逆向きの更新
- `[number, number, number]` のタプルに `// [set, pair, isolated]` とコメントが付くだけで、
  同じ意味のタプルが `standardShantenOf`（`:72,80,95`）にも別々に現れる

**修正内容**: `Grouping`（`sets` / `partials` / `isolated`）という名前付きの型を作り、
`patternA` / `patternB` を `fewestIsolated` / `mostSets` に改名した。
12 行のコピペ 2 箇所は `hasFewerIsolated` / `hasMoreSets` と `pickBetter` に畳み、
カンマ式（`(r.patternA[0]++, r.patternB[0]++)`）と配列の破壊的更新もなくした。
`standardShantenFrom` は `shantenOfGrouping(g, hasPair)` にし、`n` を `maxBlocks` にした。
字牌・裏牌の分け方も `honorGrouping` / `backGrouping` として切り出した。

**検証**: アルゴリズムの書き換えなので、`git show HEAD` で取り出した旧実装と
新実装を同じ手牌に通す差分テストを行った。

```
ランダム手牌 4,000 通り（1〜13 枚）              不一致 0 件
ランダム手牌 4,000 通り（裏牌・鳴きを含む 13 枚）  不一致 0 件
```

`standardShantenOf` と `shantenOf` の両方で一致を確認している。

### M9. `handleXxx` という命名と、理由のない `sort` — 修正済

**箇所**: `src/lib/calculator/block-calculator.ts:145-190`

`handleNumType` / `handleZ` / `handleBack` は「何をするか」を名前が伝えていない
（実際は「その牌種から取りうる面子の組み合わせを全て返す」）。
`combinationsOfNumType` / `combinationsOfHonors` / `combinationsOfBacks` なら
`allBlockCombinations` の中で読める。

また `allBlockCombinations` の `.sort()` に理由が書かれていない。変数名 `vvv` も残っている。

**修正内容**: `handleNumType` → `combinationsOfNumType`、`handleZ` → `combinationsOfHonors`、
`handleBack` → `combinationsOfBacks` に改名し、`vvv` を `groups` にした。

`.sort()` は残し、何のための並び順か不明であることを TODO として書いた。

**訂正**: 当初「外すと controller の同順フリテンのテストが落ちる」と書いたが、これは誤り。
1 回の実行で落ちたのを根拠にしていたが、後で 3 回試すと外した状態でも全て通った。
落ちたのは L11 に書いた `controller.test.ts` のフレークで、`.sort()` とは関係がなかった。
現時点では「組み合わせの数には影響せず、結果のブロックの並び順だけが変わる」ことしか
確かめられていない。利用側が並び順に依存していないと確認できていないため、いまは残している。

### M10. `fu.ts` の死んだ代入と、暗黙の前提 — 修正済

**箇所**: `src/lib/calculator/fu.ts:68-76`

```ts
if (!isTsumo && !isCalled && fu == 30) isAllRuns = true;   // :73 この後 isAllRuns は読まれない
```

最後の代入は誰にも読まれない。平和かどうかの判定は `yaku.ts:155-164` が
`calcFu` の結果（20 符 / ロンで 30 符）を見て行っており、`fu.ts` 側の `isAllRuns` は
`:71` の「平和以外のツモは 2 符」にしか効かない。変数名と実際の役割が乖離しているので、
`isPinfu` に改名して `:73` を削るか、平和の判定自体を `fu.ts` から返す形にしたい。

同じファイルの `:19-21` と `:59` は `!`（non-null assertion）で、
「あがり牌のブロックと雀頭が必ずある」＝国士無双・九蓮宝燈は来ない、という前提に依存している。
実際に守っているのは `point-calculator.ts:117-131` の「役満が 1 つでもあれば通常役を評価しない」で、
`fu.ts` 単体では読み取れない。

**修正内容**: 死んだ代入を削り、`isAllRuns` を `isPinfu` に改名した（役としての判定は
`yaku.ts` が符の値から行う旨をコメントに残した）。`!` は `assert` に替え、
前提は `calcFu` の doc コメントに書いた。

### M11. 死んだ barrel と未使用の型 — 訂正・一部修正済

- ~~`src/lib/image/index.ts` — どこからも import されていない~~
  **訂正**: `image.test.ts` / `table.test.ts` / `svg.test.ts` の 3 つが `../image` として
  使っている。最初の調査で grep から `__tests__` を除外していたための誤り。barrel は残した。
  （本番コードからの参照が無いのは事実だが、それだけでは削る理由にならない）
- `src/lib/input/table-schema.ts:85` `RawWindInputs` — 定義のみで参照ゼロ。**削除した。**
- `src/lib/calculator/index.ts` は 14 モジュールを全放出するが、外から使うのは
  controller の 5 つだけ（`TileCounts` / `ShantenCalculator` / `calcEffectiveTiles` /
  `TileAnalysis` / `SerializedTileAnalysis` ほか）。barrel を保つなら公開したい名前を選別したい。（未着手）

### M12. `UNKNOWN` ブロックの牌がソートされる — 訂正（実害なし）

**箇所**: `src/lib/core/parser.ts:190-194`

```ts
if (this._type != BLOCK.IMAGE_DISCARD) {
  this._tiles = [...this._tiles].sort(compareTiles);
```

**訂正**: 並べ替えられること自体は事実だが、**観測できる影響はない**ので修正しなかった。

`detectBlockType` が `UNKNOWN` を返すのは「ツモ・ドラ演算子を持つ牌が 2 枚以上ある」場合だけで
（`parser.ts:805`）、`BLOCK_RENDERERS[UNKNOWN]`（`image.ts:452-459`）はまさにその条件で
例外を投げる。つまり記法から生まれた `UNKNOWN` は必ず描画前に弾かれる。

```
'1m2md3m'  => unknown:12d3m
render()   => Error: found an unknown block with operator tiles.
```

`BLOCK.HAND` のソートは「手牌は整列して描く」という仕様（`'321m'` → `123m`）。
河の並びは `IMAGE_DISCARD` として除外済み。`BlockOther` を直接 new して `UNKNOWN` を
作った場合だけ並べ替えが観測できるが、その経路のために挙動を変える理由は無いと判断した。

### M13. SVG 出力に無効な属性と余分な入れ子が出る — 修正済

**箇所**: `src/lib/image/table.ts:150,232`、`src/lib/image/table.ts:46-68`、`src/lib/svgjs/svg.ts:403-408`

```html
<g width="479.4" height="479.4">          ← g に width/height は無効（描画側は無視する）
  <g transform="matrix(1,0,0,1,239.7,479.4)"><g><g/></g></g>   ← 0 度回転でも 2 重に包む
```

**修正内容**:

- `size()` を `SvgNode` から `Mark`（座標を持つ要素）へ下ろした。`g` では呼べなくなり、
  ルートの `svg` にだけ別途持たせた（こちらは本来 width/height を持つ）。
  呼び出し側 2 箇所（`stickGroup` と `layoutSeats`）から `.size()` を外した。
- `simpleRotate` は 0 度のとき 1 段で返すようにした。回転する場合に 2 段必要な理由
  （`G.translate` が既存の平行移動を上書きするため、外側を呼び出し側の置き場所に空ける）は
  コメントに残した。
- `round()` は非有限値を `assert` で弾くようにした。`width="NaN"` が出力される代わりに、
  値を作った側に近い場所で落ちる。

**検証**: 卓のスナップショットが変わるので、更新前後で描画要素 141 個の**絶対座標を
突き合わせて完全一致を確認**した（変わったのは無効属性 2 個と `<g>` の入れ子だけ）。

```
タグ数 273 → 269
- <g width="551.76" height="551.76">   → <g>
- <g><g/></g>（0 度の余分な一段）        → <g/>
```

### M14. 公開 API のテスト空白 — 修正済

`__tests__/` は 289 ケースあり、パーサ・役・符・卓レイアウト（`utils/geometry.ts` で
SVG から実配置を読み取る不変条件テスト）はよく作られている。一方で次は専用テストがない。

| 対象 | 公開 | テスト |
|---|---|---|
| `Efficiency.calcEffectiveTiles` / `getEffectiveTiles` | あり（`index.ts:75`） | なし（controller 経由の間接的なもののみ） |
| `score.ts` の `ronPoints` / `tsumoPoints` / `getPointDescription` | `getPointDescription` のみ | `PointCalculator` 経由のみ |
| `serialize.ts` の往復（`serializeWinResult` → `deserializeWinResult`） | あり | なし |
| `input/table-yaml.ts` の異常系（重複キー・未知キー・コロンなし） | 間接 | 一部のみ |

**修正内容**: 2 つのテストファイルを追加した（11 ケース、`npm test` は 289 → 300）。

- `__tests__/efficiency.test.ts` — 待ち牌・`typeFilter`・`standardTypeOnly`、
  打牌候補の絞り込み、`arrangeRed` の有無で赤 5 が分かれる／まとまること、打牌候補が空のとき例外。
- `__tests__/serialize.test.ts` — 鳴きと赤ドラを含むあがりで往復し、再シリアライズが一致すること、
  ブロック種別（チー = 記法から決まる種別 / 順子・雀頭 = 計算の過程でだけ現れる種別）と
  ロン牌・赤の印が保たれること、盤面の牌が `Tile` に戻ること、点数と役が変わらないこと。

`serialize` の往復は `Block.deserialize` の「計算過程でだけ現れる種別は型を照合しない」
（`parser.ts:19-24, 217-225`）という分岐を両方通る形にした。
`score.ts` の点数関数は `PointCalculator` 経由の既存テストで押さえられているので、
専用テストは足していない。

---

## 低

- **L1**（修正済）: `Block.deserialize` のエラーメッセージ先頭に余分な `"` が入っていた（`parser.ts:222`）。
  実際の出力: `"expected type ankan but got simple-discard: ____`
- **L2**（修正済）: `assert(condition: any, message?: string)`（`assert.ts:1`）。`unknown` に変え、
  省略時の既定メッセージ（`assertion failed`）を持たせた。
- **L3**: import パスの表記ゆれ。`"../core"` と `"../core/"` が混在（`image/table.ts:1` ほか）。
- **L4**（修正済）: `blockWrapper` の `case BLOCK.CHI:` がブレースなしで `const` を宣言していた
  （`parser.ts:595-598`）。ブロックで囲んだ。
- **L5**: README に `v`（ロン）オペレータの記載がない。また `d` が
  「ドラ牌のオペレータ」と「三元牌のエイリアス」の 2 つの意味を持つこと
  （`parser.ts:868-872` / `constants.ts:40`）が未記載。`3d4p` のように数字が先行すると
  エイリアス側が勝つので、記法として説明が要る。
- **L6**（修正済）: `table-input.ts:67` の `.replace(/\r?\n/g, "")` は、`Parser` が
  コンストラクタで `\s` を全除去している（`parser.ts:641`）ので冗長だった。削除した。
- **L7**: `src/cmd/README.md` が「Status: WIP」のまま。`cmd/index.ts:42-45` は
  スプライトを `../../public/svg/tiles.svg` に固定しており、`package.json` の `files` は
  `dist/index.*` だけなので、公開パッケージからは動かない（リポジトリ内専用ツール）。
- **L8**: `browser/mjimage.ts` の `console.debug` が常時出力（`:26,40,47,51`）。
  デバッグフラグで抑制したい。
- **L9**: `ScoreBoard.round` が表示文字列（`"東１局"`）を保持し、構造化された `Round` を失う
  （`table-input.ts:37,73`）。前レポート M1 の残り。`createTable` の利用者が局を
  プログラムから扱えない。`round: Round` を持ち、表示は `ROUND_MAP` で描画側が引く形が素直。
- **L10**: `Lexer` の `input` / `position` / `char` が public で書き換え可能（`lexer.ts:2-5`）。
  `peekCharN` が `position` を信頼しているので、外から壊せる。
- **L11**（修正済）: `controller.test.ts` のフレークと、CI に e2e が無かった件。

  **原因**: `MockWall.addExclude` の取りこぼし。テストは台本で使う牌（`1z` など）を
  `addExclude` で山から除くつもりだったが、実装が
  (1) 除外牌を引いたとき **1 回しか引き直さない**、
  (2) **他家の配牌（`initialHands`）には効かない**、
  という穴を持っていた。その結果、台本で足した牌と合わせて 5 枚目になり
  `[counter] tile 1z appears more than 4 times` で落ちる、あるいは他家が
  鳴き・あがりに反応して点数が変わる、という失敗が確率的に起きていた。

  **修正**: 除外牌を避けて引き直す `drawUnexcluded()` を作り、山からの draw と
  他家の配牌の両方に適用した。併せて `Math.random` を固定シードに差し替え、
  失敗したときに再現できるようにした（フレーク自体は `addExclude` の修正だけで解消し、
  乱数を固定しない状態でも 30 回連続で通ることを確認済み）。

  **確認**: 修正前は単体実行 15 回中 1 回失敗。修正後は 10 種類のシード × 各 1 回、
  および乱数固定なしで 30 回、全体実行 5 回のいずれも失敗なし。
  CI（`.github/workflows/test.yaml`）に `npm run e2e test`（保存済み対局のリプレイ）を追加した。

  なお **このフレークは一度 M9 の原因を誤診させた**（「`.sort()` を外すと落ちる」）。
  1 回の失敗を根拠に結論を出さないこと。

---

## 良い点（維持したい設計）

判断のために挙げておく。以下は今回変更を勧めない。

- **`src/index.ts` の明示的な公開面**（154 行）。`export *` を使わず、分類コメント付きで
  公開する名前を選別している。H5 の `cfg` を private にすれば、この方針が完成する。
- **`MutableCounts` の `without` / `with`**（`counts.ts:143-166`）。`try/finally` で
  抜き差しを必ず対にしているため、探索の途中で例外が出ても手牌が壊れない。
  `calculator.test.ts:136,150` に「計算器は手牌に触れない」「探索中の失敗で手牌が壊れない」
  という不変条件テストがあり、設計とテストが対応している。
- **`yaku.ts` の役定義テーブル**。`YakuDef` に名前・翻数（食い下がりは関数）・条件をまとめ、
  `yaku.test.ts:397-417` が「名前が一意」「役満には `isYakuman` が付く」「定義順に並ぶ」を
  テーブル自体に対して検証している。役の追加が 1 箇所で済む。
- **`image.ts` の `BLOCK_RENDERERS`**（`Record<BlockType, BlockRenderer>`）。
  `BLOCK` に値を足すと型エラーになるので、種別の追加漏れが起きない。
- **`seats.ts`**。席順の語彙が 1 箇所にあり、入力の読み取り（`table-input.ts:66-77`）と
  描画の配置（`table.ts:207-238`）が同じ `Seats<T>` を使う。
- **`WrappedSvg` / `RenderedSvg`**（`svg.ts:307-390`）。二重キャストを避けて
  内部表現を実際に隠せている。理由がコメントに残っている点も良い。
- **`__tests__/utils/geometry.ts`**。SVG 文字列の全文比較ではなく、
  出力から実際の配置を読み取って不変条件を検証している。スナップショットは代表 2 件のみ。

---

## 推奨する実施順序

1 と 2 は独立、3 以降は 1 の後だと衝突が少ない。

| 順 | 項目 | 規模 | 理由 |
|---|---|---|---|
| ~~1~~ | ~~H2（一発）・M1（score 0）・L1（誤字）~~ | 完了 | 回帰テスト 6 本を追加。修正前に落ちることを確認済み |
| ~~2~~ | ~~H4（throw ret.issues）＋ H5（`private cfg`）~~ | 完了 | `.d.ts` は 1,138 → 1,119 行 |
| ~~3~~ | ~~H3（`Hand` / `MutableCounts` の一本化）~~ | 完了 | 赤 5 の巻き戻しが 1 箇所に。e2e のリプレイでも確認 |
| ~~4~~ | ~~H1（`core/parser.ts` の 3 分割）~~ | 完了 | 927 行 → tile 361 / block 557 / parser 70。公開 API は不変 |
| ~~5~~ | ~~M5・M8・M9（重複と命名）~~ | 完了 | M8 は旧実装との差分テスト 8,000 手牌で一致を確認 |
| ~~6~~ | ~~M6・M7（`WinResult` と `BoardContext` の名前・形）~~ | 完了 | 1.0.0 未リリースのため公開型を変更した |
| ~~7~~ | ~~M14（テスト空白）・M13（SVG 出力）~~ | 完了 | テストは 289 → 300 ケース |

### 回帰テストとして先に足したいもの — 追加済

- `Efficiency.calcEffectiveTiles` の `arrangeRed` 有無（`efficiency.ts:53-56`）→ 追加
- `serializeWinResult` → `deserializeWinResult` の往復で `hand` のブロック種別が保たれること → 追加
- 卓入力の異常系（`score:` 空 / 範囲外 `sticks` / 未知キー）が `Error` として飛び、
  メッセージに原因が含まれること → 追加
- オペレータを 3 個以上付けた牌のパース（M2 の修正確認）→ **未追加**（挙動は手で確認済み。
  `parser.test.ts` に 1 本足しておきたい）

### 残っている項目

高・中は全て対応済み。残るのは低のうち次の 5 件で、いずれも小さい。

| # | 内容 |
|---|---|
| L3 | import パスの表記ゆれ（`"../core"` と `"../core/"`） |
| L5 | README に `v`（ロン）と、`d` が二重の意味を持つことの記載がない |
| L7 | `src/cmd/README.md` が WIP のまま。cmd は公開パッケージからは動かない |
| L8 | `browser/mjimage.ts` の `console.debug` が常時出力 |
| L9・L10 | `ScoreBoard.round` が表示文字列、`Lexer` の public フィールド |
