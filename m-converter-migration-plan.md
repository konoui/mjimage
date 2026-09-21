# m-converter を @konoui/mjimage 1.0.0 へ対応させる計画

対象リポジトリ: `/Users/tanaka/dev/src/github.com/konoui/m-league-score-sheet`（作業対象は `m-converter/`）
根拠: [m-converter.md](./m-converter.md)（2026-08-02 の互換性調査）
作成日: 2026-08-04

## 0. 前提の再確認（調査後に変わった点）

- **1.0.0 は npm に公開済み**（`latest` = 1.0.0、publish 2026-08-04）。調査レポート §4-5 の「未公開」は解消しており、`npm install @konoui/mjimage@^1.0.0` で入る。ローカル link / `npm pack` は不要。
- 公開された `dist/index.d.ts` を実際に確認し、レポートの前提が公開物にも当てはまることを確認済み:
  - `createTable: (table: TableInput, options?: RenderOptions) => SVGFragment`
  - `BoardContext.winBy: WinBy`（必須）
  - `ImageHelper` / `parseRawTableInput` / `convertTableInput` / `Raw*Input` は非公開
  - **`WinBy` 型自体は export されていない**（`declare type WinBy`）。m-converter 側で型注釈が要る場合は `BoardContext["winBy"]` で取る。
- m-converter が import しているシンボルはレポートの列挙と一致（差分なし）。壊れるのは `ImageHelper` / `parseRawTableInput` / `convertTableInput` / `Raw*Input` の 7 つと `ronWind` / `basePoints`。

## 1. 作業ステップ

### Step 1: 依存の更新

`m-converter/package.json`

```diff
-        "@konoui/mjimage": "^0.12.1",
+        "@konoui/mjimage": "^1.0.0",
```

`npm install` で `package-lock.json` も更新する。

### Step 2: `src/mj.ts` — `winBy` を持たない文脈型を導入

`getBoardParams` は打牌時点（あがり方が未確定）にも呼ばれるので、戻り値から `winBy` を外すのが最小変更。

```ts
/** あがり方が未確定の段階で組み立てる盤面情報 */
export type BaseBoardContext = Omit<BoardContext, "winBy">;
```

- `getBoardParams(...): BoardContext` → `: BaseBoardContext`（本体は変更なし）
- `ExHand.getAgariResult(baseCtx, lastTile)` を書き換える:

```ts
getAgariResult(baseCtx: BaseBoardContext, lastTile: Tile) {
  const isRon = lastTile.has(OP.RON);
  const ctx: BoardContext = {
    ...baseCtx,
    winBy: isRon
      ? { type: "ron", from: nextWind(baseCtx.myWind) } // simulate using other wind
      : { type: "tsumo" },
  };
  // 以降のキャッシュ処理は現状のまま
}
```

`nextWind` の擬似指定は従来どおり（テンパイ行列は「誰から出たか」に依存しない点数だけを使う）。

### Step 3: `src/index.ts` — 5 箇所

| 行（現状） | 変更 |
| --- | --- |
| 348 | `makeTenpaiMatrixInput(baseCtx: BoardContext, ...)` → `BaseBoardContext` |
| 366 | `basePoints: ret.basePoints` → `ret.pointsWithoutSticks`（DB 列名 `base_points` は据え置き） |
| 388 | `makeTenpaiStateInput(..., ctx?: BoardContext)` → `ctx?: BaseBoardContext` |
| 984-987 | `boardCtx = { ...boardCtx, ronWind }` → あがり時に `winBy` を確定させる |
| 1029 / 1035 / 1040 / 1055 | `boardCtx.ronWind` 参照を `winBy` 経由に置換 |

950 行目付近の組み立て（`boardCtx` は `BaseBoardContext`、あがり確定時に `BoardContext` へ昇格）:

```ts
const baseCtx = mjRecorder.getBoardParams(pID, { ... });
...
const winBy: BoardContext["winBy"] =
  ronTile != null ? { type: "ron", from: ronWind! } : { type: "tsumo" };
const boardCtx: BoardContext = { ...baseCtx, winBy };
```

その下流:

```ts
// 1029
const ronWind = boardCtx.winBy.type === "ron" ? boardCtx.winBy.from : undefined;
// 1033-1036
winningTileType: getAgariType(ret.hand, ret.boardContext.winBy.type === "tsumo"),
// 1040
basePoints: ret.pointsWithoutSticks,
// 1055
ronTsumo: ret.boardContext.winBy.type,   // "ron" | "tsumo" とそのまま一致
```

**注意（要検証）**: 1.0.0 の `PointCalculator` は `winBy` と手牌のあがり牌の印が食い違うと assert する。ロン経路の `lastTile = Tile.from(ronTile)` には `OP.RON` の印が付いていないが、`BlockCalculator` は「RON 印なし・TSUMO 印なし・`hand.drawn == null`」なら RON として印を付けるフォールバックを持つため、現状のままで整合するはず（`block-calculator.ts:351-355`）。**印を明示的に足す修正は入れない**（`winningTile` として DB に入れる文字列に `v` が混ざるため）。Step 6 の全シーズン dry-run で `win type mismatch` が出ないことを確認する。もし出た場合のみ、計算用に `lastTile.clone({ add: OP.RON })` を別変数で用意し、DB へ渡す文字列は印なしのものを使う。

### Step 4: `src/table-drawer.ts` — 全面書き換え

レポート §4-3 のコードをそのまま採用する（ローカル src に対して型検査・実行済みのもの）。要点:

- `parseRawTableInput` / `convertTableInput` / `ImageHelper` / `fontCtx` を捨て、`TableInput` を直接組む
- 風キー（`1z`〜`4z`）→ 席順（`Seats<T>`）の変換は `toSeats` ヘルパを自前で持つ（`seatWinds` は非公開、手前は東固定で従来と同じ）
- `createTable(table, { imageHostUrl: "https://static.konoui.dev/mjimage/svg/" })`
- 戻り値は `{ element, width, height }`（`table.e` → `fragment.element`）
- `sticks: { reach: 0, dead: 0 }` を明示（旧 `parseRawTableInput` の既定値が使えないため）

`convertTableDrawInputs` は export のままにするが、戻り値の型が `TableInput` に変わる。呼び出しは `table-drawer.ts` 内のみなので影響は閉じる。

### Step 5: 役名 2 件と DB マイグレーション

1. `src/constants.ts`:
   - `純全帯么九色` → `純全帯么九`（L262）
   - `ニ盃口`（カタカナ） → `二盃口`（漢数字）(L263)
2. `npm run print-yaku-names` で `YAKU_NAMES.md` を再生成
3. **既存 DB の移行が必須**。`yaku_name.name` が `onConflictDoUpdate` の target なので、旧名の行を残したまま `init` すると新名が別 ID で増え、既存の `agari_yaku` / `tenpai_yaku` が旧 ID を指したまま二重化する。

4. **CI（`.github/workflows/release-game-db.yaml`）への追記は不要**。今回のリリースは手動で行い、その際に DB を作り直すことで移行を済ませる。作り直した DB には旧名が存在しないため、以降の増分実行（`download previous db` → `append new games`）でも二重化は起きない。
   - 手順: `release-game-db` を `workflow_dispatch` で **`recreate-db: true`** にして 1 回流す（またはローカルで全シーズン再構築して手動でリリースする）。役配列の順序差（§2-1）や他の細かい差分も同時に均せる。所要時間だけがコスト。
   - 増分経路のまま移行したくなった場合の代替として、`run-init` の前に一度だけ次を流せばよい（冪等）。恒久的な CI ステップにはしない。

```sql
UPDATE yaku_name SET name = '二盃口'   WHERE name = 'ニ盃口';
UPDATE yaku_name SET name = '純全帯么九' WHERE name = '純全帯么九色';
```

### Step 6: `src/util.test.ts`

L138 の `baseCtx` に `winBy: { type: "tsumo" }` を足す（このテストは全ケース `OP.TSUMO` であがらせている）。

## 2. 検証手順

型検査 → 単体テスト → dry-run（広く） → 実 DB 1 シーズン、の順。

1. **型検査**: m-converter に `typescript` が devDependency として入っておらず `node_modules/.bin/tsc` が無い。`npx -y typescript@5 tsc --noEmit -p tsconfig.json` で回すか、この機に `typescript` を devDependencies に追加して `"typecheck": "tsc --noEmit"` を script 化する（後者を推奨。今回の移行で型エラーが唯一の網羅的な検出手段になるため）。目標は 17 件 → 0 件。
2. **単体テスト**: `npm test`。`sql.test.ts` はローカルの `data/database.db` を読むので、役名 UPDATE 前後で落ちないことも見る。
3. **dry-run（本命）**: `DummyRepository` は全メソッド no-op で、`PointCalculator` / `winBy` の assert / `getAgariType` / 卓 SVG 生成まで通したうえで DB 書き込みだけを飛ばす。
   ```sh
   npm run dry-run -- --season-year 2025   # まず 1 シーズン
   npm run dry-run                          # 全シーズン（オプション無しで全年）
   ```
   - **オプション名の注意**: 依頼にあった `--start-season-year` は `convert` コマンドには存在しない（`--season-year` が正）。`startSeasonYear` は DB ビュー側の列名。必要なら別途 `--start-season-year`（この年以降を処理）を追加することもできるが、今回の移行スコープ外とする。
   - 見るもの: `win type mismatch` / `yaku name not found` / `cannot win` の非発生、`counter-error-result.json` が空のまま、`Elapsed time` が従来と大きく変わらないこと。
4. **役名は dry-run では検出できない**。`yakuNames` の Map 突き合わせは `Repository`（実 DB 側）にしかないため、`DummyRepository` では素通りする。スクラッチ DB に対して実経路を 1 回通す:
   ```sh
   cp data/database.db /tmp/backup-database.db     # 既存 DB の退避
   rm -f data/* && npm run migrate && npm run run-init
   npm run run -- --season-year 2025
   npm test
   ```
   二盃口・純全帯么九は出現頻度が低いので、1 シーズンで踏まない可能性がある。確実に見るなら、変換後に `SELECT name, count(*) FROM yaku_name JOIN agari_yaku ... GROUP BY name` で該当 2 役の行が新名で入っていることを確認するか、全シーズン再構築で確かめる。
5. **卓描画の確認**: `generateTableSVG` は「counter エラーが出た局」でしか呼ばれない（現状 `counter-error-result.json` は空 = 一度も呼ばれない）。書き換えが動くことを保証するため、`src/table-drawer.test.ts` を新規に足す:
   - `River` に数枚 discard させ、`new Hand("...")` 4 家分と適当な `round` / `doraIndicators` で `generateTableSVG` を呼ぶ
   - `viewBox` が期待値であること、`<image>`（牌）の枚数が期待値であること程度の assert に留める（バイト単位の完全一致は保守コストが高い）
   - `table-snapshots/` は `.gitignore` 済みなので既存成果物との差分は問題にならない

## 3. 想定される差分・リスク

| 項目 | 影響 | 対応 |
| --- | --- | --- |
| ロン牌の印と `winBy` の整合 | assert で変換停止 | Step 3 の注意書き。全シーズン dry-run で確認 |
| 役名 2 件 | 既存 DB の二重化 | Step 5。手動リリース時に `recreate-db: true` で 1 回作り直す（CI 変更なし） |
| `yakus` の並び順が変わる（§2-1） | DB は行 INSERT のみなので影響なし。`__snapshots__/`（tenhou6 JSON）にも役配列は入らない（`setAgari` は fu / han / ronTsumo のみ） | 対応不要 |
| 卓のドラ表示牌が全部描かれる（§2-2） | `table-snapshots/` は gitignore、デバッグ用途 | 対応不要（裏ドラまで見えるのはむしろ有用） |
| `ROUND_MAP` の全角統一（§2-3） | 東場・南場のみ使用のため影響なし | 対応不要 |
| 数値計算（点数・符・翻・シャンテン・有効牌） | 差分ハーネスで全一致を確認済み | 対応不要 |

## 4. コミットの分け方（提案）

1. `chore: bump @konoui/mjimage to 1.0.0`（package.json / package-lock.json / typescript devDep + typecheck script）
2. `refactor: replace BoardContext.ronWind with winBy`（mj.ts / index.ts / util.test.ts）
3. `refactor: rewrite table-drawer for new createTable API`（table-drawer.ts + テスト追加）
4. `fix: update yaku names to match mjimage 1.0.0`（constants.ts / YAKU_NAMES.md）

1〜3 は独立に型検査が通らないので、実務上は 1+2+3 をまとめて 1 コミットにしてもよい。4 は DB 移行（= 手動リリースでの作り直し）を伴うので必ず分ける。

## 5. スコープ外（レポート §5 の mjimage 側検討事項）

`parseRawTableInput` の再公開、`seatWinds` の公開、`WINNING_TILE_BLOCK_TYPE` への置き換えは、いずれも mjimage 側の判断が要る。今回は m-converter 側だけで完結させ、必要なら別途検討する。
