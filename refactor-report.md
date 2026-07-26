# mjimage リファクタリング調査レポート

対象: `src/` 配下（`src/lib/controller/` を除く）
前提: `npx tsc --noEmit` エラーなし / `npm test` 158 tests passed（調査時点のベースライン）
観点: 責務分割・重複コード・型の使い方・依存関係の循環・テスト容易性
方針: v1.0.0 リリース対応のため、公開 API の変更を含むドラスティックな修正も選択肢に含める

## 実施状況（2026-07-26 時点）

- **高**: H3 を除き実装済み。ただし本文中の箇所（ファイル名・行番号）は調査時点のもので、H2・H9 の分割により `calc.ts` は `calculator/*.ts` に、`image/table-parser.ts` は `input/*.ts` に移動している。
- **中**: 未着手。
- **低**: L16 を除き実装済み（下表の「状態」欄）。L15 は `exactOptionalPropertyTypes` のみ見送り（理由は L15 の欄）。

以下、指摘と修正方針の本文は調査時点のまま残す。

---

## サマリ

| # | 優先度 | 観点 | 箇所 | 概要 |
|---|---|---|---|---|
| H1 | 高 | 責務分割 | `src/index.ts:9-11` | `export *` で内部実装が全て公開 API になる（v1.0.0 で凍結される） |
| H2 | 高 | 責務分割 | `src/lib/calculator/calc.ts` | 1938 行に 4 つの責務が同居 |
| H3 | 高 | 責務分割 | `calc.ts:1409-1784` | 37 個の `dA1`〜`dK13` メソッド。命名から役が分からない |
| H4 | 高 | 重複コード | `calc.ts` 9 箇所 | 刻子系ブロック判定の `instanceof` 列挙が重複 |
| H5 | 高 | 循環依存 | `core/parser.ts:2-10` ⇄ `core/index.ts:1-3` | barrel を介した循環（`wind-util.ts:1` も同様） |
| H6 | 高 | 責務分割 | `image/render.ts:50` / `image/table.ts:364` | `RenderOptions` が卓に届かない（実証済みの不具合） |
| H7 | 高 | テスト容易性 | `calc.ts` 計算器全般 | 計算中に `Hand` を破壊的変更。例外時に壊れたまま残る（実証済み） |
| H8 | 高 | 型/死んだコード | `core/wind-util.ts:31-33` | `prevRound` が誤り・未使用・公開 API（実証済み） |
| H9 | 高 | 責務分割 | `image/table-parser.ts` | 311 行に 3 責務。かつ `image/` に置かれている |
| M1 | 中 | 型の使い方 | `table-parser.ts:119,131-132` | 表示文字列 `"東"` を識別子として使用 |
| M2 | 中 | 重複コード | `table.ts:202` / `table-parser.ts:95-120` | 席順の型 `{front,right,opposite,left}` が 4 箇所で手書き |
| M3 | 中 | 型の使い方 | `core/parser.ts:815-830` | `parseTypeOrAlias` が引数を破壊的変更 |
| M4 | 中 | 死んだコード | `core/parser.ts:770-773` | 到達不能な分岐 |
| M5 | 中 | 正しさ | `calc.ts:1415` | `if (...) [];` — `return` 漏れでガードが無効 |
| M6 | 中 | 重複コード | `calc.ts:613-644` / `798-840` | 既存 TODO。同じ「牌を差し替えた手を列挙」ロジック |
| M7 | 中 | 重複コード | `calc.ts:1060-1080` / `1337-1377` | 親子係数の点数計算が表示用と収支用で二重 |
| M8 | 中 | 重複コード | `calc.ts:59-75` / `core/constants.ts:186-192` | 牌の値域が二重定義 |
| M9 | 中 | 責務分割 | `calc.ts:896-897` | 么九牌の定義 `NZ`/`N19` が calculator にある |
| M10 | 中 | 型の使い方 | `svgjs/svg.ts:283-294` | `Svg` が継承メソッドを `unimplemented` で投げる |
| M11 | 中 | 型の使い方 | `svgjs/svg.ts:306-310` | `as unknown as` の二重キャスト |
| M12 | 中 | 重複コード | `image/image.ts:69-113` | 寸法計算が helper とモジュール関数に二分 |
| M13 | 中 | 型の使い方 | `image/image.ts:108` | 返り値型に無い余分なプロパティ `w` |
| M14 | 中 | 責務分割 | `image/image.ts:251,260,305` | 戻り値を捨てて検証目的で呼ぶ関数 |
| M15 | 中 | 重複コード | `image/image.ts:379-432` / `core/parser.ts:527-570` | 同じ分類に対する 2 つの switch |
| M16 | 中 | 型の使い方 | `core/parser.ts` 4 箇所 | Go 風タプル返しのためダミー `Tile` を生成 |
| M17 | 中 | 型の使い方 | `calc.ts:39-54,85` | `HandData` の BACK だけ `[string, number]` |
| M18 | 中 | 効率 | `calc.ts:341-345` | `Hand.clone()` が文字列往復 |
| M19 | 中 | 型の使い方 | `table-parser.ts:183-184` | `!` の直後に null チェック（型上デッド） |
| M20 | 中 | 保守性 | `table-parser.ts:177` | コメントと実装の不一致 |
| M21 | 中 | 責務分割 | `table-parser.ts:226-262` | sticks 解析が先読み + `i++` で脆い |
| M22 | 中 | テスト容易性 | `__tests__/utils/helper.ts:18` ほか | cwd 依存のテスト |
| M23 | 中 | テスト容易性 | `image.test.ts:6` ほか 2 件 | スナップショット更新が手書きフラグ |
| M24 | 中 | テスト容易性 | `__tests__/` 全般 | SVG 文字列全体の比較に依存 |
| M25 | 中 | 依存関係 | `e2e/index.ts:3` | 本番スクリプトがテストヘルパに依存 |
| M26 | 中 | 正しさ | `e2e/index.ts:8` | `Number(...) ?? 1` は NaN を捕まえない |
| M27 | 中 | 型の使い方 | `efficiency.ts:29` / `browser/mjimage.ts:24` | static のみのクラス（tree-shaking を阻害） |
| L1〜L16 | 低 | 各種 | （後述） | 未使用 import、死んだ barrel、命名の誤り、tsconfig/CI |

---

## 高

### H1. `export *` により内部実装がすべて公開 API になる

**箇所**: `src/index.ts:9-11`

```ts
export * from "./lib/core/";
export * from "./lib/calculator/";
export * from "./lib/controller/";
```

`src/index.ts:15-30` の image 部分は公開する名前を丁寧に絞っているのに、core / calculator / controller だけ全放出になっている。`dist/index.d.ts` は 1291 行・134 宣言。実際に漏れているもの:

- `PointCalculator` の役判定メソッド 37 個（`dA1`〜`dK13`）がすべて public
- `TupleOfSize`, `HandData`, `forHand`, `NZ`, `N19`, `compareTiles`, `compareCalledTiles`, `is5Tile` などの内部ユーティリティ
- `prevRound`（H8 のとおり壊れている）

v1.0.0 は semver でこれらを凍結する。**リリース前が直す最後の機会**。

**修正方針**:
1. `src/index.ts` を image 部分と同じく明示的な named export に統一する。
2. 公開したい面を先に決める（`Tile` / `Block` 系 / `Parser` / `Hand` / `ShantenCalculator` / `BlockCalculator` / `PointCalculator` / `Efficiency` / 描画 API / 定数）。
3. 役判定メソッドは H3 のテーブル化と同時に private 化する。
4. `dist/index.d.ts` の宣言数をリリース前後で比較し、意図しない露出を検知する CI ステップを足すとよい。

### H2. `calculator/calc.ts` が 1938 行で 4 責務を持つ

**箇所**: `src/lib/calculator/calc.ts`

| 行 | 内容 |
|---|---|
| 39-346 | `HandData` / `forHand` / `Hand`（手牌の状態と操作） |
| 348-564 | `ShantenCalculator`（シャンテン数） |
| 566-894 | `BlockCalculator`（あがり形の列挙） |
| 899-928 | シリアライズ |
| 930-1018 | 型定義・点数テーブル |
| 1036-1084 | 点数の文字列表現 |
| 1086-1865 | `PointCalculator`（役 37 個 + 符 + 点数移動） |
| 1867-1938 | ヘルパ |

**修正方針**: 以下に分割する。分割自体はテストの変更なしで可能（`calculator/index.ts` が barrel なので import 元は変わらない）。

```
calculator/
  hand.ts             Hand, HandData, forHand
  shanten.ts          ShantenCalculator
  block-calculator.ts BlockCalculator
  yaku.ts             役の定義テーブル（H3）
  fu.ts               calcFu
  score.ts            点数テーブル・deltas・description
  serialize.ts        serialize/deserializeWinResult
  efficiency.ts       （現状のまま）
```

### H3. 37 個の `dA1`〜`dK13` メソッド

**箇所**: `src/lib/calculator/calc.ts:1409-1784`、呼び出し側 `calc.ts:1178-1240`

名前から役が分からず、呼び出し側は 60 行の手書き列挙になっている。うち 8 個（`dA1:1409`, `dG1:1457`, `dH1:1460`, `dI1:1463`, `dJ1:1466`, `dK1:1469`, `dJ13:1779`, `dK13:1782`）は引数 `h` を使わない。`dJ13`/`dK13` は空スタブ（`calc.ts:1778` の TODO 天和・地和）なのに毎回呼ばれている。

**修正方針**: データ駆動のテーブルにする。

```ts
interface YakuDef {
  name: string;
  han: number | ((ctx: YakuContext) => number); // 食い下がりを表現
  yakuman?: boolean;
  match(hand: readonly Block[], ctx: YakuContext): boolean;
}
const YAKU_1HAN: readonly YakuDef[] = [...];
const YAKUMAN: readonly YakuDef[] = [...];
```

- 役ごとに 1 エントリになり、名前・翻数・条件が 1 箇所に揃う
- `getWinningHands` は `YAKUMAN.filter(...)` → 空なら `YAKU_*.filter(...)` の 2 段になる
- `2 - this.getCalledPenalty()` のような食い下がりは `han` を関数にして表現
- 現状のメソッドは公開 API なので、H1 と同時に private 化する

### H4. 刻子系ブロック判定の `instanceof` 列挙が 9 箇所で重複

**箇所**: `calc.ts:1520-1528`（対々和）, `1532-1537`（三暗刻）, `1541-1546`（三槓子）, `1550-1558`（三色同刻）, `1585-1596`（混老頭）, `1696-1701`（四暗刻）, `1728-1737`（清老頭）, `1742-1748`（四槓子）, `1811-1826`（`calcFu`）

同じ `b instanceof BlockAnKan || b instanceof BlockShoKan || b instanceof BlockDaiKan || b instanceof BlockThree || b instanceof BlockPon || b instanceof BlockPair` が繰り返される。ブロック種別を増やすと 9 箇所を漏れなく直す必要がある。

**修正方針**: 述語を 1 箇所に集約する。`Block` に生やすのが自然。

```ts
// core/parser.ts の Block
isTriplet(): boolean          // 刻子・槓子（pon/three/ankan/shokan/daikan）
isQuad(): boolean             // 槓子のみ
isSequence(): boolean         // 順子（run/chi）
isConcealedTriplet(): boolean // ロン牌を含まない暗刻
```

`instanceof` 判定は `Block._type` を見る `is()` と情報が重複している（H4 と M15 の根）。クラス階層とタグの二重管理を解消するなら、`BlockChi` などのサブクラスを消して `Block` + `BlockType` だけにする案も v1.0.0 なら取れる。

### H5. `core/` 内での barrel を介した循環依存

**箇所**:
- `src/lib/core/index.ts:1-3` — `./constants`, `./parser`, `./wind-util` を re-export
- `src/lib/core/parser.ts:2-10` — `from "./"`（= index.ts）
- `src/lib/core/wind-util.ts:1` — `from "."`（= index.ts）

`index.ts → parser.ts → index.ts` の循環。現状は `index.ts` が `./constants` を先に評価するため実害が出ていないが、**`index.ts` の export 順を入れ替えるだけで TDZ エラーになる**。`image/table.ts:10` の `"../image/image"`（同一ディレクトリを親経由で参照）も同種の危うさ。

**修正方針**:
1. 兄弟モジュール間は barrel を経由せず実体を直接 import する（`parser.ts` → `./constants`、`wind-util.ts` → `./constants`）。
2. barrel（`index.ts`）は外向きの公開面としてのみ使う、というルールを明文化する。
3. `image/table.ts:10` を `"./image"` に直す（L14）。
4. `madge --circular src/` などを CI に足して再発を防ぐ。

### H6. `RenderOptions` が卓の描画に届かない

**箇所**: `src/lib/image/render.ts:43-51`、`src/lib/image/table.ts:356-364`

```ts
// render.ts:48-50
const fragment = isTableInput(input)
  ? buildTable(helper, parseTableInput(input))          // options を渡していない
  : buildHand(helper, new Parser(input).parse(), options);
```

`buildTable` は `options` を受け取らず、内部の `buildHand`（`table.ts:364`）も第 3 引数なしで呼ぶ。結果として `enableDoraText` / `enableTsumoText` が卓では無視される。実際に確認した:

```
render("d2s", { enableDoraText: false })            → "(ドラ)" が出ない（期待どおり）
render("table:\n 1z:\n  hand: d2s\n", 同上)          → "(ドラ)" が出る（不具合）
```

根本原因は `RenderOptions` の受け渡しが **2 経路に分かれている**こと。`scale`/`imageHostUrl`/`imageExt`/`svgSprite`/`fontFamily` は `ImageHelper`（`image.ts:122-138`）が吸収し、`enableDoraText`/`enableTsumoText` だけ引数で引き回されている（`image.ts:379-384` の `createBlock` で参照）。

**修正方針**: 解決済み設定を 1 つの値にまとめ、それだけを引き回す。

1. `ImageHelper`（または新設の `ResolvedOptions`）が `RenderOptions` の全項目を保持する。
2. `buildHand(helper, blocks)` / `buildTable(helper, table)` から `options` 引数を廃止し、`createBlock(b, helper)` は `helper.enableDoraText` を見る。
3. 卓でも注記オプションが効くことをテストで固定する。

### H7. 計算器が `Hand` を破壊的に変更する

**箇所**: `ShantenCalculator.standardType:443-448`, `calcNumberTilePatterns:470-476,492-495`, `BlockCalculator.standardType:733-741`, `handleNumType:868-874,881-883`, `sevenPairs:659-661`, `Efficiency.calcEffectiveTiles:46-48`, `getEffectiveTiles:97-99`

すべて `hand.dec(...)` → 再帰計算 → `hand.inc(...)` で元に戻す形。**途中で例外が飛ぶと `Hand` は壊れたまま残る**。実際に `inc` を 3 回目で失敗させて確認した:

```
before: 123456789m1p123s
after : 123489m1p123s      ← 567m が消えたまま
```

副作用としてこうなる:

- 計算器を「読み取り専用」として扱えず、同じ `Hand` を複数のテストで使い回せない
- 再帰の途中経過が観測可能で、単体テストが書きにくい
- `Efficiency.calcEffectiveTiles` は呼び出し側の `Hand` をその場で書き換えるため、並行実行やメモ化ができない

**修正方針**（コストの低い順）:

1. **暫定**: `dec` / `inc` の対を `try { ... } finally { hand.inc(tiles) }` で囲む。挙動を変えずに壊れた状態を残さない。
2. **本命**: 探索を `Hand` から切り離す。カウント配列（`Int8Array(34)` 相当）を値として受け渡す純粋関数にすると、破壊的変更が消え、性能も上がる。

```ts
type Counts = Readonly<Record<Type, readonly number[]>>;
function shanten(counts: Counts, calledCount: number): number;
function decompose(counts: Counts): readonly (readonly Block[])[];
```

`Hand` は「状態を持つ手牌」、計算器は「カウントを受け取る純関数」と役割を分ける。テストは `Counts` を直接組み立てられるようになり、`Hand` の構築を経由しなくてよくなる。

### H8. `prevRound` が誤っている（かつ未使用・かつ公開 API）

**箇所**: `src/lib/core/wind-util.ts:31-33`

```ts
export const prevRound = (r: Round) => nextRound(nextRound(nextRound(r)));
```

局は東 1〜北 4 の 16 周期なのに `nextRound` を 3 回しか適用していない。`prevWind`（4 周期）の実装をそのまま持ってきたと思われる。実測:

```
prevRound("1z1") = "1z4"   （正: "4z4"）
prevRound("1z2") = "2z1"   （正: "1z1"）
prevRound("2z1") = "2z4"   （正: "1z4"）
```

`src/` 全体で使用箇所ゼロ。テストもない。しかし `export * from "./lib/core/"` により公開 API に含まれている（H1）。

**修正方針**: 使っていないので **削除するのが最良**。残すなら `ROUND_MAP` のキー列に対する index 演算で実装し直し、`nextRound(prevRound(r)) === r` を全 16 局で検証するテストを追加する。

### H9. `image/table-parser.ts` が 3 責務・311 行

**箇所**: `src/lib/image/table-parser.ts`

| 行 | 内容 |
|---|---|
| 25-91 | valibot スキーマ定義 |
| 95-132 | 内部表現の型定義 |
| 162-262 | 手書きの YAML 風パーサ |
| 264-311 | 内部表現への変換 |

さらに、この「入力言語の解釈」は描画の関心事ではないのに `image/` にある。`src/lib/core/parser.ts` が牌の入力言語を担当しているのと非対称。

**修正方針**: 責務ごとに分け、`image/` の外に出す。

```
src/lib/input/            （または core/table/）
  table-schema.ts    valibot スキーマ + Raw*/Validated* 型
  table-yaml.ts      parseYamlLikeStringInput（行スキャナ）
  table-input.ts     convertTableInput + TableInput/Discards/Hands/ScoreBoard
src/lib/image/
  table.ts           TableInput を受け取って描くだけ
```

`image/table.ts` が `table-parser.ts` に依存している現状（`table.ts:12`）が、`image` → `input` の一方向依存になる。

---

## 中

### M1. 表示文字列を識別子として使っている

**箇所**: `table-parser.ts:119,131-132`、`table.ts:252-256`

```ts
type BoardWind = (typeof WIND_MAP)[keyof typeof WIND_MAP];  // "東"|"南"|"西"|"北"
export interface ScoreBoard { frontPlace: BoardWind; ... }
```

`table.ts:252 getPlaces("東")` はこの**表示文字列**で席順を計算する。一方 `table-parser.ts:304 createPlaceMap` は `Wind`（`"1z"`）で同じ席順を計算する。同じロジックが 2 つの表現で二重管理されており、`WIND_MAP` の値を変えると描画側の席順が壊れる。

**修正方針**: 内部表現は `Wind` に統一し、`WIND_MAP` の適用は `Text` を組み立てる直前だけにする。`getPlaces` は `nextWind` で書ける（`createPlaceMap` と同一実装になる → 統合できる）。

### M2. 席順の型が 4 箇所で手書き

**箇所**: `table.ts:202`（`Seats<T>`）、`table-parser.ts:95-100`（`Discards`）、`102-107`（`Hands`）、`113-118`（`ScoreBoard.scores`）

すべて `{ front, right, opposite, left }`。`table.ts` にはすでに汎用の `Seats<T>` があるのに、parser 側は使っていない。

**修正方針**: `Seats<T>` を共有モジュールに置き、以下の別名にする。`mapSeats` / `maxOfSeats`（`table.ts:204-212`）もそこに移す。

```ts
export type Discards = Seats<readonly Tile[]>;
export type Hands = Seats<readonly Block[]>;
// ScoreBoard.scores: Seats<number>
```

### M3. `parseTypeOrAlias` が引数を破壊的に変更する

**箇所**: `core/parser.ts:815-830`

```ts
function parseTypeOrAlias(s: string, cluster: TileBase[]): [Type, boolean] {
  ...
  if (isAlias && cluster.length > 0) {
    for (let i = 0; i < cluster.length; i++) {
      if (s === "d") cluster[i].n = t.n + 4;   // 引数を書き換える
    }
    return [TYPE.Z, true];
  }
```

`parse` を名乗る関数が入力を書き換える。さらに `validate:725-736` はこの関数を「文字が牌種かどうか」の判定にだけ使うため、ダミーの `[new Tile(TYPE.BACK, 1)]` を渡している（`parser.ts:730-731`）。

**修正方針**: 2 つの関心を分ける。

```ts
function tileTypeOf(c: string): Type | null;                        // 純粋な判定
function expandAlias(c: "w" | "d", cluster: readonly TileBase[]): TileBase[] | null; // 新配列を返す
```

`validate` は `tileTypeOf(lastChar) != null` で済むようになり、ダミー `Tile` が不要になる。

### M4. `detectBlockType` に到達不能な分岐

**箇所**: `core/parser.ts:754`, `770-773`

```ts
if (numTsumoDora > 0) return BLOCK.UNKNOWN;   // :754 これ以降 numTsumoDora は常に 0
...
if (numHorizontals == 1) return BLOCK.IMAGE_DISCARD;  // :770
if (numTsumoDora == 0) return BLOCK.IMAGE_DISCARD;    // :771 常に真
return BLOCK.UNKNOWN;                                  // :773 到達不能
```

**修正方針**: `770-773` を `return BLOCK.IMAGE_DISCARD;` の 1 行にする。`BLOCK.UNKNOWN`（`constants.ts:122` に「現状使用されない」とコメント）が本当に不要なら、`image/image.ts:417-424` の default 節と併せて削除を検討する。

### M5. `return` 漏れでガードが無効

**箇所**: `calc.ts:1415`

```ts
dB1(h: readonly Block[]): readonly Yaku[] {
  if (this.hand.drawn == null) [];        // ← return が無い。式文で何もしない
  if (this.getCalledPenalty() != 0) return [];
  const cond = h.some((b) => b.tiles.some((t) => t.has(OP.TSUMO)));
  return cond ? [{ name: "門前清自摸和", han: 1 }] : [];
}
```

`markedHand:607-611` は `lastTile.has(OP.TSUMO)` でも TSUMO を付けるため、`hand.drawn == null` でもツモ扱いのブロックが渡りうる。そのとき本来のガードが効かず門前清自摸和が付く。

**修正方針**: `return [];` に直す。ただしこのガードを入れると既存の呼び出し（`hand.drawn` を設定せず `lastTile` にツモ演算子を付けるパターン）の結果が変わる可能性があるため、直す前に両方のケースのテストを足して意図を確定させる。

### M6. 「牌を差し替えた手を列挙する」ロジックの重複

**箇所**: `calc.ts:602-645`（`markedHand`）と `calc.ts:795-841`（`addRedPattern`）。`calc.ts:846` に既存 TODO あり。

どちらも同じ形をしている: ブロックを走査 → `[bIdx, tIdx]` を集める → `m: {[key]: boolean}` で `buildBlockKey` による重複排除 → `block.clone({ replace: {...} })` で新しい手を作る。

**修正方針**: 共通化する。

```ts
function replaceInHand(
  hand: readonly Block[],
  find: (t: Tile, b: Block) => boolean,
  make: (t: Tile) => Tile,
): readonly (readonly Block[])[];
```

`markedHand` は `find = t => t.equals(lastTile) && 赤一致`, `make = t => t.clone({add: op})`。`addRedPattern` は赤と非赤の入れ替えなので 2 箇所同時置換になるが、上記の一般形に `swap` 版を足せば吸収できる。

### M7. 親子係数の点数計算が二重

**箇所**: `calc.ts:1060-1080`（`generatePointDescription`）と `calc.ts:1337-1377`（`calculateRonDeltas` / `calculateTsumoDeltas`）

```ts
// :1067-1070
const coefficient = isParent ? POINT_COEFFICIENT.PARENT_RON : POINT_COEFFICIENT.CHILD_RON;
return `${myCeil(base * coefficient)}`;
// :1344-1347  まったく同じ式
const coefficient = isParent ? POINT_COEFFICIENT.PARENT_RON : POINT_COEFFICIENT.CHILD_RON;
const points = myCeil(base * coefficient);
```

表示文字列と点数移動が別々に係数を掛けているため、片方だけ直すと表示と収支がずれる。

**修正方針**: 点数の算出を 1 箇所にまとめ、表示側はその結果を整形するだけにする。

```ts
function ronPoints(base: number, isParent: boolean): number;
function tsumoPoints(base: number, isParent: boolean): { fromParent: number; fromChild: number };
```

### M8. 牌の値域が二重定義

**箇所**: `calc.ts:59-75`（`forHand`）と `core/constants.ts:186-192`（`TILE_NUMBERS`）

```ts
// calc.ts:70
const upper = t == TYPE.Z ? 7 : t == TYPE.BACK ? 1 : 9;
```

`TILE_NUMBERS` に同じ知識がある（`constants.ts:183-185` のコメントも「入力の検証と、牌画像の ID 一覧の生成で同じ定義を使う」と言っている）。3 つ目の定義になっている。

**修正方針**: `forHand` を `TILE_NUMBERS` から導出する（赤の別名 `0` を除いて反復）。

### M9. 么九牌の定義が calculator にある

**箇所**: `calc.ts:896-897`

```ts
export const NZ: readonly number[] = [1, 2, 3, 4, 5, 6, 7];
export const N19: readonly number[] = [1, 9];
```

牌の語彙は `core/constants.ts` の関心事。名前も内容を表していない。

**修正方針**: `core/constants.ts` へ移し、`HONOR_NUMBERS` / `TERMINAL_NUMBERS` に改名する。`TILE_NUMBERS[TYPE.Z]` と `NZ` は同値なので統合できる。

### M10. `Svg` が継承したメソッドを `unimplemented` で投げる

**箇所**: `svgjs/svg.ts:283-294`

```ts
x(x: number): this { throw new Error("unimplemented"); }
y(y: number): this { throw new Error("unimplemented"); }
dx(x: number): this { throw new Error("unimplemented"); }
dy(y: number): this { throw new Error("unimplemented"); }
```

`Mark`（`svg.ts:27`）が位置操作を持つため、位置を持たない `Svg` が継承してしまう典型的な LSP 違反。`RenderedSvg`（`svg.ts:328-340`）で外向きには隠しているが、内部では `Svg` を `Mark` として扱えるので保護になっていない。引数 `x` も未使用。

**修正方針**: 継承階層を組み替える。

```
Node       type/attrs/styles/parent/toString  ← Svg はここまで
 └ Mark    x/y/dx/dy/size                     ← 位置を持つ要素
Container  children/add/each                  （Node に対する mixin）
```

`Svg extends Container(Node)`、`Rect/Text/Image/Use extends Mark`、`G extends Container(Mark)` とすれば投げるメソッドが消える。

### M11. `as unknown as` の二重キャスト

**箇所**: `svgjs/svg.ts:306-310`

```ts
export const asRenderedSvg = (svg: Svg): RenderedSvg => svg as unknown as RenderedSvg;
export const asSvg = (svg: RenderedSvg): Svg => svg as unknown as Svg;
```

コメント（`svg.ts:302-305`）にあるとおり、`Container.add(e: Mark)` と `RenderedSvg.add(element: Placeable)` の非互換を潰すための逃げ。`src/index.ts:33,36` で公開 API の入口・出口に使われており、ここで型検査が切れている。

**修正方針**: `Placeable`（`svg.ts:316-319`）を `Mark` が実際に満たす形にする。`G` は `translate`/`rotate` を持つので、`Placeable` を `G` が implements していると宣言し、`RenderedSvg.add(element: Placeable)` の実装側シグネチャを `add(e: Mark & Placeable)` に揃えれば、キャストなしで `Svg` が `RenderedSvg` に代入可能になる。

### M12. 寸法計算が helper とモジュール関数に二分

**箇所**: `image/image.ts:90-113`（`scaledTileWidth` / `scaledTileHeight` / `tileImageSize` / `blockImageSize`）と `image.ts:122-138`（`BaseHelper.tileWidth` / `tileHeight` / `scale`）

同じ値が 2 経路で求まる。呼び出し側は helper を持っているのに `h.scale` を取り出して関数に渡し直している（`image.ts:385,390` の `blockImageSize(b, h.scale)`、`image.ts:159,196,279,285,355` の `tileImageSize(t, this.scale)`）。`table.ts:69-73 riverRowWidth` は `helper.tileHeight` / `helper.tileWidth` を使い、`image.ts` は `tileImageSize(...).baseWidth` を使う — 同じ量の呼び名が 2 つある。

**修正方針**: 寸法計算を helper のメソッドに一本化する（`helper.tileSize(tile)` / `helper.blockSize(block)`）。モジュール関数版は削除。

### M13. 返り値型に無い余分なプロパティ

**箇所**: `image/image.ts:106-108`

```ts
const size = tile.has(OP.HORIZONTAL)
  ? { width: h, height: w, baseWidth: w, baseHeight: h }
  : { width: w, height: h, w, baseWidth: w, baseHeight: h };
//                          ^ 宣言された返り値型に無い
```

返り値型は `{width,height,baseWidth,baseHeight}`（`image.ts:97-103`）。三項演算子の結果を一度変数に入れてから返しているため、余剰プロパティ検査をすり抜けている。

**修正方針**: `w,` を削除する。同時に `exactOptionalPropertyTypes` などの厳格化（L15）で検知できるようにする。

### M14. 戻り値を捨てて検証目的で呼ぶ関数

**箇所**: `image/image.ts:251, 260, 305`

```ts
createBlockChi(block: BlockChi) {
  this.findHorizontalIndex(block);   // 戻り値を使わない。例外を出すためだけ
  return this.createHorizontalBlock(block.tiles);
}
```

`findHorizontalIndex`（`image.ts:367-373`）は index を返すが、3 箇所では検証としてのみ呼ばれている（`createBlockShoKan:268` だけが戻り値を使う）。

**修正方針**: 意図を名前に出す（`assertHasHorizontal(block)`）か、`BlockChi`/`BlockPon`/`BlockDaiKan` のコンストラクタ側で不変条件を保証しているなら削除する（`image.ts:252` のコメントは「BlockChi が保証する」と言っており、実際 `blockWrapper:545-548` で assert 済み → 削除できる）。

### M15. 同じ分類に対する 2 つの switch

**箇所**: `core/parser.ts:527-570`（`blockWrapper`: type → クラス）と `image/image.ts:379-432`（`createBlock`: instanceof → 描画）

さらに `createBlock` は `BlockOther` に対して `b.type` で二度目のディスパッチを行う（`image.ts:393-425`）。ブロック種別を足すと 3 箇所を直す必要がある。

**修正方針**: 描画をテーブル化し `instanceof` を排除する。

```ts
const RENDERERS: Record<BlockType, (b: Block, h: ImageHelper) => G> = {
  [BLOCK.PON]: (b, h) => h.createBlockPon(b), ...
};
```

H4 のクラス階層の整理（サブクラスを廃して `Block` + タグに寄せる）と併せると、`blockWrapper` 側の switch も消える。

### M16. Go 風タプル返しのためのダミー値生成

**箇所**: `core/parser.ts:74-77`（`isType`）, `832-836`（`isNumber`）, `839-861`（`isOperator`）, `815-830`（`parseTypeOrAlias`）

```ts
if (!ops.includes(l.char)) return [new Tile(TYPE.BACK, 0), false];   // :841
...
return [new Tile(TYPE.BACK, 0), false];                              // :860
```

失敗を表すためだけに `Tile` を生成している。呼び出し側（`parser.ts:627,640,646`）はタプルの第 2 要素を見るまで第 1 要素の妥当性が分からない。

**修正方針**: `null` を返して TS の絞り込みを使う。

```ts
function tileTypeOf(c: string): Type | null;
function numberOf(c: string): number | null;
function operatorTileAt(l: Lexer): TileBase | null;
```

`parser.ts:731` の `const [_, isKind] = ...` のような使い捨て変数も消える。

### M17. `HandData` の BACK だけ型が違う

**箇所**: `calc.ts:39-54`, `85`, `203-206`

```ts
export interface HandData {
  [TYPE.M]: TupleOfSize<number, 10>;
  ...
  [TYPE.BACK]: [string, number];    // ← 他と型が違う
}
// :85
[TYPE.BACK]: ["untouchable", 0],    // 番兵文字列
// :203-206
get(t: Type, n: number) {
  if (t == TYPE.BACK) return this.data[t][1];   // BACK だけ特別扱い
  return this.data[t][n];
}
```

「0 番目を触るな」を型ではなく文字列リテラルで表現している。`inc`/`dec`（`calc.ts:225,251`）も BACK を分岐している。

**修正方針**: 裏牌の枚数を別フィールドに出す。

```ts
interface HandData {
  counts: { [TYPE.M]: number[]; [TYPE.P]: number[]; [TYPE.S]: number[]; [TYPE.Z]: number[] };
  backCount: number;
  called: ...; tsumo: ...; reached: ...;
}
```

`TupleOfSize`（`calc.ts:33-37`）は長さを型で固定する以外の役目がなく、実際には index アクセスの安全性を与えていない（`data[t][n]` の `n: number` は範囲検査されない）ので、併せて削除してよい。

### M18. `Hand.clone()` が文字列往復

**箇所**: `calc.ts:341-345`

```ts
clone(): Hand {
  const c = new Hand(this.toString());   // 直列化 → 再パース
  c.data.reached = this.data.reached;
  return c;
}
```

`toString()`（`calc.ts:151-164`）は `hands` getter を呼び、`hands`（`calc.ts:123-147`）は全牌の `Tile` を作り直す。さらに `new Hand(string)` は `Parser` を通す。`inc`/`dec` のエラーメッセージ生成（`calc.ts:220,246`）でも `toString()` が呼ばれる。

**修正方針**: `data` の構造的コピーで clone する。`reached` を手で写す必要もなくなる。

### M19. `!` の直後に null チェック

**箇所**: `table-parser.ts:183-184`

```ts
const label = labels.find((l) => line.startsWith(l))!;
if (label == null) throw new Error(`encountered unexpected line ${line}`);
```

`!` を付けたことで型上 `label` は非 null になり、次行のチェックは型システムから見て無意味になっている（実行時には機能する）。`!` を外せば TS が正しく `string | undefined` として扱い、チェック後に絞り込まれる。

**修正方針**: `!` を削除する。

### M20. コメントと実装の不一致

**箇所**: `table-parser.ts:177-178`

```ts
// 1w,2w,3w,4w エイリアスをサポート
let labels = [WIND.E, WIND.S, WIND.W, WIND.N, board];   // = "1z".."4z"
```

`1w` 形式のエイリアスは実装されていない。

**修正方針**: サポートするならラベル配列に足す（`core/parser.ts:819` は牌の記法として `w` を別名扱いしているので、卓の入力でも揃える価値はある）。しないならコメントを削除する。

### M21. `parseBoardSection` の sticks 解析が脆い

**箇所**: `table-parser.ts:245-258`

```ts
} else if (line.startsWith(sticks)) {
  result.sticks = {};
  const next = lines[i + 1] ?? "";
  const nextNext = lines[i + 2] ?? "";
  if (next.startsWith(reach)) result.sticks.reach = Number(extractValue(next, reach));
  if (next.startsWith(dead)) result.sticks.dead = Number(extractValue(next, dead));
  if (nextNext.startsWith(reach)) ...
  if (nextNext.startsWith(dead)) ...
  if (result.sticks.dead != null) i++;
  if (result.sticks.reach != null) i++;
}
```

2 行先読み + 条件付きの `i++` 2 回。インデントを一切見ないため（`table-parser.ts:166-169` で全行 `trim()` 済み）、階層の異なる位置にある `reach:` を拾いうる。ネストが 1 段深いキーを足すたびにこの形が増える。

**修正方針**: 行をトークン（`{ indent, key, value }`）に落としてから木を組む小さなスキャナに置き換える。インデントを保持すれば先読みと `i++` が消え、`board` 以外のネストにも一様に対応できる。valibot スキーマ（`table-parser.ts:25-83`）は変更不要。

### M22. cwd 依存のテスト

**箇所**: `__tests__/utils/helper.ts:18`、`svg.test.ts:9,58-59,76-77,179`、`svg-tile.test.ts:8`

```ts
const current_dir = path.resolve("");                          // helper.ts:18
const spritePath = "public/svg/tiles.svg";                     // svg.test.ts:9
fs.readdirSync("public/svg")                                   // svg.test.ts:179
fs.readFileSync("src/lib/__tests__/__fixtures__/table.common.yaml")  // svg.test.ts:58
```

リポジトリルート以外から vitest を起動すると落ちる。IDE のテストランナーやモノレポ化で問題になる。

**修正方針**: `import.meta.url` 基準の絶対パスに直す。fixtures は `?raw` インポートでも良い（Vite が解決するのでパス指定が消える）。

### M23. スナップショット更新が手書きフラグ

**箇所**: `image.test.ts:6`, `table.test.ts:19`, `svg-tile.test.ts:7`

```ts
const update = false;
```

`loadTestData(filename, data, update)`（`helper.ts:12-23`）は `update` が真なら期待値を上書きしてから読む。**`true` のままコミットすると 3 ファイル分のテストが無条件で通る**。CI では検出できない。

**修正方針**: vitest 標準の `expect(got).toMatchFileSnapshot(path)` に置き換える。更新は `vitest -u` になり、フラグがコードから消える。

### M24. SVG 文字列全体の比較への依存

**箇所**: `image.test.ts:53-59`, `table.test.ts:41-49,63-184`, `svg-tile.test.ts:10-30`

期待値が SVG 全文（`__snapshots__/*.svg`）なので、座標計算を 1 箇所変えるだけで無関係なスナップショットが大量に差分になる。H6・M12 のような修正を安全に進める妨げになる。

一方で `table.test.ts:187-425` の不変条件テスト（`geometry is linear in scale`、`rivers stay next to the hands`、`dora indicators do not run into the scores` など）は、実装を変えても壊れない良い形になっている。

**修正方針**: 不変条件テストを主軸に据え、全文スナップショットは代表 1〜2 件（`image.common.svg` と `yaml-to-svg.common.svg`）に絞る。リファクタリング前に、いま全文スナップショットが暗黙に守っている性質（ブロック間余白、横向き牌の Y オフセット、暗槓の裏牌配置など）を不変条件テストとして書き足しておくと、H2/H6/M12/M15 の着手が安全になる。

### M25. 本番スクリプトがテストヘルパに依存

**箇所**: `e2e/index.ts:3`

```ts
import { loadArrayData, storeArrayData } from "./../lib/__tests__/utils/helper";
```

`tsconfig.json:28` の `include: ["src/**/*"]` により型検査の対象にも入る。テストユーティリティが実行経路に混ざっている。

**修正方針**: `loadArrayData` / `storeArrayData`（`helper.ts:29-47`）を `src/e2e/fixtures.ts` に移す。テスト側からも必要なら、そちらから import する（依存の向きを逆にする）。

### M26. `Number(...) ?? 1` は NaN を捕まえない

**箇所**: `e2e/index.ts:8`

```ts
const count = Number(process.argv[3]) ?? 1;
```

引数省略時は `Number(undefined)` = `NaN` であり、`??` は発火しない。結果 `count = NaN` となり `e2e/index.ts:20` のループが 1 度も回らない。

**修正方針**: `const count = Number(process.argv[3] ?? 1);` にする。または `Number.isFinite` で検証して既定値にフォールバックする。

### M27. static メソッドのみのクラス

**箇所**: `calculator/efficiency.ts:29`（`Efficiency`）、`browser/mjimage.ts:24`（`mjimage`）

`package.json` は `"sideEffects": false` を宣言しているが、クラスに包むとメソッド単位の tree-shaking が効かず、`Efficiency.calcEffectiveTiles` だけを使う利用者も `getEffectiveTiles` を取り込む。

**修正方針**: 素の関数 export にする。`Efficiency` は名前空間として意味があるなら `export * as Efficiency` で再現できる（この形なら tree-shaking が効く）。`mjimage` はブラウザのグローバルとして名前が必要なので、`browser/global.ts:3` でオブジェクトリテラルを組み立てる形にする。

---

## 低

| # | 箇所 | 内容 | 修正方針 | 状態 |
|---|---|---|---|---|
| L1 | `core/wind-util.ts:1-2` | `BLOCK` と `assert` が未使用 import | 削除。L15 の tsconfig 厳格化で自動検出できる | 済（H5 の対応時） |
| L2 | `svgjs/index.ts` | どこからも import されない barrel（全て `../svgjs/svg` を直接参照）。`image/index.ts` もテストからのみ | 削除するか、参照を barrel 経由に統一する | 済（`svgjs/index.ts` を削除。`image/index.ts` はテストの入口として残す） |
| L3 | `core/lexer.ts:27-44` | `peekChar` / `prevChar` が本番コード未使用（`lexer.test.ts` からのみ）。`prevChar` は EOF 時の挙動に FIXME（`lexer.test.ts:23`） | 削除する。テストも併せて整理 | 済 |
| L4 | `myassert/` | 5 行の関数のためのディレクトリ + `index.ts` | `src/lib/assert.ts` に平坦化 | 済 |
| L5a | `calc.ts:1024,981,1881-1887` | `WINING_TILE_BLOCK_TYPE` は綴り誤り（公開 API） | `WINNING_TILE_BLOCK_TYPE` に改名。v1.0.0 前が最後の機会 | 済 |
| L5b | `calc.ts:981` | `winning_tile_block_type` — コードベース唯一の snake_case（公開 API） | `winningTileBlockType` に改名 | 済（`WinResult` のシリアライズ結果も変わる） |
| L5c | `calc.ts:1504,1506,1510` | `excludedypes` の綴り誤り | `excludedTypes` に | 済 |
| L5d | `calc.ts:1659` | 役名 `"純全帯么九色"` は誤り（利用者に表示される） | `"純全帯么九"` に | 済 |
| L5e | `calc.ts:1666` | 役名 `"ニ盃口"` がカタカナのニ（利用者に表示される） | `"二盃口"` に | 済 |
| L5f | `__tests__/tabale-parser.test.ts` | ファイル名の綴り誤り | `table-parser.test.ts` に | 済（H9 で対象が `input/` に移ったため `table-input.test.ts`） |
| L6 | `browser/mjimage.ts:4-9` | `Omit<RenderOptions,"scale">` の直後に `scale?: number` を再宣言（実質何も除いていない）。`mjimage.ts:61` の `{...props}` で `querySelector`/`tableScale`/`responsive` が `RenderOptions` として渡る | `extends RenderOptions` にし、render へは必要な項目だけ明示的に渡す | 済（ブラウザ固有の 3 項目を分割代入で除いた残りを渡す） |
| L7 | `browser/mjimage.ts:27-31` | 再代入しない変数に `let` | `const` に | 済 |
| L8 | `core/wind-util.ts:54-60` | `prevWind` の `cycle = [1,4,3,2]` + `indexOf` + 剰余は `((n + 2) % 4) + 1` と等価 | 素直な式に | 済 |
| L9 | `image/table.ts:14` | 河 1 行の枚数 `chunkSize = 6` がマジックナンバー | `TABLE_CONTEXT.RIVER_ROW_SIZE` へ | 済 |
| L10 | `core/parser.ts:581` | `maxInputLength = 600` がインスタンスフィールド | モジュール定数に | 済（`MAX_INPUT_LENGTH`） |
| L11 | `calc.ts:614,800,1908-1918` | `{[key: string]: boolean}` を Set 代わり、オブジェクトをカウンタ代わりに使用 | `Set<string>` / `Map<string, number>` | 済 |
| L12 | `efficiency.ts:50-55` | 3 重三項のうち 2 分岐が同一式 | `const keepRed = !options?.arrangeRed && t.has(OP.RED);` で 1 行に畳む | 済 |
| L13 | `core/parser.ts:203-220` | `Block.deserialize` の入れ子 if + ネガティブ条件 + TODO（:206） | 計算専用タイプを `Set` にまとめ、早期 return に | 済（`CALCULATED_BLOCK_TYPES`） |
| L14 | `image/table.ts:10` | 同一ディレクトリを `"../image/image"` で参照 | `"./image"` に（H5 と同根） | 済（H5 の対応時） |
| L15 | `tsconfig.json` | `noUnusedLocals` / `noUnusedParameters` / `exactOptionalPropertyTypes` が無い | 追加する。L1、H3 の未使用 `h` 引数 8 個、M13 が検出できるようになる | 一部（前 2 つを追加。`exactOptionalPropertyTypes` は見送り: 違反 11 箇所のほとんどが `env.ronWind = params.discardedBy` のような controller の任意項目で、直すには公開型の任意プロパティに軒並み `\| undefined` を足すことになりフラグの意味が消える。M13 は余剰プロパティ検査の話で、このフラグでは検出できない） |
| L16 | `.github/workflows/test.yaml` | lint が無い（tsc/test/build のみ）。ESLint/Prettier の設定ファイルも存在しない | eslint + prettier を導入し CI に追加。`madge --circular`（H5）も併せて | 未（devDependency の追加とリポジトリ全体の整形が伴うため判断待ち） |

---

## v1.0.0 に向けた推奨実施順序

**Phase 0 — 安全網（他の変更の前提）**

1. M24: 全文スナップショットが暗黙に守っている性質を不変条件テストとして書き足す
2. M23: `toMatchFileSnapshot` に移行（`update` フラグを消す）
3. M22: cwd 依存を解消
4. L15 / L16: tsconfig 厳格化と lint を CI に追加（H5 の `madge --circular` を含む）

**Phase 1 — 公開 API の確定（リリース前が最後の機会）**

5. H1: `export *` を named export に絞る
6. H8: `prevRound` を削除
7. L5a〜L5e: 公開 API と表示文字列の綴り誤りを修正

**Phase 2 — 構造（Phase 0 の安全網に守られて進める）**

8. H5 / L14: barrel 経由の循環依存を解消
9. H6: `RenderOptions` を `ImageHelper` に一本化（不具合修正を含む）
10. H9 / M1 / M2 / M21: 卓の入力解釈を `image/` から分離
11. H2: `calc.ts` を分割
12. H3 / H4 / M15: 役をテーブル化し `instanceof` の重複を解消
13. H7: 計算器を `Hand` から切り離す

**Phase 3 — 仕上げ**

14. 中優先度の残り（M3〜M20、M25〜M27）
15. 低優先度

Phase 1 と Phase 2 は独立に進められる。Phase 2 は 8 → 9 → 10 → 11 の順が依存関係上もっとも摩擦が少ない（barrel を直してから分割すると import の書き換えが 1 回で済む）。
