# mjimage リファクタリング調査レポート

対象: `src/` 配下（`src/lib/controller/` を除く）
現状: `npx tsc --noEmit` エラーなし / `npm test` 161 tests passed（2026-07-28 時点）
観点: 責務分割・重複コード・型の使い方・依存関係の循環・テスト容易性
方針: v1.0.0 リリース対応のため、公開 API の変更を含むドラスティックな修正も選択肢に含める

## 実施状況（2026-07-28 時点）

| 優先度 | 状況 |
|---|---|
| 高 | H3 以外は実施済み。H7 は暫定案（抜き差しを `finally` で対にする）まで。本命の「計算器を純関数化」は未 |
| 中 | 安全網の M22・M23・M24 と、H9 で解消した M19・M20 が実施済み。ほかは未着手 |
| 低 | L16 以外は実施済み。L15 は `exactOptionalPropertyTypes` のみ見送り |

高の実施に伴いファイル構成が変わっている。本文中の箇所は現在のコードに合わせて更新済み。

```
src/lib/calculator/   tile.ts hand.ts shanten.ts block-calculator.ts block-util.ts
                      types.ts score.ts fu.ts serialize.ts point-calculator.ts efficiency.ts
src/lib/input/        table-schema.ts table-yaml.ts table-input.ts   （旧 image/table-parser.ts）
src/lib/assert.ts     （旧 myassert/）
src/lib/__tests__/utils/   helper.ts（パス解決）geometry.ts（SVG から配置を読む）
```

---

## サマリ

| # | 優先度 | 観点 | 箇所 | 概要 | 状態 |
|---|---|---|---|---|---|
| H1 | 高 | 責務分割 | `src/index.ts` | `export *` で内部実装が全て公開 API になる（v1.0.0 で凍結される） | 済（役判定メソッドの露出のみ H3 待ち） |
| H2 | 高 | 責務分割 | 旧 `calculator/calc.ts` | 1938 行に 4 つの責務が同居 | 済 |
| H3 | 高 | 責務分割 | `point-calculator.ts:354-671` | 36 個の `dA1`〜`dK13` メソッド。命名から役が分からない | **未** |
| H4 | 高 | 重複コード | 旧 `calc.ts` 9 箇所 | 刻子系ブロック判定の `instanceof` 列挙が重複 | 済（`Block` の述語に集約） |
| H5 | 高 | 循環依存 | `core/parser.ts` ⇄ `core/index.ts` | barrel を介した循環 | 済 |
| H6 | 高 | 責務分割 | `image/render.ts` / `image/table.ts` | `RenderOptions` が卓に届かない（不具合） | 済（`ImageHelper` に一本化・回帰テストあり） |
| H7 | 高 | テスト容易性 | 計算器全般 | 計算中に `Hand` を破壊的変更。例外時に壊れたまま残る | 一部（`finally` で復元。純関数化は未） |
| H8 | 高 | 型/死んだコード | 旧 `core/wind-util.ts` | `prevRound` が誤り・未使用・公開 API | 済（削除） |
| H9 | 高 | 責務分割 | 旧 `image/table-parser.ts` | 311 行に 3 責務。かつ `image/` に置かれている | 済（`src/lib/input/`） |
| M1 | 中 | 型の使い方 | `input/table-input.ts:49` / `image/table.ts:255` | 表示文字列 `"東"` を識別子として使用 | 未 |
| M2 | 中 | 重複コード | `image/table.ts:205` / `input/table-input.ts:12,19,26` | 席順の型 `{front,right,opposite,left}` が 4 箇所で手書き | 未 |
| M3 | 中 | 型の使い方 | `core/parser.ts:866-881` | `parseTypeOrAlias` が引数を破壊的変更 | 未 |
| M4 | 中 | 死んだコード | `core/parser.ts:821-824` | 到達不能な分岐 | 未 |
| M5 | 中 | 正しさ | `point-calculator.ts:360` | `if (...) [];` — `return` 漏れでガードが無効 | 未 |
| M6 | 中 | 重複コード | `block-calculator.ts:54` / `253` | 既存 TODO。同じ「牌を差し替えた手を列挙」ロジック | 未 |
| M7 | 中 | 重複コード | `score.ts:67-86` / `point-calculator.ts:282-320` | 親子係数の点数計算が表示用と収支用で二重 | 未 |
| M8 | 中 | 重複コード | `calculator/tile.ts:13-29` / `core/constants.ts:186-192` | 牌の値域が二重定義 | 未 |
| M9 | 中 | 責務分割 | `calculator/tile.ts:7-8` | 么九牌の定義 `NZ`/`N19` が calculator にある | 未 |
| M10 | 中 | 型の使い方 | `svgjs/svg.ts:283-294` | `Svg` が継承メソッドを `unimplemented` で投げる | 未 |
| M11 | 中 | 型の使い方 | `svgjs/svg.ts:306-310` | `as unknown as` の二重キャスト | 未 |
| M12 | 中 | 重複コード | `image/image.ts:69-113` / `126-146` | 寸法計算が helper とモジュール関数に二分 | 未 |
| M13 | 中 | 型の使い方 | `image/image.ts:108` | 返り値型に無い余分なプロパティ `w` | 未 |
| M14 | 中 | 責務分割 | `image/image.ts:259,268,313` | 戻り値を捨てて検証目的で呼ぶ関数 | 未 |
| M15 | 中 | 重複コード | `image/image.ts:387-435` / `core/parser.ts:576` | 同じ分類に対する 2 つの switch | 未 |
| M16 | 中 | 型の使い方 | `core/parser.ts` 4 箇所 | Go 風タプル返しのためダミー `Tile` を生成 | 未 |
| M17 | 中 | 型の使い方 | `calculator/hand.ts:17-27,48,166` | `HandData` の BACK だけ `[string, number]` | 未 |
| M18 | 中 | 効率 | `calculator/hand.ts:304-308` | `Hand.clone()` が文字列往復 | 未 |
| M19 | 中 | 型の使い方 | `input/table-yaml.ts:31-32` | `!` の直後に null チェック（型上デッド） | 済（H9 の移設時） |
| M20 | 中 | 保守性 | `input/table-yaml.ts:30` | コメントと実装の不一致 | 済（H9 の移設時、コメント削除） |
| M21 | 中 | 責務分割 | `input/table-yaml.ts:93-107` | sticks 解析が先読み + `i++` で脆い | 未 |
| M22 | 中 | テスト容易性 | `__tests__/utils/helper.ts:18` ほか | cwd 依存のテスト | 済 |
| M23 | 中 | テスト容易性 | `image.test.ts:6` ほか 2 件 | スナップショット更新が手書きフラグ | 済（`toMatchFileSnapshot`） |
| M24 | 中 | テスト容易性 | `__tests__/` 全般 | SVG 文字列全体の比較に依存 | 済（全文は代表 2 件。ほかは不変条件テスト） |
| M25 | 中 | 依存関係 | `e2e/index.ts:3` | 本番スクリプトがテストヘルパに依存 | 未 |
| M26 | 中 | 正しさ | `e2e/index.ts:8` | `Number(...) ?? 1` は NaN を捕まえない | 未 |
| M27 | 中 | 型の使い方 | `efficiency.ts:32` / `browser/mjimage.ts:24` | static のみのクラス（tree-shaking を阻害） | 未 |
| L1〜L16 | 低 | 各種 | （後述） | 未使用 import、死んだ barrel、命名の誤り、tsconfig/CI | L16 のみ未 |

---

## 高

### H1. `export *` により内部実装がすべて公開 API になる — 済

**箇所**: `src/index.ts`

`export * from "./lib/core/"` 等の全放出をやめ、image 部分と同じ明示的な named export に統一した（`src/index.ts` 150 行、公開する名前をコメント付きで分類）。`dist/index.d.ts` は 1291 行・134 宣言 → 1190 行・121 宣言。`TupleOfSize` などの内部ユーティリティは `declare type` に留まり公開面から外れ、`prevRound` は H8 で削除した。

**残り**: `PointCalculator` の役判定メソッド 36 個は public のままなので、クラスごと `dist/index.d.ts` に出ている。H3 のテーブル化と同時に private 化する。

宣言数をリリース前後で比較する CI ステップは未導入（L16 と併せて判断）。

### H2. `calculator/calc.ts` が 1938 行で 4 責務を持つ — 済

1938 行の `calc.ts` を以下に分割した。`calculator/index.ts` が barrel なので import 元は変わらず、テストの変更は不要だった。

```
calculator/
  tile.ts             forHand, NZ, N19, toDora
  hand.ts             Hand, HandData, preserving, withTiles, withoutTiles
  shanten.ts          ShantenCalculator
  block-calculator.ts BlockCalculator
  block-util.ts       buildBlockKey, countSameBlocks, minTile
  types.ts            Yaku, WinningHand ほかの型
  fu.ts               calcFu
  score.ts            点数テーブル・description
  serialize.ts        serialize/deserializeWinResult
  point-calculator.ts PointCalculator（役 + 点数移動）
  efficiency.ts       （現状のまま）
```

当初案の `yaku.ts`（役の定義テーブル）は H3 が未着手のため作っていない。役判定は `point-calculator.ts`（715 行）に残っており、これが calculator で最大のファイル。

### H3. 36 個の `dA1`〜`dK13` メソッド — 未

**箇所**: `src/lib/calculator/point-calculator.ts:354-671`、呼び出し側 `point-calculator.ts:119-201`

名前から役が分からず、呼び出し側は 80 行の手書き列挙（`...this.dA13(hand), ...this.dB13(hand), ...`）になっている。うち 8 個（`dA1:354`, `dG1:402`, `dH1:405`, `dI1:408`, `dJ1:411`, `dK1:414`, `dJ13:666`, `dK13:669`）は引数を使わない — L15 の `noUnusedParameters` 導入時に `_h` へ改名したので、テーブル化していない歪みが署名に出ている状態。`dJ13`/`dK13` は空スタブ（`point-calculator.ts:665` の TODO 天和・地和）なのに毎回呼ばれている。

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
- 現状のメソッドは公開 API に出ている（H1 の残り）ので、同時に private 化する

前提だった M24（不変条件テストの追加）は済み。ただし追加したのは描画側の性質で、役判定そのものは `calculator.test.ts` の期待値が担保する。書き換えの際は役ごとの判定を先にテストへ写しておく。

### H4. 刻子系ブロック判定の `instanceof` 列挙が 9 箇所で重複 — 済

`b instanceof BlockAnKan || b instanceof BlockShoKan || ...` の列挙を `Block` の述語に集約した（`core/parser.ts:285` `isTriplet` / `:301` `isQuad` / `:315` `isSequence` / `:322` `isConcealedTriplet`）。いずれも `_type` の switch で、`instanceof` ではなくタグを見る。合わせて `buildBlockKey` / `countSameBlocks` / `minTile` を `calculator/block-util.ts` に切り出した。

**残り**: クラス階層とタグの二重管理そのものは残っている。`BlockChi` などのサブクラスを廃して `Block` + `BlockType` に寄せる案は採らなかったため、`image/image.ts` の `instanceof` ディスパッチ（M15）と `blockWrapper`（`core/parser.ts:576`）の switch は残る。

### H5. `core/` 内での barrel を介した循環依存 — 済

兄弟モジュール間の import を実体へ直した（`core/parser.ts:3-11` と `core/wind-util.ts:2` がともに `./constants` を直接参照）。barrel（`index.ts`）は外向きの公開面としてのみ使う方針を、理由（export 順に依存した TDZ）ごと `core/index.ts:1-2` に明文化し、`calculator/index.ts:1` / `input/index.ts:1` にも同じ趣旨のコメントを置いた。`image/table.ts` の `"../image/image"` は `"./image"` に修正済み（L14）。

**残り**: `madge --circular` の CI 追加は未（L16 と併せて判断）。

### H6. `RenderOptions` が卓の描画に届かない — 済

`enableDoraText` / `enableTsumoText` を含む `RenderOptions` の全項目を `BaseHelper` が保持する形にした（`image/image.ts:126-146`）。`createBlock` は `const { enableDoraText, enableTsumoText } = h;`（`image.ts:388`）で helper から読むため、`buildHand` / `buildTable` に `options` を引き回す経路が消え、卓でも注記オプションが効く。

回帰テストあり: `__tests__/table.test.ts:48`「annotation options apply to the table as well as to a hand」。

### H7. 計算器が `Hand` を破壊的に変更する — 一部（暫定案まで）

**箇所**: `calculator/hand.ts:330-374`

暫定案（`dec`/`inc` の対を `finally` で必ず戻す）を、抜き差しを包む 3 つのヘルパとして実装した。

```ts
hand.preserving(fn)              // 入口で写しを取り、fn が例外で終わっても写しへ戻す
withoutTiles(hand, tiles, fn)    // 一時的に抜く。finally で inc
withTiles(hand, tiles, fn)       // 一時的に加える。finally で dec
```

`ShantenCalculator` / `BlockCalculator` / `Efficiency` の `dec`→再帰→`inc` はすべてこの形に置き換わり、例外時に `Hand` が壊れたまま残ることはなくなった。

**残り**: 本命の「探索を `Hand` から切り離す」は未。カウント配列（`Int8Array(34)` 相当）を値として受け渡す純粋関数にすると破壊的変更自体が消え、性能も上がる。

```ts
type Counts = Readonly<Record<Type, readonly number[]>>;
function shanten(counts: Counts, calledCount: number): number;
function decompose(counts: Counts): readonly (readonly Block[])[];
```

現状は「呼び出し側から見れば読み取り専用」までは達しているが、再帰の途中経過が観測可能な点と、メモ化・並行実行ができない点は残る。

### H8. `prevRound` が誤っている（かつ未使用・かつ公開 API） — 済

`nextRound` を 3 回適用する誤った実装で、`src/` 全体で使用箇所ゼロだったため削除した。`core/wind-util.ts` は `createWindMap` / `nextRound` / `roundWind` / `nextWind` / `prevWind` の 52 行になり、未使用 import（L1）と `prevWind` の冗長な実装（L8）も同時に解消した。barrel ではなく `./constants` を直接 import する（H5）。

### H9. `image/table-parser.ts` が 3 責務・311 行 — 済

責務ごとに分け、`image/` の外へ出した。

```
src/lib/input/
  table-schema.ts   valibot スキーマ + Raw* 型            （102 行）
  table-yaml.ts     parseYamlStringInput（行スキャナ）     （110 行）
  table-input.ts    convertTableInput + TableInput/Discards/Hands/ScoreBoard （115 行）
src/lib/image/
  table.ts          TableInput を受け取って描くだけ
```

依存は `image` → `input` の一方向。テストは `__tests__/table-input.test.ts` に改名（L5f）。この移設の過程で M19（不要な `!`）と M20（実装と食い違うコメント）も解消した。

**残り**: M1（表示文字列を識別子に使用）、M2（席順の型の重複）、M21（sticks 解析の先読み）は移設しただけで中身は当時のまま。

---

## 中

中は安全網の M22・M23・M24 と、H9 の移設時に解消した M19・M20 が済み。ほかは未着手で、以下の本文は箇所を現在のコードに合わせて更新してある。

### M1. 表示文字列を識別子として使っている

**箇所**: `input/table-input.ts:36,49,108`、`image/table.ts:255,297`

```ts
type BoardWind = (typeof WIND_MAP)[keyof typeof WIND_MAP];  // "東"|"南"|"西"|"北"
export interface ScoreBoard { frontPlace: BoardWind; ... }
```

`image/table.ts:255 getPlaces("東")` はこの**表示文字列**で席順を計算する。一方 `input/table-input.ts:108 createPlaceMap` は `Wind`（`"1z"`）で同じ席順を計算する。同じロジックが 2 つの表現で二重管理されており、`WIND_MAP` の値を変えると描画側の席順が壊れる。H9 でファイルが分かれたことで、境界を跨いだ二重管理であることがより見えやすくなった。

**修正方針**: 内部表現は `Wind` に統一し、`WIND_MAP` の適用は `Text` を組み立てる直前だけにする。`getPlaces` は `nextWind` で書ける（`createPlaceMap` と同一実装になる → 統合できる）。

### M2. 席順の型が 4 箇所で手書き

**箇所**: `image/table.ts:205`（`Seats<T>`）、`input/table-input.ts:12`（`Discards`）、`:19`（`Hands`）、`:26-37`（`ScoreBoard.scores`）

すべて `{ front, right, opposite, left }`。`image/table.ts` にはすでに汎用の `Seats<T>` があるのに、`input/` 側は使っていない。

**修正方針**: `Seats<T>` を共有モジュール（`input/` 側か、両者が依存できる場所）に置き、以下の別名にする。`mapSeats`（`table.ts:207`）/ `maxOfSeats`（`table.ts:214`）もそこに移す。

```ts
export type Discards = Seats<readonly Tile[]>;
export type Hands = Seats<readonly Block[]>;
// ScoreBoard.scores: Seats<number>
```

### M3. `parseTypeOrAlias` が引数を破壊的に変更する

**箇所**: `core/parser.ts:866-881`

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

`parse` を名乗る関数が入力を書き換える。さらに `validate` はこの関数を「文字が牌種かどうか」の判定にだけ使うため、ダミーの `[new Tile(TYPE.BACK, 1)]` を渡している（`parser.ts:782`）。

**修正方針**: 2 つの関心を分ける。

```ts
function tileTypeOf(c: string): Type | null;                        // 純粋な判定
function expandAlias(c: "w" | "d", cluster: readonly TileBase[]): TileBase[] | null; // 新配列を返す
```

`validate` は `tileTypeOf(lastChar) != null` で済むようになり、ダミー `Tile` が不要になる。

### M4. `detectBlockType` に到達不能な分岐

**箇所**: `core/parser.ts:805`, `821-824`

```ts
if (numTsumoDora > 0) return BLOCK.UNKNOWN;   // :805 これ以降 numTsumoDora は常に 0
...
if (numHorizontals == 1) return BLOCK.IMAGE_DISCARD;  // :821
if (numTsumoDora == 0) return BLOCK.IMAGE_DISCARD;    // :822 常に真
return BLOCK.UNKNOWN;                                  // :824 到達不能
```

**修正方針**: `821-824` を `return BLOCK.IMAGE_DISCARD;` の 1 行にする。`BLOCK.UNKNOWN`（`constants.ts` に「現状使用されない」とコメント）が本当に不要なら、`image/image.ts:422-431` の default 節と併せて削除を検討する。

### M5. `return` 漏れでガードが無効

**箇所**: `point-calculator.ts:360`

```ts
dB1(h: readonly Block[]): readonly Yaku[] {
  if (this.hand.drawn == null) [];        // ← return が無い。式文で何もしない
  if (this.getCalledPenalty() != 0) return [];
  const cond = h.some((b) => b.tiles.some((t) => t.has(OP.TSUMO)));
  return cond ? [{ name: "門前清自摸和", han: 1 }] : [];
}
```

`BlockCalculator.markedHand`（`block-calculator.ts:54`）は `lastTile.has(OP.TSUMO)` でも TSUMO を付けるため、`hand.drawn == null` でもツモ扱いのブロックが渡りうる。そのとき本来のガードが効かず門前清自摸和が付く。

**修正方針**: `return [];` に直す。ただしこのガードを入れると既存の呼び出し（`hand.drawn` を設定せず `lastTile` にツモ演算子を付けるパターン）の結果が変わる可能性があるため、直す前に両方のケースのテストを足して意図を確定させる。H3 のテーブル化と同じ箇所を触るので、まとめて対応してもよい。

### M6. 「牌を差し替えた手を列挙する」ロジックの重複

**箇所**: `block-calculator.ts:54-…`（`markedHand`）と `block-calculator.ts:253-…`（`addRedPattern`）。`block-calculator.ts:304` に既存 TODO あり。

どちらも同じ形をしている: ブロックを走査 → `[bIdx, tIdx]` を集める → `Set<string>` で `buildBlockKey` による重複排除 → `block.clone({ replace: {...} })` で新しい手を作る。H2 の分割で 2 つが同一ファイルに並んだため、重複が読み取りやすくなっている。

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

**箇所**: `score.ts:67-86`（`generatePointDescription`）と `point-calculator.ts:282-320`（`calculateRonDeltas` / `calculateTsumoDeltas`）

```ts
// score.ts:74-77
const coefficient = isParent ? POINT_COEFFICIENT.PARENT_RON : POINT_COEFFICIENT.CHILD_RON;
return `${myCeil(base * coefficient)}`;
// point-calculator.ts 側  まったく同じ式
const coefficient = isParent ? POINT_COEFFICIENT.PARENT_RON : POINT_COEFFICIENT.CHILD_RON;
const points = myCeil(base * coefficient);
```

表示文字列と点数移動が別々に係数を掛けているため、片方だけ直すと表示と収支がずれる。H2 の分割で両者が別ファイルに分かれたため、いまは重複していること自体が見えにくい。

**修正方針**: 点数の算出を `score.ts` に 1 箇所へまとめ、表示側はその結果を整形するだけにする。

```ts
function ronPoints(base: number, isParent: boolean): number;
function tsumoPoints(base: number, isParent: boolean): { fromParent: number; fromChild: number };
```

### M8. 牌の値域が二重定義

**箇所**: `calculator/tile.ts:13-29`（`forHand`）と `core/constants.ts:186-192`（`TILE_NUMBERS`）

```ts
// tile.ts:24
const upper = t == TYPE.Z ? 7 : t == TYPE.BACK ? 1 : 9;
```

`TILE_NUMBERS` に同じ知識がある（`constants.ts` のコメントも「入力の検証と、牌画像の ID 一覧の生成で同じ定義を使う」と言っている）。3 つ目の定義になっている。

**修正方針**: `forHand` を `TILE_NUMBERS` から導出する（赤の別名 `0` を除いて反復）。

### M9. 么九牌の定義が calculator にある

**箇所**: `calculator/tile.ts:7-8`

```ts
export const NZ: readonly number[] = [1, 2, 3, 4, 5, 6, 7];
export const N19: readonly number[] = [1, 9];
```

H2 の分割で `calc.ts` から `calculator/tile.ts` へ移り、コメントは付いたが、牌の語彙は `core/constants.ts` の関心事という点は変わっていない。名前も内容を表していない。

**修正方針**: `core/constants.ts` へ移し、`HONOR_NUMBERS` / `TERMINAL_NUMBERS` に改名する。`TILE_NUMBERS[TYPE.Z]` と `NZ` は同値なので統合できる。

### M10. `Svg` が継承したメソッドを `unimplemented` で投げる

**箇所**: `svgjs/svg.ts:283-294`

```ts
x(x: number): this { throw new Error("unimplemented"); }
y(y: number): this { throw new Error("unimplemented"); }
dx(x: number): this { throw new Error("unimplemented"); }
dy(y: number): this { throw new Error("unimplemented"); }
```

`Mark`（`svg.ts:27`）が位置操作を持つため、位置を持たない `Svg` が継承してしまう典型的な LSP 違反。`RenderedSvg`（`svg.ts:328-340`）で外向きには隠しているが、内部では `Svg` を `Mark` として扱えるので保護になっていない。

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

コメントにあるとおり、`Container.add(e: Mark)` と `RenderedSvg.add(element: Placeable)` の非互換を潰すための逃げ。`src/index.ts` で公開 API の入口・出口に使われており、ここで型検査が切れている。H1 で公開面を絞ったあとも、この 2 つは公開されたままになっている。

**修正方針**: `Placeable` を `Mark` が実際に満たす形にする。`G` は `translate`/`rotate` を持つので、`Placeable` を `G` が implements していると宣言し、`RenderedSvg.add(element: Placeable)` の実装側シグネチャを `add(e: Mark & Placeable)` に揃えれば、キャストなしで `Svg` が `RenderedSvg` に代入可能になる。

### M12. 寸法計算が helper とモジュール関数に二分

**箇所**: `image/image.ts:69-113`（`blockImageSize` / `scaledTileWidth` / `scaledTileHeight` / `tileImageSize`）と `image.ts:126-146`（`BaseHelper.tileWidth` / `tileHeight` / `scale`）

同じ値が 2 経路で求まる。呼び出し側は helper を持っているのに `h.scale` を取り出して関数に渡し直している（`image.ts` 内で `tileImageSize(t, this.scale)` / `blockImageSize(b, h.scale)` が計 11 箇所）。`table.ts:72 riverRowWidth` は `helper.tileHeight` / `helper.tileWidth` を使い、`image.ts` は `tileImageSize(...).baseWidth` を使う — 同じ量の呼び名が 2 つある。

H6 で `RenderOptions` を helper に集約したので、寸法もそこへ寄せる下地はできている。

**修正方針**: 寸法計算を helper のメソッドに一本化する（`helper.tileSize(tile)` / `helper.blockSize(block)`）。モジュール関数版は削除。

### M13. 返り値型に無い余分なプロパティ

**箇所**: `image/image.ts:106-108`

```ts
const size = tile.has(OP.HORIZONTAL)
  ? { width: h, height: w, baseWidth: w, baseHeight: h }
  : { width: w, height: h, w, baseWidth: w, baseHeight: h };
//                          ^ 宣言された返り値型に無い
```

返り値型は `{width,height,baseWidth,baseHeight}`。三項演算子の結果を一度変数に入れてから返しているため、余剰プロパティ検査をすり抜けている。L15 の tsconfig 厳格化（`noUnusedLocals` / `noUnusedParameters`）では検出できない種類の問題なので、依然として残っている。

**修正方針**: `w,` を削除する。

### M14. 戻り値を捨てて検証目的で呼ぶ関数

**箇所**: `image/image.ts:259, 268, 313`

```ts
createBlockChi(block: BlockChi) {
  this.findHorizontalIndex(block);   // 戻り値を使わない。例外を出すためだけ
  return this.createHorizontalBlock(block.tiles);
}
```

`findHorizontalIndex`（`image.ts:375`）は index を返すが、3 箇所では検証としてのみ呼ばれている（`createBlockShoKan:276` だけが戻り値を使う）。

**修正方針**: 意図を名前に出す（`assertHasHorizontal(block)`）か、`BlockChi`/`BlockPon`/`BlockDaiKan` のコンストラクタ側で不変条件を保証しているなら削除する（`image.ts` のコメントは「BlockChi が保証する」と言っており、実際 `blockWrapper`（`core/parser.ts:576`）で assert 済み → 削除できる）。

### M15. 同じ分類に対する 2 つの switch

**箇所**: `core/parser.ts:576`（`blockWrapper`: type → クラス）と `image/image.ts:387-435`（`createBlock`: instanceof → 描画）

さらに `createBlock` は `BlockOther` に対して `b.type` で二度目のディスパッチを行う（`image.ts:398-431`）。ブロック種別を足すと 3 箇所を直す必要がある。H4 では計算器側の `instanceof` 列挙だけを述語に置き換えたので、描画側のディスパッチはそのまま残っている。

**修正方針**: 描画をテーブル化し `instanceof` を排除する。

```ts
const RENDERERS: Record<BlockType, (b: Block, h: ImageHelper) => G> = {
  [BLOCK.PON]: (b, h) => h.createBlockPon(b), ...
};
```

サブクラスを廃して `Block` + タグに寄せるなら `blockWrapper` 側の switch も消えるが、H4 ではそこまで踏み込んでいない。

### M16. Go 風タプル返しのためのダミー値生成

**箇所**: `core/parser.ts:86`（`isType`）, `883`（`isNumber`）, `890-911`（`isOperator`）, `866-881`（`parseTypeOrAlias`）

```ts
if (!ops.includes(l.char)) return [new Tile(TYPE.BACK, 0), false];   // :892
...
return [new Tile(TYPE.BACK, 0), false];                              // :911
```

失敗を表すためだけに `Tile` を生成している。呼び出し側（`parser.ts:678,691,697`）はタプルの第 2 要素を見るまで第 1 要素の妥当性が分からない。

**修正方針**: `null` を返して TS の絞り込みを使う。

```ts
function tileTypeOf(c: string): Type | null;
function numberOf(c: string): number | null;
function operatorTileAt(l: Lexer): TileBase | null;
```

`parser.ts:782` の `const [_, isKind] = ...` のような使い捨て変数も消える（M3 と同時に対応するのが自然）。

### M17. `HandData` の BACK だけ型が違う

**箇所**: `calculator/hand.ts:17-27`, `48`, `166-171`

```ts
export interface HandData {
  [TYPE.M]: TupleOfSize<number, 10>;
  ...
  [TYPE.BACK]: [string, number];    // ← 他と型が違う
}
// :48
[TYPE.BACK]: ["untouchable", 0],    // 番兵文字列
// :166-171
get(t: Type, n: number) {
  if (t == TYPE.BACK) return this.data[t][1];   // BACK だけ特別扱い
  return this.data[t][n];
}
```

「0 番目を触るな」を型ではなく文字列リテラルで表現している。`inc`（`hand.ts:173`）/ `dec`（`:199`）も BACK を分岐しており、H7 で入れた `snapshot`（`:313-321`）も BACK だけキャストが必要になっている。

**修正方針**: 裏牌の枚数を別フィールドに出す。

```ts
interface HandData {
  counts: { [TYPE.M]: number[]; [TYPE.P]: number[]; [TYPE.S]: number[]; [TYPE.Z]: number[] };
  backCount: number;
  called: ...; tsumo: ...; reached: ...;
}
```

`TupleOfSize`（`hand.ts:17-21`）は長さを型で固定する以外の役目がなく、実際には index アクセスの安全性を与えていない（`data[t][n]` の `n: number` は範囲検査されない）ので、併せて削除してよい。H1 で公開面からは外れたので、削除しても公開 API には影響しない。

### M18. `Hand.clone()` が文字列往復

**箇所**: `calculator/hand.ts:304-308`

```ts
clone(): Hand {
  const c = new Hand(this.toString());   // 直列化 → 再パース
  c.data.reached = this.data.reached;
  return c;
}
```

`toString()` は `hands` getter を呼び、`hands` は全牌の `Tile` を作り直す。さらに `new Hand(string)` は `Parser` を通す。`inc`/`dec` のエラーメッセージ生成でも `toString()` が呼ばれる。

**修正方針**: `data` の構造的コピーで clone する。H7 で追加した `snapshot()`（`hand.ts:313-321`）がすでに配列を複製する写しを作っているので、これを流用すれば `reached` を手で写す必要もなくなる。

### M19. `!` の直後に null チェック — 済

`input/table-yaml.ts:31-32` は `!` を外し、`labels.find(...)` の結果を `string | undefined` として受けてから null チェックする形になった（H9 の移設時に対応）。

### M20. コメントと実装の不一致 — 済

「1w,2w,3w,4w エイリアスをサポート」というコメントは実装が伴っていなかったため削除した（`input/table-yaml.ts:30`）。エイリアス自体は未サポートのまま。牌の記法では `w` を別名扱いしている（`core/parser.ts:870` 付近）ので、卓の入力でも揃えるなら別途 M21 と同時に検討する。

### M21. `parseBoardSection` の sticks 解析が脆い

**箇所**: `input/table-yaml.ts:93-107`

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

2 行先読み + 条件付きの `i++` 2 回。インデントを一切見ないため（全行 `trim()` 済み）、階層の異なる位置にある `reach:` を拾いうる。ネストが 1 段深いキーを足すたびにこの形が増える。

**修正方針**: 行をトークン（`{ indent, key, value }`）に落としてから木を組む小さなスキャナに置き換える。インデントを保持すれば先読みと `i++` が消え、`board` 以外のネストにも一様に対応できる。valibot スキーマ（`input/table-schema.ts`）は変更不要。

### M22. cwd 依存のテスト — 済

パスの解決を `import.meta.url` 基準に寄せ、`__tests__/utils/helper.ts` の 3 つの関数に集約した。

```ts
fixturePath(filename)    // __fixtures__/ の絶対パス
snapshotPath(filename)   // __snapshots__/ の絶対パス（toMatchFileSnapshot に渡す）
assetPath("svg", ...)    // public/ の絶対パス（牌の SVG・スプライト）
```

`svg.test.ts` / `svg-tile.test.ts` の `"public/svg/tiles.svg"` などの相対パスはすべてこれに置き換えた。確認: `cd src && npx vitest run --root ..`（cwd が `src/`）で 164 件とも通る。

### M23. スナップショット更新が手書きフラグ — 済

`const update = false;` と `loadTestData` を削除し、`await expect(got).toMatchFileSnapshot(snapshotPath(...))` に置き換えた。更新は `vitest -u` で行う。CI（`CI=true`）では期待値ファイルが無い場合も自動生成されず失敗するので、フラグの立て忘れで無条件に通る状態はなくなった。

`helper.ts` に残したのは `loadInputData` と、`e2e/index.ts` が使う `loadArrayData` / `storeArrayData`（M25）だけ。

### M24. SVG 文字列全体の比較への依存 — 済

全文スナップショットを 18 件 → 2 件（`image.common.svg` と `yaml-to-svg.common.svg`）に絞り、残りは配置そのものを見る不変条件テストにした。削除した中には 838KB の `use.1m.svg`（スプライト全文）も含む。

配置を読むために `__tests__/utils/geometry.ts` を追加した。`g` の `transform` を合成して牌 1 枚ごとの外接矩形・回転の有無・`style` を返す（`placedTiles` / `boundsOf`）。`table.test.ts` に埋まっていた同種のコードもここへ移した。

書き足した性質（旧スナップショットとの対応）:

| 旧スナップショット | 代わりに固定した性質 |
|---|---|
| `image.chi` / `image.simple-discard*` / `image.multiple-operators` | 横向き牌は縦横が入れ替わり、下端が縦向き牌と揃う。隣と重ならない |
| `image.05an-kan` | 暗槓は両端が裏牌。赤牌は `0` の画像 |
| `image.05sho-kan` | 小明槓は横向き 2 枚を隙間なく積み、縦向き牌はその下端に揃う |
| `image.out-discard` | ツモ切りの牌は減光。オペレータは 1 枚に複数乗る |
| `back-tile-hand-discard-block-1` | 裏牌もほかの牌と同じ大きさ・同じ列 |
| `dora-tsumo-without-text` | 注記の幅は描くときだけ確保。牌の位置は変わらず、後続ブロックが詰まる |
| `table.max-size` | 卓は正方形。描画物は卓の内側に収まり、手牌の左右に牌 1 枚分が残る |
| `table.dynamic-size` | 一番広い手牌に応じて卓が広がる |
| `table.uneven-discards` | 各家の河は自分の辺に貼り付く（他家の枚数につられない） |
| `yaml-to-svg.omit` | 省略した家・項目に既定値が入り、4 家ぶんが揃う |
| `yaml-to-svg.dora-indicators` | 既存の `dora indicators` 系 2 件がカバー |
| `use.1m` / `use.filtered-m1` | `importSymbol` は全 symbol を取り込み、`optimizeSVG` は参照しているものだけ残す |

ブロック間余白と河の折り返し（`RIVER_ROW_SIZE`）も独立した性質として固定した。

**検証**: 実装を 5 通り壊して、代表スナップショットだけでなく名前付きの不変条件テストが落ちることを確認した（ブロック間余白の削除 / 河のオフセット削除 / 横向き牌の Y オフセット削除 / 暗槓の裏牌 / 河の折り返し幅）。

### M25. 本番スクリプトがテストヘルパに依存

**箇所**: `e2e/index.ts:3`

```ts
import { loadArrayData, storeArrayData } from "./../lib/__tests__/utils/helper";
```

`tsconfig.json` の `include: ["src/**/*"]` により型検査の対象にも入る。テストユーティリティが実行経路に混ざっている。

**修正方針**: `loadArrayData` / `storeArrayData`（`helper.ts:29-47`）を `src/e2e/fixtures.ts` に移す。テスト側からも必要なら、そちらから import する（依存の向きを逆にする）。

### M26. `Number(...) ?? 1` は NaN を捕まえない

**箇所**: `e2e/index.ts:8`

```ts
const count = Number(process.argv[3]) ?? 1;
```

引数省略時は `Number(undefined)` = `NaN` であり、`??` は発火しない。結果 `count = NaN` となりループが 1 度も回らない。

**修正方針**: `const count = Number(process.argv[3] ?? 1);` にする。または `Number.isFinite` で検証して既定値にフォールバックする。

### M27. static メソッドのみのクラス

**箇所**: `calculator/efficiency.ts:32`（`Efficiency`）、`browser/mjimage.ts:24`（`mjimage`）

`package.json` は `"sideEffects": false` を宣言しているが、クラスに包むとメソッド単位の tree-shaking が効かず、`Efficiency.calcEffectiveTiles` だけを使う利用者も `getEffectiveTiles` を取り込む。

**修正方針**: 素の関数 export にする。`Efficiency` は名前空間として意味があるなら `export * as Efficiency` で再現できる（この形なら tree-shaking が効く）。`mjimage` はブラウザのグローバルとして名前が必要なので、`browser/global.ts` でオブジェクトリテラルを組み立てる形にする。公開 API の形が変わるので、着手するならリリース前に。

---

## 低

| # | 箇所（調査時点） | 内容 | 修正方針 | 状態 |
|---|---|---|---|---|
| L1 | `core/wind-util.ts:1-2` | `BLOCK` と `assert` が未使用 import | 削除。L15 の tsconfig 厳格化で自動検出できる | 済（H5 の対応時） |
| L2 | `svgjs/index.ts` | どこからも import されない barrel（全て `../svgjs/svg` を直接参照）。`image/index.ts` もテストからのみ | 削除するか、参照を barrel 経由に統一する | 済（`svgjs/index.ts` を削除。`image/index.ts` はテストの入口として残す） |
| L3 | `core/lexer.ts:27-44` | `peekChar` / `prevChar` が本番コード未使用（`lexer.test.ts` からのみ）。`prevChar` は EOF 時の挙動に FIXME | 削除する。テストも併せて整理 | 済 |
| L4 | `myassert/` | 5 行の関数のためのディレクトリ + `index.ts` | `src/lib/assert.ts` に平坦化 | 済 |
| L5a | 旧 `calc.ts` | `WINING_TILE_BLOCK_TYPE` は綴り誤り（公開 API） | `WINNING_TILE_BLOCK_TYPE` に改名。v1.0.0 前が最後の機会 | 済 |
| L5b | 旧 `calc.ts` | `winning_tile_block_type` — コードベース唯一の snake_case（公開 API） | `winningTileBlockType` に改名 | 済（`WinResult` のシリアライズ結果も変わる） |
| L5c | 旧 `calc.ts` | `excludedypes` の綴り誤り | `excludedTypes` に | 済 |
| L5d | 旧 `calc.ts` | 役名 `"純全帯么九色"` は誤り（利用者に表示される） | `"純全帯么九"` に | 済 |
| L5e | 旧 `calc.ts` | 役名 `"ニ盃口"` がカタカナのニ（利用者に表示される） | `"二盃口"` に | 済 |
| L5f | `__tests__/tabale-parser.test.ts` | ファイル名の綴り誤り | `table-parser.test.ts` に | 済（H9 で対象が `input/` に移ったため `table-input.test.ts`） |
| L6 | `browser/mjimage.ts:4-9` | `Omit<RenderOptions,"scale">` の直後に `scale?: number` を再宣言（実質何も除いていない）。`{...props}` で `querySelector`/`tableScale`/`responsive` が `RenderOptions` として渡る | `extends RenderOptions` にし、render へは必要な項目だけ明示的に渡す | 済（ブラウザ固有の 3 項目を分割代入で除いた残りを渡す） |
| L7 | `browser/mjimage.ts:27-31` | 再代入しない変数に `let` | `const` に | 済 |
| L8 | `core/wind-util.ts:54-60` | `prevWind` の `cycle = [1,4,3,2]` + `indexOf` + 剰余は `((n + 2) % 4) + 1` と等価 | 素直な式に | 済 |
| L9 | `image/table.ts:14` | 河 1 行の枚数 `chunkSize = 6` がマジックナンバー | `TABLE_CONTEXT.RIVER_ROW_SIZE` へ | 済 |
| L10 | `core/parser.ts:581` | `maxInputLength = 600` がインスタンスフィールド | モジュール定数に | 済（`MAX_INPUT_LENGTH`） |
| L11 | 旧 `calc.ts` 3 箇所 | `{[key: string]: boolean}` を Set 代わり、オブジェクトをカウンタ代わりに使用 | `Set<string>` / `Map<string, number>` | 済（`block-util.ts:15` の `countSameBlocks` ほか） |
| L12 | `efficiency.ts:50-55` | 3 重三項のうち 2 分岐が同一式 | `const keepRed = !options?.arrangeRed && t.has(OP.RED);` で 1 行に畳む | 済 |
| L13 | `core/parser.ts:203-220` | `Block.deserialize` の入れ子 if + ネガティブ条件 + TODO | 計算専用タイプを `Set` にまとめ、早期 return に | 済（`CALCULATED_BLOCK_TYPES`） |
| L14 | `image/table.ts:10` | 同一ディレクトリを `"../image/image"` で参照 | `"./image"` に（H5 と同根） | 済（H5 の対応時） |
| L15 | `tsconfig.json` | `noUnusedLocals` / `noUnusedParameters` / `exactOptionalPropertyTypes` が無い | 追加する。L1、H3 の未使用 `h` 引数 8 個、M13 が検出できるようになる | 一部（前 2 つを追加。`exactOptionalPropertyTypes` は見送り: 違反 11 箇所のほとんどが `env.ronWind = params.discardedBy` のような controller の任意項目で、直すには公開型の任意プロパティに軒並み `\| undefined` を足すことになりフラグの意味が消える。M13 は余剰プロパティ検査の話で、このフラグでは検出できない） |
| L16 | `.github/workflows/test.yaml` | lint が無い（tsc/test/build のみ）。ESLint/Prettier の設定ファイルも存在しない | eslint + prettier を導入し CI に追加。`madge --circular`（H5）も併せて | 未（devDependency の追加とリポジトリ全体の整形が伴うため判断待ち） |

---

## 残作業と実施順序

Phase 1（公開 API の確定）と Phase 2（構造）は、H3 を除いて完了している。以下は残りだけを並べたもの。

**1. 安全網**

| 項目 | 状態 |
|---|---|
| L15: tsconfig 厳格化（`noUnusedLocals` / `noUnusedParameters`） | 済（`exactOptionalPropertyTypes` は見送り、L15 の欄参照） |
| M24: 全文スナップショットが暗黙に守っている性質を不変条件テストとして書き足す | 済（全文 18 件 → 2 件） |
| M23: `toMatchFileSnapshot` に移行（`update` フラグを消す） | 済 |
| M22: cwd 依存を解消 | 済 |
| L16: lint（eslint + prettier）を CI に追加。H5 の `madge --circular` も併せて | 未（判断待ち） |

L16 以外は完了。テストは 164 件（M24 の書き足しで +3）。

**2. H3: 役をテーブル化する（残る唯一の高）**

安全網が入ったので着手できる。H1 の残り（役判定メソッドの private 化）と M5（`return` 漏れ）も同じ箇所なので同時に対応する。リリース前にやるなら、公開 API から 36 メソッドが消えるのはこのタイミング。

**3. 中の残り**

リリース前にやる価値があるのは公開 API に触れるもの — M27（static クラス → 関数）、M11（`asRenderedSvg` / `asSvg` の露出）、M17（`HandData` の形）。ほかは v1.0.0 後でも semver 上の制約なく進められる。

関連するものは束ねると効率が良い:

- M3 + M16（`core/parser.ts` のタプル返しとダミー `Tile`）
- M12 + M13 + M14（`image/image.ts` の寸法計算と検証呼び出し）
- M15 + H4 の残り（ブロックのディスパッチをタグに寄せる）
- M6 + M5（`block-calculator.ts` / 役判定）
- M1 + M2 + M21（`input/` の内部表現と行スキャナ）
- M8 + M9（牌の語彙を `core/constants.ts` へ）
- M18（`Hand.clone`）は H7 の `snapshot()` を流用するだけで済む

**4. 低の残り**

L16 のみ。
