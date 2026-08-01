# mjimage controller リファクタリング調査レポート

対象: `src/lib/controller/`（`refactor-report.md` が対象外にしていた範囲）
現状: `npx tsc --noEmit` エラーなし / `npm test` 277 passed + 7 expected fail（2026-07-29 時点）
観点: 責務分割・重複コード・型の使い方・正しさ・テスト容易性
方針: 公開 API は `src/index.ts` で選別済み（`refactor-report.md` H1）。controller 内部の大半は
公開面に出ていないため、semver の制約なく組み替えられる。

```
src/lib/controller/
  controller.ts        1117 行  Controller / ActionLogic / ActorHand / BaseActor / Observer
  state-machine.ts      904 行  xstate のマシン定義 + 全アクション
  events.ts             310 行  イベント型 + 優先順位判定 + EventHandler
  player-efficiency.ts  178 行  PlayerEfficiency / RiskRank
  managers.ts           169 行  ScoreManager / PlaceManager / Counter / shuffle
  wall.ts               139 行  Wall / IWall
  player.ts              78 行  Player
  river.ts               56 行  River / IRiver
  game.ts                50 行  createLocalGame
  replay.ts              27 行  Replayer
  index.ts               11 行  barrel
```

公開されているのは `Controller` / `ActorHand` / `BaseActor` / `Observer` / `Player` /
`Replayer` / `Wall` / `River` / `ScoreManager` / `PlaceManager` / `Counter` /
`PlayerEfficiency` / `RiskRank` / `createLocalGame` / イベント型（`src/index.ts:81-125`）。
`ActionLogic` / `createControllerMachine` / `prioritizeDiscardedEvents` などは公開面に無い。

---

## サマリ

| # | 優先度 | 観点 | 箇所 | 概要 | 確認 |
|---|---|---|---|---|---|
| C1 | 高 | 正しさ | `river.ts:52` / `controller.ts:900` | `River.reset()` が一度も呼ばれず、河が局をまたいで残る | 実験で確認 |
| C2 | 高 | 正しさ | `controller.ts:62-78` | `getCallBlockIndex` が方角の差を `Math.abs` で見るため、東家以外の 4 組で鳴き牌の位置が誤る | 実験で確認 |
| C3 | 高 | 正しさ | `state-machine.ts:256` | `disable_none_shot` は綴り誤りで未実装。xstate は黙って無視するのでポンで一発が消えない | 実験で確認 |
| C4 | 高 | 責務分割 | `controller.ts` | 1117 行に 5 つのクラス。`Controller` 自身も 4 責務 | 読み |
| C5 | 高 | 正しさ | `state-machine.ts:156,727-744` | 小明槓・大明槓で新ドラがめくられない（既存 FIXME） | 読み |
| C6 | 高 | 信頼境界 | `state-machine.ts:872-878` / `controller.ts:429-441` | `canWin` が常に true。点数はプレイヤー申告の `boardContext` を信頼する | 読み |
| C7 | 中 | 死んだコード | `controller.ts:454-477` | `doWin` の `cloned` は組み立てて捨てるだけ。ロン判定も二重 | 読み |
| C8 | 中 | 責務分割 | `controller.ts:179-369` | `pollReplies` が 190 行 5 分岐 | 読み |
| C9 | 中 | 正しさ | `state-machine.ts:568` | チャンカンのフリテン判定が `missingMap[event.iam]`（`[w]` の誤り） | 読み |
| C10 | 中 | 正しさ | `player-efficiency.ts:74,100,113,119` | `selectMinPriority` は常に先頭を返す。`calcPriority` に式文と二重加算 | 実験で確認 |
| C11 | 中 | 正しさ | `replay.ts:15-17` | `Replayer.prev` の `assert` が反転 | 読み |
| C12 | 中 | 正しさ | `wall.ts:53` | `draw` のガードが配列オブジェクトを見ている | 実験で確認 |
| C13 | 中 | 正しさ | `events.ts:251-267` | 空配列の選択肢が truthy 判定で「選べる」になる | 実験で確認 |
| C14 | 中 | 型の使い方 | `events.ts:98` / `state-machine.ts:646-653` | `DrawEvent.subtype` と実装の `subType` が食い違う。イベント生成に型注釈が無い | 読み |
| C15 | 中 | 重複コード | `state-machine.ts` 12 箇所 | 「4 家にブロードキャスト」の定型 | 読み |
| C16 | 中 | 重複コード | `state-machine.ts:469-552` | `notify_choice_after_discarded` と `notify_choice_for_reach_acceptance` がほぼ同一 | 読み |
| C17 | 中 | 重複コード | `controller.ts:920-978` | `BaseActor` の DISCARD と REACH が同一処理 | 読み |
| C18 | 中 | 型の使い方 | `state-machine.ts` 全般 | `assign` を使わず context を直接ミューテート | 読み |
| C19 | 中 | 型の使い方 | `controller.ts:165` | `emit` の `(e as any).iam` | 読み |
| C20 | 中 | 型の使い方 | `controller.ts:527` ほか | static のみのクラス 3 つ（`refactor-report.md` M27 と同型） | 読み |
| C21 | 中 | 型の使い方 | `managers.ts:19,56,97` | getter が内部の可変オブジェクトを `readonly` 型で返す | 読み |
| C22 | 中 | 責務分割 | `controller.ts:415-428` | `startGame` の局リセットがインライン（既存 TODO）。終局条件がハードコード | 読み |
| C23 | 中 | テスト容易性 | `controller.ts:97` | `Controller` のフィールド初期化子で `this` が漏れる | 読み |
| C24 | 中 | 効率 | `controller.ts:858-862` | `ActorHand.clone()` の文字列往復（`refactor-report.md` M18 の controller 側） | 読み |
| L1〜L10 | 低 | 各種 | （後述） | 命名の不一致、死んだフィールド、マジックナンバー、`console.debug` 直書き | 読み |

---

## 高

### C1. `River` が局をまたいでリセットされない

**箇所**: `river.ts:52-55`（`reset()`）、`controller.ts:900-919`（`DISTRIBUTE` ハンドラ）、`controller.ts:415-428`（`startGame`）

`IRiver.reset()` は定義されているが、`src/` 全体で呼び出しがゼロ。

```
$ grep -rn "\.reset()" src/
src/lib/controller/controller.ts:902:        this.counter.reset();   ← Counter だけ
```

`BaseActor.handleEvent` の `DISTRIBUTE` は `counter` / `hands` / `placeManager` /
`scoreManager` / `_doraIndicators` を作り直すが、`river` には触れない。`startGame`
（`controller.ts:420-424`）も `wall` / `applied` / `mailBox` / `actor` だけを作り直す。
`BaseActor.river` と `Player.river` はフィールド初期化子の `new River()` が唯一の代入。

**確認**: 1 局回したあとに `startGame` と同じリセットを行っても、河に 27 件の捨て牌が残る。

**影響**（いずれも 2 局目以降）:

- フリテン: `ActionLogic.doWin`（`controller.ts:546-548`）が `river.discards(w)` と有効牌を突き合わせるため、1 局目の捨て牌で永続的にフリテンになる
- ダブル立直: `Controller.doWin`（`controller.ts:474-476`）の `discarded.length == 0` が成立しない
- 四風連打: `River.isFourWindsAbort`（`river.ts:46`）の `this.all.length != 4` が成立しない
- 九種九牌: `canDeclareNineTerminalsAbort`（`controller.ts:510`）の `discards(w).length != 0` で常に false

**修正方針**: `DISTRIBUTE` ハンドラで `this.river.reset()` を呼ぶ。局の初期化はすべて
`DISTRIBUTE` に寄せ、`startGame` 側の手作業（C22）と二重に持たない。

### C2. `getCallBlockIndex` が鳴いた方角を絶対値で判定する

**箇所**: `controller.ts:62-78`

```ts
const distance = Math.abs(Number(caller[0]) - Number(discardedBy[0]));
```

風は `"1z"`〜`"4z"` なので先頭の数字が席順になるが、絶対値を取ると上家（−1）と
下家（+1）が区別できない。正しくは `(discardedBy - caller + 4) % 4` で
1 = 下家 / 2 = 対面 / 3 = 上家。

**確認**: 全 12 組を列挙したところ 4 組が誤り。

| 鳴いた人 | 捨てた人 | 関係 | 現状 | 正しい位置 |
|---|---|---|---|---|
| 2z | 1z | 上家 | `33-3m` | `-333m` |
| 3z | 2z | 上家 | `33-3m` | `-333m` |
| 4z | 3z | 上家 | `33-3m` | `-333m` |
| 4z | 1z | 下家 | `-333m` | `33-3m` |

大明槓も同じ形で誤る（例: 4z が 1z から `-3333m`、正しくは `333-3m`）。
既存の `controller.test.ts` の `can-pon` / `can-dai-kan` は鳴く人を `"1z"` に固定しており、
東家は 3 方向とも偶然一致するため検出できていなかった。

**影響**: 牌姿の描画のみ（鳴き牌の横向き位置）。役・符・点数には影響しない。

**修正方針**: 文字列の先頭 1 文字を数値として読むのをやめ、`core/wind-util.ts` の
`nextWind` / `prevWind` で関係を判定する。

```ts
const relation = (caller: Wind, discardedBy: Wind) =>
  discardedBy == nextWind(caller) ? "shimocha"
  : discardedBy == prevWind(caller) ? "kamicha"
  : "toimen";
```

### C3. `disable_none_shot` の綴り誤りでポンが一発を消さない

**箇所**: `state-machine.ts:256`（`poned` の entry）

```ts
poned: { entry: [{ type: "notify_call" }, { type: "disable_none_shot" }] },
chied: { entry: [{ type: "notify_call" }, { type: "disable_one_shot" }] },
```

実装されているのは `disable_one_shot` / `disable_one_shot_for_me` の 2 つだけで
（`state-machine.ts:745-750`）、`disable_none_shot` はどこにも無い。

**確認**: xstate v5 は未実装のアクション名を例外にせず、黙って無視する
（最小のマシンで再現）。

**影響**: 立直の一発中に誰かがポンで割り込んでも `oneShotMap` が下りず、
立直者に一発が付く。チー・大明槓・暗槓/加槓（`chied` / `dai_kaned` / `an_sho_kaned`）は
正しく `disable_one_shot` を参照しているのでポンだけの問題。

**修正方針**: 綴りを直す。加えて、アクション名が文字列である以上この種の誤りは
再発するので、`setup({ actions: {...} })` を使ってアクション名に型を付けるか、
参照されている名前がすべて実装されていることを検査するテストを持つ
（後者は追加済み。「回帰テスト」の節を参照）。

### C4. `controller.ts` が 1117 行で 5 つのクラスを持つ

**箇所**: `controller.ts`

| 行 | もの | 責務 |
|---|---|---|
| 62-78 | `getCallBlockIndex` | 鳴き牌の位置 |
| 94-525 | `Controller` | 進行・イベント配送・メールボックス・履歴・行動可否の入口 |
| 527-811 | `ActionLogic` | 鳴き/立直/和了の可否判定（static のみ） |
| 813-847 | `getRedPatterns` / `getForbiddenDiscardTiles` | 赤牌・喰い替え |
| 849-869 | `ActorHand` | 裏牌を扱う `Hand` |
| 871-1026 | `BaseActor` | イベント適用（盤面の再現） |
| 1028-1117 | `Observer` | `BaseActor` + ログ |

`Controller` 自身も 4 つを兼ねる。

1. 状態機械の駆動（`actor` / `next` / `start` / `startGame`）
2. イベントの配送と重複排除（`emit` / `enqueue` / `pollReplies`）
3. 履歴（`histories` / `export` / `load`）
4. 行動可否の委譲（`doWin` / `doPon` / … の 8 メソッド）

**修正方針**: `refactor-report.md` H2（`calc.ts` の分割）と同じ手順で、まずファイルを割る。
`calculator/index.ts` と同様 `controller/index.ts` が barrel なので import 元は変わらない。

```
controller/
  controller.ts     Controller（進行のみ）
  mailbox.ts        enqueue / pollReplies（イベント種別ごとに分解 → C8）
  history.ts        RoundHistory / export / load
  actions.ts        ActionLogic を関数に（→ C20）+ getRedPatterns / getForbiddenDiscardTiles
  call-index.ts     getCallBlockIndex（→ C2）
  actor.ts          ActorHand / BaseActor / Observer
```

### C5. 小明槓・大明槓で新ドラがめくられない

**箇所**: `state-machine.ts:727-744`（`notify_new_dora_if_needed`）、`:156`（既存 FIXME）

```ts
notify_new_dora_if_needed: ({ context, event }) => {
  if (event.type == "AN_KAN") { /* めくる */ }
  if (event.type == "SHO_KAN") {
    // nothing because handling by discarded
  }
},
```

「discarded 側で処理する」とあるが、`discarded` 状態の entry は
`notify_discard` だけで、そこに `// FIXME add notify_new_dora_if_needed` が付いたまま
（`state-machine.ts:153-157`）。大明槓（`dai_kaned`）はそもそも
`notify_new_dora_if_needed` を entry に持たない（`state-machine.ts:320-327`）。

**影響**: 暗槓以外のカンでカンドラが増えない。裏ドラ（`hiddenDoraIndicators`）は
`Wall.openDoraIndicator` の `openedDoraCount` に連動しているので、表裏ともに増えない。

**修正方針**: 新ドラをめくる契機を「カンの成立」ではなく「カンした人が打牌したあと」
（大明槓・小明槓）と「カンの直後」（暗槓）に分け、`discarded` からも呼べるよう
どのカンだったかを context に持たせる。`an_sho_kaned` の FIXME
（`state-machine.ts:330-332`、`NEXT` ではカンの文脈が失われる）と同根なので同時に扱う。

### C6. 和了の検証がプレイヤー申告を信頼している

**箇所**: `state-machine.ts:872-878`（`guards.canWin`）、`controller.ts:429-441`（`finalResult`）

```ts
canWin: ({ event }, _params) => {
  if (event.type == "TSUMO" || event.type == "RON") {
    return true; // TODO
  }
  ...
```

`pollReplies` はプレイヤーが返した `e.choices.RON` をそのまま
`deserializeWinResult` に通し（`controller.ts:213`）、`canWin` は無条件に通す。
最終的な点数は `finalResult` が計算し直すが、その入力は

```ts
new PointCalculator(hand, {
  ...ret.boardContext,      // ← プレイヤー由来
  sticks, hiddenDoraIndicators,
}).calc(ret.hand);          // ← プレイヤー由来のブロック分解
```

で、盤面コンテキストと面子の分解の両方がプレイヤー由来。`Player` を差し替えられる
設計（`game.ts:8-13` の `playerInjection`）である以上、これは信頼境界の穴になる。

**影響**: ローカル対戦のみの現状では実害が無い。ネットワーク越しに `Player` を
置く構成にすると成立しなくなる。

**修正方針**: `canWin` で controller 側の `doWin` を呼び直して検算する
（`canChi` / `canPon` / `canReach` は既にこの形）。`finalResult` も
`ret.boardContext` ではなく controller が持つ盤面から組み立てる。
プレイヤーから受け取るのは「どの選択肢を選んだか」だけにする。

---

## 中

### C7. `doWin` に死んだコードがあり、ロン判定が二重

**箇所**: `controller.ts:442-478`

```ts
let cloned = hand;
...
if (isRon) {
  ...
  cloned = cloned.clone();
  env.ronWind = params.discardedBy;
  ...
  cloned.inc([t]);          // ← cloned はこの後どこにも渡らない
}
...
return ActionLogic.doWin(hand, env, t, discarded);   // ← 渡すのは hand
```

`cloned` の複製と `inc` は結果に一切使われない。同じ処理を
`ActionLogic.doWin`（`controller.ts:536-537`）が改めて行っている。

さらにロンかどうかの判定基準が 2 か所で違う。

| 箇所 | 基準 |
|---|---|
| `Controller.doWin:456` | `hand.drawn == null` |
| `ActionLogic.doWin:534` | `env.ronWind != null` |

`env.ronWind` は `params.discardedBy` を代入しているだけなので、
`discardedBy` を渡さずに呼ぶと前者はロン・後者はツモと判断し、
`inc` されないまま `BlockCalculator` に渡る。

**修正方針**: `cloned` の 3 行を削除する。ロンかどうかは呼び出し側が
1 つの値として渡し（`win: { type: "ron"; from: Wind } | { type: "tsumo" }`）、
両者が同じものを見るようにする。

### C8. `pollReplies` が 190 行 5 分岐

**箇所**: `controller.ts:179-369`

`sample.type` による 5 分岐（`CHOICE_AFTER_DISCARDED` / `CHOICE_AFTER_DRAWN` /
`CHOICE_AFTER_CALLED` / `CHOICE_FOR_REACH_ACCEPTANCE` / `CHOICE_FOR_CHAN_KAN`）の中で、
さらに選択肢ごとの `switch` が入る。`case` 節が波括弧なしで `const` を宣言している箇所
（`:229` `const c`、`:262` `const candidates`、`:271` `const tiles`）と、
波括弧付きの箇所（`:279` `AN_KAN`、`:289` `SHO_KAN`）が混在している。

先頭に `// TODO event instead of eventID to validate choice here` が付いている
（`controller.ts:178`）とおり、イベント ID しか受け取らないため、返ってきた選択が
その時点で妥当かを検証できない。

**修正方針**: イベント種別ごとにハンドラを分け、`mailBox` の型を
イベント ID → 特定イベントの配列に絞る（`controller.ts:100` の既存 TODO と同じ話）。

```ts
type Replies = {
  CHOICE_AFTER_DISCARDED: ChoiceAfterDiscardedEvent[];
  CHOICE_AFTER_DRAWN: ChoiceAfterDrawnEvent[];
  ...
};
```

### C9. チャンカンのフリテン判定が別人のフラグを見る

**箇所**: `state-machine.ts:561-569`

```ts
for (const w of Object.values(WIND)) {
  const ron = context.controller.doWin(w, ..., {
    discardedBy: event.iam,
    ...
    missingRon: context.missingMap[event.iam],   // ← w のはず
  });
```

同じ形の `notify_choice_after_discarded`（`state-machine.ts:487`）と
`notify_choice_for_reach_acceptance`（`:544`）はどちらも `context.missingMap[w]` を渡す。
ここだけカンをした人のフラグを全員に適用している。

**影響**: フリテンの人がチャンカンでロンできてしまう。逆に、カンした人がフリテンだと
他家全員がチャンカンを見送らされる。

**修正方針**: `context.missingMap[w]` にする。C16 で 3 つの通知を共通化すれば
この種の写し間違いは構造的に起きなくなる。

### C10. `PlayerEfficiency` の優先度計算

**箇所**: `player-efficiency.ts:68-122`

3 つ問題がある。

```ts
static selectMinPriority(c, playerAnalyses, doras) {
  let min = 0;                       // ← (1)
  let idx = 0;
  for (let i = 0; i < playerAnalyses.length; i++) {
    const p = PlayerEfficiency.calcPriority(c, playerAnalyses[i], doras);
    if (p < min) { min = p; idx = i; }
  }
  return playerAnalyses[idx];
}
```

**(1)** `calcPriority` は非負の値しか返さないので `p < 0` は成立せず、
`idx` は 0 のまま。常に先頭の候補が返る。`min` の初期値は
`Number.POSITIVE_INFINITY` であるべき（同じファイルの `RiskRank.selectTile:134`
は正しくそうしている）。**確認**: 優先度 8 の `5z` と 4 の `1z` をこの順で渡すと `5z` が返る。

**(2)** `player-efficiency.ts:100` と `:113` に同じ行がある。

```ts
v += same * weight(tile, doras);   // :100
...
v += same * weight(tile, doras);   // :113  同じ牌の枚数を 2 回足している
```

**(3)** `player-efficiency.ts:119`

```ts
if (tile.n == 0) v * 2;   // 式文。結果が捨てられる
```

`refactor-report.md` M5（`if (...) [];`）と同型。赤牌の重み付けが効いていない。
なお `weight`（`:33-38`）が既にドラ 2 倍を見ているので、この行が何を意図していたかは
確定させる必要がある。

**修正方針**: (1) を直すと打牌選択が変わるため、`Player` の挙動を固定するテストを
先に置いてから触る。(2)(3) は意図を決めてから。いずれも対局の勝敗にしか影響せず、
ルール上の正しさには関わらない。

### C11. `Replayer.prev` の assert が反転している

**箇所**: `replay.ts:14-17`

```ts
prev() {
  this.index--;
  assert(this.index < 0);   // index が 0 以上のとき（正常時）に落ちる
}
```

`next()`（`:10-13`）は `assert(this.index < this.histories.length)` を
インクリメント前に置いており、こちらは範囲の検査として意味を成す。
`prev()` は条件が逆で、正常に戻れるときだけ例外になる。

**修正方針**: `assert(this.index >= 0)` にする。`prev()` は `src/` 内で呼び出し
ゼロなので、削除も選択肢。

### C12. `Wall.draw` のガードが配列オブジェクトを見ている

**箇所**: `wall.ts:52-55`

```ts
draw() {
  if (!this.walls.drawable) throw new Error("cannot draw any more");
  return Tile.from(this.walls.drawable.pop()!);
}
```

`drawable` は配列なので常に truthy。空でも例外にならず、`pop()` の `undefined` が
`Tile.from` に渡る。**確認**: 122 枚引いた次の `draw()` は
`Cannot read properties of undefined (reading 'replace')` になる。

同じファイルの `canKan`（`:73`）と `canDraw`（`:76`）は `.length > 0` で正しく書けている。

**修正方針**: `if (this.walls.drawable.length == 0)` にする。もしくは `canDraw` を使う。

### C13. 空配列の選択肢が「選べる」と判定される

**箇所**: `events.ts:251-267`（`hasChoices` / `calculatePriority`）

```ts
return order.some((v) => !!choice[v]);
```

JS では `[]` は truthy なので、候補 0 件の `REACH` / `PON` / `CHI` / `AN_KAN` /
`SHO_KAN` が「選べる」と判定される。**確認**: `{ REACH: [], DISCARD: ["1m"] }` を
`prioritizeDrawnEvents` に渡すと `DISCARD` ではなく `REACH` が選ばれる。

その後 `pollReplies` は `assert(candidates, ...)` を通してしまい
（`controller.ts:263`、`[]` は truthy）、`candidates[0].tile` で
`undefined` を参照して落ちる。

`Controller` 自身は空配列を作らない（`doReach` などは候補が無ければ `false` を返す）が、
`Player` は選択肢を絞り込めるので現実的に起きる。実際
`controller.test.ts:32` は `e.choices.REACH.filter(...)` の結果をそのまま戻しており、
フィルタに一致する牌が無ければ `[]` になる。

**修正方針**: 判定を `Array.isArray(v) ? v.length > 0 : !!v` にする。
あるいは「選ばない」を `false` ではなく `undefined`/欠落で表し、
空配列を型として作れないようにする。

### C14. `DrawEvent.subtype` と実装の `subType` が食い違う

**箇所**: `events.ts:95-102`、`state-machine.ts:629-657`

```ts
// events.ts:98
export interface DrawEvent { ...; subtype?: "kan"; ... }

// state-machine.ts:646-653
const e = {                    // ← 型注釈なし
  id, type: "DRAW" as const,
  subType: action,             // ← 大文字 T。しかも型は string
  iam, wind, tile: t.toString(),
};
```

`e` に `DrawEvent` の注釈が無いため TS が検出しない。同じく `notify_call`
（`state-machine.ts:601-607`）も注釈が無い。`EndEvent` の `subType`（`events.ts:47`）は
大文字 T なので、命名も揃っていない。

**影響**: `DrawEvent.subtype` を読む消費者は常に `undefined` を得る。現状読んでいる
コードは無いので実害は出ていない。

**修正方針**: `events.ts` 側を `subType?: "kan"` に統一し、
イベントを組み立てる全箇所に型注釈を付ける（`notify_distribution` などは既に
`const e: DistributeEvent` と書けているので、それに揃える）。
`notify_draw` の `action` も `params as { action: string }`（C 低 L7）をやめて
`"kan" | undefined` にする。

### C15. 「4 家にブロードキャスト」の定型が 12 箇所

**箇所**: `state-machine.ts` の `notify_*` 全般

```ts
const id = context.genEventID();
for (const w of Object.values(WIND)) {
  const e: XxxEvent = { id, type: "XXX", wind: w, ...固有 };
  context.controller.emit(e);
}
context.controller.next();
```

`notify_distribution` / `notify_choice_after_discarded` /
`notify_choice_for_reach_acceptance` / `notify_choice_for_chankan` / `notify_call` /
`notify_discard` / `notify_draw` / `notify_ron` / `notify_tsumo` / `notify_reach` /
`notify_reach_accepted` / `notify_new_dora_if_needed` と、`notify_end` の中の 4 分岐。

**修正方針**: 定型を関数にする。

```ts
const broadcast = <E extends PlayerEvent>(c: Controller, make: (w: Wind) => E) => {
  for (const w of Object.values(WIND)) c.emit(make(w));
};
```

### C16. リーチ後の受けと通常の捨て牌の受けがほぼ同一

**箇所**: `state-machine.ts:469-507`（`notify_choice_after_discarded`）と
`:529-552`（`notify_choice_for_reach_acceptance`）

どちらも「直前の捨て牌を横向きにして 4 家に `doWin` を配る」で、後者は
`PON` / `CHI` / `DAI_KAN` を配らない点だけが違う。前者にはある
`if (e.choices.RON) context.missingMap[w] = true;`（`:501`）が後者には無く、
リーチ宣言牌を見逃した場合にフリテンにならない差も生まれている。

**修正方針**: 「捨て牌に対する選択肢を配る」を 1 つの関数にし、
配る選択肢の集合を引数にする。C9 のフリテン判定もここに一本化される。

### C17. `BaseActor` の DISCARD と REACH が同一処理

**箇所**: `controller.ts:926-937`（`DISCARD`）と `:963-977`（`REACH`）

```ts
const t = Tile.from(e.tile);
this.river.discard(t, e.iam);
this.hands[e.iam].discard(t);
if (e.iam != e.wind) {
  this.counter.dec(t);
  this.counter.addTileToSafeMap(t, e.iam);
  for (const w of Object.values(WIND))
    if (this.hand(w).reached) this.counter.addTileToSafeMap(t, w);
}
```

`REACH` は先頭に `this.hands[e.iam].reach();` が付くだけで、残り 11 行が同じ
（コメントも「DISCARD イベントと同じ」と書いてある）。

`BaseActor.handleEvent` 自体も 130 行の switch で、`case "DISTRIBUTE"` と
`case "REACH_ACCEPTED"` は波括弧なしで `const` を宣言している
（`controller.ts:904`、`:981`）。

**修正方針**: 捨て牌の適用を `applyDiscard(t, iam, wind)` に抜き、
`REACH` は `reach()` + `applyDiscard(...)` にする。イベント種別ごとの
ハンドラをテーブルに載せれば switch 自体も畳める。

### C18. xstate の context を `assign` を使わず直接書き換える

**箇所**: `state-machine.ts:413-415`（`updateNextWind`）、`:599`（`notify_call`）、
`:501`・`:583`（`missingMap`）、`:698`（`oneShotMap`）、`:642`（`missingMap`）、
`:746`・`:749`（`oneShotMap`）

```ts
updateNextWind: ({ context }) => {
  const cur = context.currentWind;
  context.currentWind = nextWind(cur);   // assign を経由しない
},
```

xstate v5 では context の更新は `assign` を通すのが前提で、直接のミューテーションは
スナップショットの永続化・復元や devtools と噛み合わない。`Controller.load` で
局を再開する設計（`controller.ts:373-393`）を持つ以上、いずれ効いてくる。

**修正方針**: `assign` に寄せる。`currentWind` / `oneShotMap` / `missingMap` は
状態機械が持つべき値なのでこれで足りるが、`controller` への参照
（`ControllerContext.controller`）は context に置いたままだと直列化できない。
アクションから controller を触る経路を入力（`input`）か外部の
`actors` に移すかは、C6 と併せて決める。

### C19. `emit` の `(e as any).iam`

**箇所**: `controller.ts:160-173`

```ts
const iam = (e as any).iam;
if (e.wind == iam) this.observer.eventHandler.emit(e);
else if (iam == null) { ... }
```

`PlayerEvent` のうち `iam` を持つのは一部だけなので `any` で逃げている。
重複排除の条件（`this.observer.applied[e.id]` と `e.type == "DISTRIBUTE"` の特例）も
ここに埋まっており、意図が読み取りにくい。

**修正方針**: `"iam" in e` で絞る（TS の絞り込みが効く）。
重複排除は「1 イベント ID につき observer へは 1 回」という規則を関数名に出す。

### C20. static メソッドのみのクラスが 3 つ

**箇所**: `controller.ts:527`（`ActionLogic`）、
`player-efficiency.ts:40`（`PlayerEfficiency`）、`:125`（`RiskRank`）

`refactor-report.md` M27 で `Efficiency` と `mjimage` に対して行ったのと同じ話。
`PlayerEfficiency` と `RiskRank` は `src/index.ts:100` で公開されているので、
公開面を保つなら M27 と同じく `export * as` で名前空間の形だけ残す。
`ActionLogic` は公開されていないので素の関数にしてよい。

### C21. manager の getter が内部の可変オブジェクトを返す

**箇所**: `managers.ts:19-21`（`ScoreManager.summary`）、`:56-58`（`PlaceManager.sticks`）、
`:97-99`（`PlaceManager.playerMap`）

```ts
get summary(): { readonly [id: string]: number } {
  return this.m;    // readonly 型だが実体は可変。呼び出し側と共有される
}
```

`sticks` は `incrementDeadStick` などが同じオブジェクトを書き換える。この値は
`DistributeEvent.sticks` / `EndEvent.sticks` / `RoundHistory.sticks` に
そのまま載る（`state-machine.ts:430,763` / `controller.ts:405`）。

現状これが実害になっていないのは、受け取り側が `structuredClone` するか
（`PlaceManager` の構築子 `managers.ts:50-51`）、`DISTRIBUTE` のたびに
manager 自体を作り直しているため（`controller.ts:907-911`）で、
型ではなく偶然に支えられている。

**修正方針**: getter で写しを返すか、`sticks` を不変の値として扱い
更新は新しいオブジェクトの代入にする。

### C22. `startGame` の局リセットがインラインで、終局条件がハードコード

**箇所**: `controller.ts:415-428`

```ts
startGame() {
  for (;;) {
    this.start();
    // TODO arrange as function
    this.wall = new Wall();
    this.observer.applied = {};
    this.mailBox = {};
    this.actor = createActor(createControllerMachine(this));
    if (this.placeManager.is(ROUND.W1)) break;
  }
}
```

既存 TODO のとおり、局の初期化がここに散っている。C1（河のリセット漏れ）は
「初期化すべきものの一覧がどこにも無い」ことの帰結。終局条件も東南戦固定で、
東風戦や一局戦を選べない。

**修正方針**: 局の初期化を 1 か所（`DISTRIBUTE` のハンドラ）に集約し、
`startGame` は終局条件だけを見る。終局条件は構築子のパラメータにする
（`endRound?: Round`、既定 `ROUND.W1`）。

### C23. `Controller` のフィールド初期化子で `this` が漏れる

**箇所**: `controller.ts:95-103`

```ts
export class Controller {
  wall: IWall = new Wall();
  playerIDs: string[];
  actor = createActor(createControllerMachine(this), {});   // ← 構築子の前に this
  ...
```

`createControllerMachine(this)` は context に `controller` を格納するだけなので
現状は動くが、構築子本体で初期化される `handlers` / `observer` / `playerIDs` が
まだ空の状態の `this` を渡している。フィールドの宣言順に依存している。

**修正方針**: `actor` の生成を構築子の末尾へ移す。`startGame` が同じ生成を
繰り返している（`controller.ts:424`）ので、`private newActor()` にまとめる。

### C24. `ActorHand.clone()` の文字列往復

**箇所**: `controller.ts:858-862`

```ts
override clone() {
  const c = new ActorHand(this.toString());   // 直列化 → 再パース
  c.data.reached = this.data.reached;
  return c;
}
```

`refactor-report.md` M18 が「`ActorHand` が `clone` を上書きして自分の型を返すため、
派生クラスを保つ形を決める必要がある」と保留していた箇所。`Hand.clone` と
まったく同じ実装が 2 つある。

**修正方針**: M18 と同時に扱う。`Hand` 側を `snapshot()` ベースの複製にし、
`ActorHand` は `protected newInstance()` のようなフックだけを上書きする。
`doWin` のロン牌の抜き差し（C7）が消えれば、そもそも `clone` の呼び出し自体が減る。

---

## 低

| # | 箇所 | 内容 | 修正方針 |
|---|---|---|---|
| L1 | `river.ts:5,41-43` | `DiscardEntry.callMarker` は `markCalled()` が書くだけで読み手がゼロ | 河の描画で使う予定が無いなら `markCalled` ごと削除 |
| L2 | `controller.ts:497` / `:765` | `doAnKan`（controller）と `doAnkan`（ActionLogic）で K の大小が違う | `doAnKan` に統一 |
| L3 | `state-machine.ts:264-267` | `chied` が `params: { action: "chi" }` を渡すが `notify_choice_after_called` は `_params` を無視 | 削除 |
| L4 | `state-machine.ts:784` | 和了時だけ `sticks: { reach: 0, dead: 0 }` のハードコード。他の 3 分岐は `placeManager.sticks` | 意図（供託を払い出し済み）をコメントにするか、`placeManager` 側で 0 にしてから読む |
| L5 | `state-machine.ts:776-777` | `hands[event.iam] = ...` がループ内不変 | ループの外へ |
| L6 | `state-machine.ts:824-832` | テンパイ料の `3000` が直値。`shouldContinue` の条件も式に埋まっている | 定数に出す |
| L7 | `state-machine.ts:453-455,632` | `params as { replacementWin: boolean } \| undefined` / `as { action: string }`（既存 TODO） | xstate の `setup` でアクションの params に型を付ける |
| L8 | `state-machine.ts:78` | マシンの `id` が `"Untitled"` | `"controller"` に |
| L9 | `managers.ts:141-153` | `addTileToSafeMap` / `isSafeTile` が `@deprecated` のまま `player-efficiency.ts` の `RiskRank` から使われている | 代替を決めるか、非推奨を外す |
| L10 | `controller.ts` 12 箇所 / `state-machine.ts` 4 箇所 | `console.debug` / `console.warn` / `console.error` の直書き | ロガーを注入可能にする。`debugMode`（`controller.ts:103`）が既にあるので合流させる |

なお `Controller.pollReplies:187-191` の例外メッセージは got と want が逆
（`got: ${wind.length}, want: ${events.length}`）。`events` が実際に届いた数なので
入れ替える。直後の `if (wind.length == 0)`（`:192`）は、`events == null` で
先に例外になるため到達しない。

---

## 回帰テスト

controller の既存テストは `src/lib/__tests__/controller.test.ts` の 22 件のみで、
内訳は通しのシナリオ 3 件（立直/同順フリテン/チャンカン）、`callable` 18 件、
空のプレースホルダ 1 件（`controller.test.ts:210`）。
`callable` は鳴く人を `"1z"` に固定しているため C2 を
取り逃していた。`events.ts` / `managers.ts` / `wall.ts` / `river.ts` / `replay.ts` /
`player-efficiency.ts` は素通しだった。

リファクタリングの安全網として `src/lib/__tests__/controller-unit.test.ts` を追加した
（55 件 + 既知バグ 7 件）。既存の `controller.test.ts` は通しのシナリオを見るもの、
新しい方は controller 配下の各モジュールを単体で固定するものとして分けてある。

| 対象 | 固定した性質 |
|---|---|
| `events.ts` | 捨て牌の優先順位 RON > DAI_KAN > PON > CHI、ツモ番の TSUMO > REACH > AN_KAN > SHO_KAN > 九種九牌 > DISCARD、ダブロンで該当者全員が返る、選択肢なしは空 + `type: false` |
| `ScoreManager` | リーチで 1000 点、`update` の wind→player 対応、初期値の複製 |
| `PlaceManager` | id↔wind の双方向、`nextRound` で局が進み席が 1 つずれる、4 回で一周、本場/リーチ棒の増減 |
| `Counter` | 初期値（各 4 枚・赤 1 枚・字牌の赤は 0）、5 枚目と 2 枚目の赤で例外、赤は 5 と赤の両方を減らす、裏牌は数えない、`disabled`、`reset`、現物は対象ユーザごと |
| `Wall` | 配牌 4 家 13 枚、ドラ表示牌はカンごとに増え 4 枚が上限、嶺上牌 4 枚とカン 1 回につき山が 1 枚減る、ツモれるのは 122 枚、`export` から同じ順に復元 |
| `River` | 全体と各家の捨て牌、`lastTile`、空なら例外、四風連打（同じ風 4 連続のときだけ・数牌は対象外）、`reset` |
| `ActorHand` | `isBackHand`、裏牌手牌からの `dec`、`clone` が `ActorHand` を返し `reached` を保ち独立している |
| `Controller`（鳴き） | 自分の捨て牌は鳴けない、ポンは 2 枚必要、リーチ後は 6 種すべて不可、チーは上家のみ、字牌はチー不可、大明槓は 3 枚・暗槓は 4 枚、加槓はポン済みのみ |
| `Controller`（打牌） | リーチ後はツモ切りのみ、ポン/チーの喰い替え（現物と筋） |
| `Controller`（九種九牌） | ちょうど 9 種で成立・8 種で不成立・同じ牌は 1 種、自分の捨て牌があると不可 |
| `Controller`（立直） | テンパイかつ門前、鳴きあり不可、ノーテン不可 |
| 1 局通し | 必ず `done` で終わる、点数の合計 + 供託 = 100000、履歴 1 件と山 136 枚、`export` → `load` → `start` で同じ点数 |

確認済みのバグは `test.fails` で「期待どおりに動かない」ことを固定してある（C1・C2・C3・
C10・C11・C12）。直すとこれらが失敗に転じるので、そのとき通常の `test` に書き換える。
C13 は現状の挙動を通常の `test` に書き、コメントで直したときの期待値を記してある。

C3 のテストはマシンの config を走査して、参照されているアクション名がすべて
実装されていることを確かめる形にした。綴り誤りは文字列である以上再発するので、
`disable_none_shot` を直したあともこのテストは残す価値がある。

**未着手のテスト**: C5（カンドラ）・C6（和了の検証）・C9（チャンカンのフリテン）は
状態機械を通した多手数のシナリオが要るため、`controller.test.ts` 側に
`MockPlayer` / `MockWall` を使って書くことになる。修正と同時に足すのが効率的。

---

## 実施順序

**1. 安全網** — 済（`controller-unit.test.ts`、55 + 7 件）。
C5 / C6 / C9 のシナリオテストは各修正と同時に。

**2. 正しさ（単独で完結し、影響範囲が小さい順）**

| 項目 | 変わるもの |
|---|---|
| C12 `Wall.draw` のガード | 例外メッセージのみ |
| C11 `Replayer.prev` の assert | `src/` 内に呼び出しゼロ |
| C3 `disable_none_shot` の綴り | ポン後に一発が消える |
| C2 `getCallBlockIndex` の方角 | 東家以外の鳴き牌の描画位置 |
| C1 `River.reset()` の呼び出し | 2 局目以降のフリテン・ダブルリーチ・四風連打・九種九牌 |
| C13 空配列の選択肢 | `Player` が候補を絞り切ったときに落ちなくなる |
| C9 チャンカンのフリテン | C16 と同時が効率的 |
| C10 `selectMinPriority` | `Player` の打牌選択。(2)(3) は意図の確定が要る |

**3. 構造** — C4 のファイル分割を先に行い、その上で C8（`pollReplies`）→
C20（static クラスの解体）→ C17（`BaseActor`）と進む。C7 の死んだコードは
C4 の途中で落ちる。

**4. 状態機械** — C15（ブロードキャストの共通化）→ C16（捨て牌の受けの統合、C9 を含む）→
C14（イベントの型注釈）→ C18（`assign` への移行）。C5 と C6 は
C18 で context の持ち方を決めたあとに行うのが手戻りが少ない。

**5. 残り** — C21 / C22 / C23 / C24 と低の 10 件。C24 は
`refactor-report.md` M18 と同時に。
