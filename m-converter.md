# m-converter 互換性調査レポート

対象:

- ライブラリ: `@konoui/mjimage` 現在の作業ツリー（`dev` ブランチ, package.json は `1.0.0`）
- 利用側: `/Users/tanaka/dev/src/github.com/konoui/m-league-score-sheet/m-converter`（`@konoui/mjimage@^0.12.1` を使用、`node_modules` には `0.12.1` が入っている）

調査日: 2026-08-02

## 結論

**そのままでは満たせない。** m-converter は現在の実装に対して型エラー 17 件（`index.ts` 6 / `table-drawer.ts` 9 / `mj.ts` 1 / `util.test.ts` 1）と実行時エラーを出す。ただし**失われた機能はなく、破壊的変更はすべて呼び出し側の書き換えで吸収できる**。中身の計算結果（シャンテン・有効牌・点数・符・翻）は 0.12.1 と完全に一致することを実測で確認した。

| 分類                                | 件数 | 対応                                     |
| ----------------------------------- | ---- | ---------------------------------------- |
| 破壊的変更（m-converter の修正必須） | 4    | 後述の移行手順で対応可能                 |
| 挙動差（動くが出力が変わる）         | 3    | 影響は軽微、DB の役名だけ要マイグレーション |
| 互換（修正不要）                     | —    | 数値計算はすべて一致                     |

## 調査方法

1. m-converter の全ソースを、`@konoui/mjimage` を**ローカルの `src/index.ts` に paths 解決**させて `tsc --noEmit` で型検査（→ 型レベルの非互換を網羅）。
2. m-converter の `src/util.test.ts` を、同じくローカル src に alias して vitest 実行（→ 実行時の破綻を確認）。
3. 旧 `0.12.1`（m-converter の `node_modules` の dist）と新 `src` を**同一プロセスに両方 import** し、同じ入力を流して出力を突き合わせる差分ハーネスを作成:
   - ランダム 13 枚手牌 300 種で `ShantenCalculator.calc/sevenPairs/thirteenOrphans/standardType` と `Efficiency.getEffectiveTiles`
   - 構成的に生成した和了形 1500 ケース（門前）＋ 1500 ケース（鳴きあり）で `BlockCalculator` + `PointCalculator` の全出力
   - 卓 SVG の生成結果（viewBox・牌画像・テキスト）
4. `npm test`（mjimage 本体, 311 passed）と `npm run build` が通ることを確認。

## m-converter が使っている公開 API

`Round` `Wind` `WIND` `ROUND` `ROUND_MAP` `OP` `BLOCK` `Operator` `Tile` `Block` `BlockPon` `BlockAnKan` `BlockShoKan` `BlockDaiKan` `BlockRun` `BlockPair` `BlockThree` `BlockIsolated` `Parser` `Hand` `BlockCalculator` `PointCalculator` `ShantenCalculator` `Efficiency` `BoardContext` `WinResult` `toDora` `createWindMap` `nextWind` `River` `IRiver` `Counter` `ScoreManager` `PlaceManager` `createTable` `ImageHelper` `SVG` `parseRawTableInput` `convertTableInput` `RawTableInput` `RawBoardInput` `RawWindInput` `RawWindInputs`

このうち **現在の `src/index.ts` から消えているのは `ImageHelper` / `parseRawTableInput` / `convertTableInput` / `Raw*Input` 系の 7 つ**（いずれも卓描画の入力まわり）。他はすべて公開されている。

---

## 1. 満たせない点（m-converter の修正が必要）

### 1-1. `BoardContext.ronWind` の廃止 → `winBy` が必須に

もっとも影響が大きい。

```ts
// 旧 (0.12.1)
export interface BoardContext { ...; ronWind?: Wind; }

// 新
export type WinBy =
  | { readonly type: "tsumo" }
  | { readonly type: "ron"; readonly from: Wind };
export interface BoardContext { ...; winBy: WinBy; }   // 必須
```

- 型エラー: `src/mj.ts:233`（`getBoardParams` の戻り値に `winBy` がない）、`src/index.ts:986,1029,1035,1055`、`src/util.test.ts:138`
- 実行時: `winBy` が `undefined` のまま `PointCalculator.calc()` を呼ぶと `TypeError: Cannot read properties of undefined (reading 'type')`（`point-calculator.ts:124`）。実際に `util.test.ts` を新実装で走らせると 20 件中 8 件がこれで落ちる。
- 新実装は `winBy` と手牌のあがり牌の印（`t` / `v`）が食い違うと assert する（`win type mismatch: ...`）。m-converter は `getAgariType(ret.hand, ...)` で既に `OP.RON` の印を前提にブロックを絞っているので、この前提は満たされているはず。

なお `ronWind` → `winBy.from` は点数移動の意味も同じ（差分ハーネスで `deltas` 一致を確認済み）。

### 1-2. `WinResult.basePoints` → `pointsWithoutSticks` へ改名

- 型エラー: `src/index.ts:366`, `src/index.ts:1040`
- 旧 `basePoints` は「供託・積み棒を足す前の自分の増分」で、新 `pointsWithoutSticks` と**定義も値も同一**（旧 dist の実装と新実装の両方を読んで確認、実測でも全ケース一致）。単純な置換でよい。

### 1-3. 卓描画 API の総入れ替え（`src/table-drawer.ts` が全滅）

| 旧                                                          | 新                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------ |
| `parseRawTableInput(obj)` / `convertTableInput(v)` を公開    | 非公開（YAML 文字列を受ける `parseTableInput(yaml)` のみ公開）      |
| `RawTableInput` / `RawBoardInput` / `RawWindInput` / `RawWindInputs` | 非公開                                                      |
| `ImageHelper` を利用側が `new` して渡す                      | 非公開。`RenderOptions` を `createTable` に直接渡す                 |
| `createTable(helper, fontCtx, hands, discards, scoreBoard)` | `createTable(table: TableInput, options?: RenderOptions)`           |
| 戻り値 `{ e, width, height }`                                | `SVGFragment = { element, width, height }`                          |
| 入力は風キー（`1z`〜`4z`）の連想配列                          | `Seats<T> = { front, right, opposite, left }`（席順）               |
| フォント寸法を利用側が指定（`fontCtx`）                       | 牌のスケールから内部で決定（指定不可）                              |

`SVG()` の戻り値（`RenderedSvg`）の `add` / `viewbox` / `svg()` は互換なので、そこは変更不要。

### 1-4. 役名の変更 2 件（DB との突き合わせが壊れる）

| 旧             | 新           |
| -------------- | ------------ |
| `ニ盃口`（カタカナのニ） | `二盃口`（漢数字の二） |
| `純全帯么九色`  | `純全帯么九`   |

m-converter は `src/constants.ts` の `YAKU_NAMES`（`yaku_name` テーブルに投入）と `PointCalculator` が返す `yaku.name` を `Map` で突き合わせ、見つからないと assert で落とす（`src/db-builder.ts:814`, `:879` — `yaku name not found ...`）。**この 2 役が出た局で変換が停止する。**

対応:

- `src/constants.ts` の `YAKU_NAMES` を新名称に更新 + `YAKU_NAMES.md` 再生成（`npm run print-yaku-names`）
- 既存 DB は `yaku_name` テーブルの該当 2 行を UPDATE（`name` は `onConflictDoUpdate` の target なので、旧名の行が残ると新名が別 ID で増える）

---

## 2. 挙動差（動くが出力が変わる）

### 2-1. `WinResult.yakus` の並び順が変わる

鳴きありの和了 1500 ケースで、点数・符・翻・`deltas`・`description` はすべて一致したが、**役の配列順が一部異なる**（例: 旧 `[發, 自風, 場風]` → 新 `[自風, 場風, 發]`、旧 `[中, 白]` → 新 `[白, 中]`）。ソートすれば完全一致する。

m-converter は `yakuArray` をループして行を INSERT するだけなので DB 上の影響はないが、JSON スナップショット（`__snapshots__/`）を役配列そのままで比較している箇所があれば差分になる。

### 2-2. 卓のドラ表示牌を全部描くようになった

旧実装は先頭 1 枚しか描いていなかったが、新実装は指定された枚数だけ描き、中央のボード幅もそれに追随する（README にも明記）。m-converter は `doraIndicators` に **表ドラ + 裏ドラを連結して**渡している（`src/mj.ts` の `get doraIndicators`）ため、`table-snapshots/*.svg` に裏ドラまで表示されるようになる。エラー時のデバッグ出力なので実害は小さいが、既存スナップショットとは差分が出る。

（実測: 同一入力で旧 69 枚 → 新 70 枚。viewBox・点数テキスト・局表示は完全一致。）

### 2-3. `ROUND_MAP` の表記ゆれ解消

旧は `東１局`（全角）と `西1局`/`北1局`（半角）が混在していたが、新はすべて全角に統一された。m-converter が使うのは東場・南場だけ（`tenhou6.ts:365`、スナップショットも東/南のみ）なので**影響なし**。

---

## 3. 互換が確認できた点（修正不要）

差分ハーネスによる実測結果:

| 検証                                                                                        | 結果                                              |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| ランダム 13 枚 300 手牌の `ShantenCalculator.calc / sevenPairs / thirteenOrphans / standardType` | 全一致                                            |
| 同 300 手牌の `Efficiency.getEffectiveTiles`（`shanten` と有効牌集合）                        | 全一致                                            |
| 門前和了 1500 ケースの `han / fu / points / pointsWithoutSticks / deltas / description / hand` | 全一致（`NOWIN` 判定も一致）                      |
| 鳴きあり和了 1500 ケース（同上）                                                              | 役の順序を除き全一致                              |
| 九蓮宝燈のブロック分解                                                                        | 旧新とも単一ブロックを返す（`getAgariType` の挙動は変わらない） |
| 赤牌（`r5m` / `0m`）の扱い、`Tile.toString()`                                                 | 一致                                              |

`Efficiency` は「static メソッドのクラス」から「名前空間」に変わったが、`Efficiency.getEffectiveTiles(hand)` という呼び方も `ReturnType<typeof Efficiency.getEffectiveTiles>` という型の取り方も従来どおり動く。

`Hand` / `River` / `IRiver` / `Counter` / `ScoreManager` / `PlaceManager` / `Parser` / `Tile` / `Block*` / `toDora` / `createWindMap` / `nextWind` / `ShantenCalculator` は、m-converter が使っている範囲で**シグネチャ・挙動とも互換**（型検査で確認）。

---

## 4. 移行手順

### 4-1. `src/mj.ts`

```ts
// getAgariResult: ronWind の擬似指定を winBy に置き換える
getAgariResult(baseCtx: BoardContext, lastTile: Tile) {
  const isRon = lastTile.has(OP.RON);
  const ctx: BoardContext = {
    ...baseCtx,
    winBy: isRon
      ? { type: "ron", from: nextWind(baseCtx.myWind) } // simulate using other wind
      : { type: "tsumo" },
  };
  ...
}
```

`getBoardParams` は `BoardContext` を返す型なので、`winBy` を引数に追加するか、戻り値の型を `Omit<BoardContext, "winBy">` にして呼び出し側で足す。後者のほうが変更が小さい（`winBy` は `agari` イベントを読んだ時点でしか決まらないため）。

### 4-2. `src/index.ts`

```ts
// 旧: boardCtx = { ...boardCtx, ronWind };
boardCtx = { ...boardCtx, winBy: { type: "ron", from: ronWind } };
// ツモの場合は winBy: { type: "tsumo" } を明示する

// 旧: const ronWind = boardCtx.ronWind;
const ronWind = boardCtx.winBy.type === "ron" ? boardCtx.winBy.from : undefined;

// 旧: getAgariType(ret.hand, ret.boardContext.ronWind == null)
getAgariType(ret.hand, ret.boardContext.winBy.type === "tsumo")

// 旧: ronTsumo: ret.boardContext.ronWind != null ? "ron" : "tsumo"
ronTsumo: ret.boardContext.winBy.type

// 旧: basePoints: ret.basePoints
basePoints: ret.pointsWithoutSticks
```

`src/util.test.ts:138` の `baseCtx` にも `winBy: { type: "tsumo" }` を足す。

### 4-3. `src/table-drawer.ts`（全面書き換え）

以下は**実際にローカル src に対して型検査・実行して動作を確認した**置き換え版。旧実装と同じ viewBox（`0 0 1009.8 1009.8`）・同じ点数表示を出力する。

```ts
import {
  IRiver,
  Wind,
  Hand,
  Round,
  Parser,
  ROUND_MAP,
  TableInput,
  Seats,
  createTable,
  SVG,
} from "@konoui/mjimage";

// 手前を東に固定した席割り（旧 board.front の既定値と同じ）
const toSeats = <T,>(f: (w: Wind) => T): Seats<T> => ({
  front: f("1z"),
  right: f("2z"),
  opposite: f("3z"),
  left: f("4z"),
});

type Params = {
  scores: { [w in Wind]: number };
  hands: { [w in Wind]: Hand };
  river: IRiver;
  round: Round;
  doraIndicators: readonly string[];
};

export function convertTableDrawInputs(params: Params): TableInput {
  const { scores, hands, river, round, doraIndicators } = params;
  return {
    discards: toSeats((w) =>
      new Parser(
        river
          .discards(w)
          .map((v) => v.t.toString())
          .join(""),
      ).tiles(),
    ),
    hands: toSeats((w) => new Parser(hands[w].toString()).parse()),
    scoreBoard: {
      round: ROUND_MAP[round],
      frontPlace: "1z",
      sticks: { reach: 0, dead: 0 },
      doraIndicators: new Parser(doraIndicators.join("")).tiles(),
      scores: toSeats((w) => scores[w]),
    },
  };
}

/** 卓の SVG 文字列を返す */
export function generateTableSVG(params: Params): string {
  const fragment = createTable(convertTableDrawInputs(params), {
    imageHostUrl: "https://static.konoui.dev/mjimage/svg/",
  });
  const draw = SVG();
  draw.add(fragment.element);
  draw.viewbox(0, 0, fragment.width, fragment.height);
  return draw.svg();
}
```

補足:

- 旧 `parseRawTableInput` が入れていた既定値（`sticks` など）は使えないので、`TableInput` を組む側が全項目を埋める必要がある。
- `TableInput` を自前で組む代わりに、YAML 文字列を組み立てて `render(yaml, options)` を呼ぶ経路もある（`.svg.svg()` で文字列が取れる）。上のコードと**バイト単位で同一の SVG** が出ることを確認済み。ただし YAML 側のキーは `dora_indicators`（スネークケース）で、値をクォートで囲むと解釈されない点に注意。

### 4-4. 役名まわり

- `src/constants.ts` の `YAKU_NAMES`: `ニ盃口` → `二盃口`、`純全帯么九色` → `純全帯么九`
- `YAKU_NAMES.md` を再生成
- 既存 `data/database.db` の `yaku_name` を UPDATE（作り直す場合は不要）

### 4-5. 依存の更新

現在の実装は未公開（package.json は `1.0.0`、npm 上は `0.12.1`）。`npm run build` は通り、`dist/index.js` / `index.cjs` / `index.d.ts` が生成されることは確認済み。公開後に m-converter 側で `"@konoui/mjimage": "^1.0.0"` に更新する。破壊的変更を含むのでメジャー更新は妥当。

---

## 5. mjimage 側で検討する余地（任意）

1. **卓入力のオブジェクト経路を公開するか**
   `parseRawTableInput` / `convertTableInput` / `Raw*Input` は実装としては残っているが `index.ts` で公開していない。m-converter のように「文字列ではなくオブジェクトから卓を描く」利用者は、`TableInput` を手で組むしかない。再公開すれば §4-3 の書き換えはほぼ不要になる。公開面を絞る方針（`index.ts` 冒頭のコメント）とのトレードオフ。

2. **`seatWinds` が非公開**
   `Seats` 型は公開しているのに、風 → 席の対応を作る `seatWinds(front)` は非公開なので、利用者は席割りを自前で書く必要がある（上のコードの `toSeats`）。`front` を東以外にしたい利用者が出ると、対応表を各自で持つことになる。

3. **`WINNING_TILE_BLOCK_TYPE` の活用を m-converter に勧められる**
   m-converter の `getAgariType`（`src/index.ts:323`）と `makeTenpaiType` は、新 API の `WinResult.metadata.winningTileBlockType` とほぼ同じものを自前で実装している。国士無双 13 面待ちや九蓮宝燈の扱いもライブラリ側のほうが整理されている（`nineGates` を返す）。ただし m-converter は `亜両面` / `ノベタン` / `複合形` という独自の分類も持つので、完全な置き換えにはならない。

4. **役名変更のリリースノート**
   `ニ盃口` → `二盃口` と `純全帯么九色` → `純全帯么九` は、役名を永続化している利用者にとってはデータ移行を伴う破壊的変更。CHANGELOG に明記しておくとよい。
