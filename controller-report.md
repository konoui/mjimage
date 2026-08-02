# mjimage controller リファクタリング調査レポート

対象: `src/lib/controller/`（`refactor-report.md` が対象外にしていた範囲）
現状: `npx tsc --noEmit` エラーなし / `npm test` 331 passed + 5 expected fail（2026-08-02 時点）
済: C1 / C2 / C3 / C9 / C11 / C12 / C13（正しさ）、C4 / C7 / C8 / C17 / L2 と C20 の一部（構造）、
C5 / C14 / C15 / C16 / C18 / L3 / L5 / L7 / L8（状態機械）、C19 / C21 / C22 / C23 / L1 / L10（残り）。
いずれも 2026-08-02。該当行は **済** と記した。
観点: 責務分割・重複コード・型の使い方・正しさ・テスト容易性
方針: 公開 API は `src/index.ts` で選別済み（`refactor-report.md` H1）。controller 内部の大半は
公開面に出ていないため、semver の制約なく組み替えられる。

調査時（2026-07-29）の構成。

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

C4 のファイル分割後（2026-08-02）。`controller.ts` は 1117 行から 291 行になった。

```
src/lib/controller/
  state-machine.ts      958 行  xstate のマシン定義 + 全アクション
  actions.ts            345 行  鳴き/立直/和了の可否判定（旧 ActionLogic + 赤牌・喰い替え）
  events.ts             319 行  イベント型 + 優先順位判定 + EventHandler
  controller.ts         291 行  Controller（進行のみ）
  actor.ts              279 行  ActorHand / BaseActor / Observer
  mailbox.ts            251 行  返信の集約（イベント種別ごと）
  managers.ts           188 行  ScoreManager / PlaceManager / Counter / shuffle / 乱数
  player-efficiency.ts  178 行  PlayerEfficiency / RiskRank（保留）
  wall.ts               142 行  Wall / IWall
  player.ts              78 行  Player
  game.ts                63 行  createLocalGame
  river.ts               56 行  River / IRiver
  history.ts             39 行  RoundHistory / snapshotRound / restoreRound
  replay.ts              28 行  Replayer
  call-index.ts          19 行  鳴き牌の位置
  index.ts               14 行  barrel
```

`actions.ts` / `call-index.ts` / `mailbox.ts` は barrel に出していない（controller の内部）。

公開されているのは `Controller` / `ActorHand` / `BaseActor` / `Observer` / `Player` /
`Replayer` / `Wall` / `River` / `ScoreManager` / `PlaceManager` / `Counter` /
`PlayerEfficiency` / `RiskRank` / `createLocalGame` / イベント型（`src/index.ts:81-125`）。
`ActionLogic` / `createControllerMachine` / `prioritizeDiscardedEvents` などは公開面に無い。

---

## サマリ

| # | 優先度 | 観点 | 箇所 | 概要 | 確認 |
|---|---|---|---|---|---|
| C1 | 高 | 正しさ | `river.ts:52` / `controller.ts:900` | `River.reset()` が一度も呼ばれず、河が局をまたいで残る | **済** |
| C2 | 高 | 正しさ | `controller.ts:62-78` | `getCallBlockIndex` が方角の差を `Math.abs` で見るため、東家以外の 4 組で鳴き牌の位置が誤る | **済** |
| C3 | 高 | 正しさ | `state-machine.ts:256` | `disable_none_shot` は綴り誤りで未実装。xstate は黙って無視するのでポンで一発が消えない | **済** |
| C4 | 高 | 責務分割 | `controller.ts` | 1117 行に 5 つのクラス。`Controller` 自身も 4 責務 | **済** |
| C5 | 高 | 正しさ | `state-machine.ts:156,727-744` | 小明槓・大明槓で新ドラがめくられない（既存 FIXME） | **済** |
| C6 | 中 | 信頼境界 | `state-machine.ts` / `controller.ts` | `canWin` が常に true。点数はプレイヤー申告の `boardContext` を信頼する | **保留（意図的）** |
| C7 | 中 | 死んだコード | `controller.ts:454-477` | `doWin` の `cloned` は組み立てて捨てるだけ。ロン判定も二重 | **済** |
| C8 | 中 | 責務分割 | `controller.ts:179-369` | `pollReplies` が 190 行 5 分岐 | **済** |
| C9 | 中 | 正しさ | `state-machine.ts:568` | チャンカンのフリテン判定が `missingMap[event.iam]`（`[w]` の誤り） | **済** |
| C10 | 低 | 未完成 | `player-efficiency.ts:74,100,113,119` | `selectMinPriority` は常に先頭を返す。`calcPriority` に式文と二重加算 | **保留** |
| C11 | 中 | 正しさ | `replay.ts:15-17` | `Replayer.prev` の `assert` が反転 | **済** |
| C12 | 中 | 正しさ | `wall.ts:53` | `draw` のガードが配列オブジェクトを見ている | **済** |
| C13 | 中 | 正しさ | `events.ts:251-267` | 空配列の選択肢が truthy 判定で「選べる」になる | **済** |
| C14 | 中 | 型の使い方 | `events.ts:98` / `state-machine.ts:646-653` | `DrawEvent.subtype` と実装の `subType` が食い違う。イベント生成に型注釈が無い | **済** |
| C15 | 中 | 重複コード | `state-machine.ts` 12 箇所 | 「4 家にブロードキャスト」の定型 | **済** |
| C16 | 中 | 重複コード | `state-machine.ts:469-552` | `notify_choice_after_discarded` と `notify_choice_for_reach_acceptance` がほぼ同一 | **済** |
| C17 | 中 | 重複コード | `controller.ts:920-978` | `BaseActor` の DISCARD と REACH が同一処理 | **済** |
| C18 | 中 | 型の使い方 | `state-machine.ts` 全般 | `assign` を使わず context を直接ミューテート | **済** |
| C19 | 中 | 型の使い方 | `controller.ts:165` | `emit` の `(e as any).iam` | **済** |
| C20 | 中 | 型の使い方 | `controller.ts:527` ほか | static のみのクラス 3 つ（`refactor-report.md` M27 と同型） | **一部** |
| C21 | 中 | 型の使い方 | `managers.ts:19,56,97` | getter が内部の可変オブジェクトを `readonly` 型で返す | **済** |
| C22 | 中 | 責務分割 | `controller.ts:415-428` | `startGame` の局リセットがインライン（既存 TODO）。終局条件がハードコード | **済** |
| C23 | 中 | テスト容易性 | `controller.ts:97` | `Controller` のフィールド初期化子で `this` が漏れる | **済** |
| C24 | 中 | 効率 | `controller.ts:858-862` | `ActorHand.clone()` の文字列往復（`refactor-report.md` M18 の controller 側） | 読み |
| L1〜L10 | 低 | 各種 | （後述） | 命名の不一致、死んだフィールド、マジックナンバー、`console.debug` 直書き | 読み |

---

## 高

### C1. `River` が局をまたいでリセットされない

**状態**: 修正済み。`BaseActor.handleEvent` の `DISTRIBUTE` で `this.river.reset()` を呼ぶ。
局の初期化を `DISTRIBUTE` に一本化する話（C22）は未着手。
固定: `controller-unit.test.ts`「DISTRIBUTE で河がリセットされる」/
`controller-scenario.test.ts`「2 局目の九種九牌は 1 局目の捨て牌に影響されない」。

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

**状態**: 修正済み。`nextWind` / `prevWind` で上家・対面・下家を判定する。
固定: `controller-unit.test.ts`「controller/鳴き牌の位置」（4 家 × 3 方向）。

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

**状態**: 修正済み。綴りを `disable_one_shot` に直した。
`setup({ actions })` でアクション名に型を付ける話は未着手（C18 と同時が自然）。
固定: `controller-unit.test.ts`「参照しているアクションはすべて実装されている」（名前）/
`controller-scenario.test.ts`「C3/一発」（振る舞い）。

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

**状態**: 済。`controller.ts` は 291 行（Controller のみ）になった。
分割先は上のファイル一覧を参照。import 元は barrel のままなので、公開面は変わっていない
（`src/index.ts` は `ActorHand` / `BaseActor` / `Observer` / `RoundHistory` の
取得元パスだけ変更）。`ActionLogic` は barrel から外し、controller の内部にした。

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

**状態**: 済。めくる契機を暗槓と明槓で分けた。

- 暗槓: カンの直後（`an_sho_kaned` の entry でそのままめくる）
- 大明槓・加槓: カンした人が打牌したあと（context の `pendingNewDora` に予約し、`discarded` の entry でめくる）

`dai_kaned` には `notify_new_dora_if_needed` 自体が無かったので追加した。
`discarded` の FIXME はこれで解消。裏ドラ（`hiddenDoraIndicators`）も
`Wall.openedDoraCount` に連動しているので同時に増える。
固定: `controller-scenario.test.ts`「C5/カンドラ」。枚数だけでなく、
イベントの並び（暗槓は `AN_KAN → NEW_DORA`、明槓は `… → DISCARD → NEW_DORA`）で
めくる契機そのものを見ている。

**残した判断**（どちらもハウスルールの差で、現状は単純な側を選んでいる）:

1. カンした人の打牌でロンされた場合、その和了に新ドラが乗る。
   `NEW_DORA` を `DISCARD` の直後に出しているため。乗せない側にするなら、
   めくるのを「打牌が誰にも取られなかったとき」（`wildcard_after_discarded` と
   鳴きの各 entry）に移すことになり、めくる箇所が 1 つから 4 つに増える。
2. 嶺上開花で和了した場合、打牌が無いので明槓の新ドラはめくられないまま局が終わる。
   予約（`pendingNewDora`）は局ごとに作り直される context にあるので次局には残らない。

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

**状態**: 保留。現状のまま（プレイヤーの申告を信頼する）で進める、という判断。

理由は xstate の guard の性質にある。guard が false を返すとイベントは黙って捨てられ、
状態機械はその場に留まる。つまり検証に落ちても「何も起きない」だけで、
どこで弾かれたのかが表に出ない。`disable_none_shot` の綴り誤り（C3）が長く残ったのと
同じ形の見えない失敗を、和了という一番複雑な経路で抱えることになる。
ローカル対戦では実害が無いので、追いやすさを優先して今は素通しにしている。

**将来入れるときの置き場所**: guard ではなく `pollReplies`（`mailbox.ts`）。
ここなら「なぜ弾いたか」を例外やログとして出せるし、
`canChi` / `canPon` / `canReach` のように controller 側の判定を呼び直す形にできる。
`finalResult` の入力を controller の盤面から組み立て直すのも同時に行う。

現状の振る舞いは `controller-scenario.test.ts`「C6/和了の申告」で仕様として固定してある
（`canWin` は常に true / 申告の `boardContext` がそのまま点数になる）。
検証を入れるときはこの 2 件を書き換えることになる。

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

**状態**: 一部済。`cloned` の 3 行は削除した（ロン牌を加えるのは `actions.doWin` 側だけ）。
ロンかどうかの判定基準が `Controller.doWin`（`hand.drawn == null`）と
`actions.doWin`（`env.winBy.type`）で二重なのは残っている。
呼び出し側から 1 つの値として渡す形にするのは state-machine 側の変更（C6）と同時が効率的。

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

**状態**: 済。`mailbox.ts` に移し、イベント種別ごとの関数に分けた
（`afterDiscarded` / `afterDrawn` / `afterCalled` / `forReachAcceptance` / `forChanKan`）。
`case` の波括弧なし宣言も揃えた。例外メッセージの got/want の入れ違いと、
到達しない `wind.length == 0` の分岐もここで直した。
`mailBox` の型をイベント種別ごとに絞る話（`MailBox` は今のところ別名だけ）は未着手。

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

**状態**: 修正済み。`context.missingMap[w]` に直した。
3 つの通知の共通化（C16）は未着手なので、写し間違いが再発する余地は残っている。
固定: `controller-scenario.test.ts`「見逃した人はチャンカンでもロンできない」。

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

**状態**: 保留。`PlayerEfficiency` / `RiskRank` は `Player.handleDiscard` からしか呼ばれず、
返す牌も候補（`e.choices.DISCARD`）の中に限られるため、どう間違っても不正な局面は作れない。
対局の正しさではなく Player の打ち方の質の話であり、実装自体がまだ途中
（`Player.doras` がどこからも代入されない / 場風・自風が FIXME のまま）。
Player を仕上げるときに、下の (1)(2)(3) と A〜D をまとめて決める。

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

**修正方針**: (1) は判断不要（`RiskRank.selectTile:133` が正しく
`Number.POSITIVE_INFINITY` を使っているので、それに揃える）。(2)(3) は意図を決めてから。

着手するときに決めること。

| | 決めること | 備考 |
|---|---|---|
| A | `Player.doras`（`player.ts:10`）を埋めるか、引数ごと落とすか | 宣言と読み出し（`player.ts:47`）の 2 箇所だけで代入がなく、`weight()` は常に 1 を返す。ドラの重み付けが丸ごと効いていない。B・C の前提 |
| B | `:100` と `:113` の重複を残すか消すか | 同じ牌の枚数を隣接牌の 2 倍に見る意図か、編集の取り残しか |
| C | `:119` の赤牌の扱い | 式文なだけでなく、条件が成立しない。赤 5 はパース時に `n=5 + OP.RED` に正規化される（`core/tile.ts:285`、`:352`）。残すなら `tile.has(OP.RED)` で見る |
| D | 字牌の重み（`:94-96`）に場風・自風を入れるか | 既存 FIXME。入れるなら `calcPriority` に `Wind` / `Round` を渡す必要がある |

いずれを触っても `controller-scenario.test.ts`「再現性」の期待点数は取り直しになる。
`managers.ts` の `addTileToSafeMap` / `isSafeTile` の非推奨（L9）も、
`RiskRank` を仕上げるまで結論を出せない。

### C11. `Replayer.prev` の assert が反転している

**状態**: 修正済み。`assert(this.index >= 0)`。削除はしていない。
固定: `controller-unit.test.ts`「Replayer.prev は index が負になったら落ちる」。

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

**状態**: 修正済み。`this.walls.drawable.length == 0` を見る。
固定: `controller-unit.test.ts`「山が尽きたら draw は専用のエラーを投げる」。

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

**状態**: 修正済み。`selectable()` を通し、配列は長さまで見る。
「選ばない」を型として表せなくする案（`undefined` にする）は未着手。
固定: `controller-unit.test.ts`「候補 0 件の選択肢は選ばれない」。

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

**状態**: 済。`events.ts` を `subType?: "kan"` に統一し、イベントを組み立てる箇所すべてに
型注釈を付けた（`notify_draw` の `DrawEvent`、`notify_call` の `CallEvent`）。
`params` の `as` は `asParams<T>()` に集約した。`setup()` で params 自体に型を付ける話（L7）は未着手。

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

**状態**: 済。`broadcast(controller, (w) => イベント)` にまとめた。
`notify_end` の 4 分岐を含め、4 家に配る箇所はすべてこれを通る。

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

**状態**: 済。`ronChoicesForLastDiscard()` に一本化した（直前の捨て牌に対する
ロンの可否を 4 家ぶん求め、フリテンの印も一緒に返す）。配る選択肢の集合が違うだけなので、
イベントの組み立ては呼び出し側に残してある。

これは振る舞いの変更を伴う: 立直の宣言牌のロンを見逃してもフリテンにならなかったのが、
通常の捨て牌と同じくフリテンになる。`controller-scenario.test.ts`「C16/立直の宣言牌の見逃し」で固定した。

**箇所**: `state-machine.ts:469-507`（`notify_choice_after_discarded`）と
`:529-552`（`notify_choice_for_reach_acceptance`）

どちらも「直前の捨て牌を横向きにして 4 家に `doWin` を配る」で、後者は
`PON` / `CHI` / `DAI_KAN` を配らない点だけが違う。前者にはある
`if (e.choices.RON) context.missingMap[w] = true;`（`:501`）が後者には無く、
リーチ宣言牌を見逃した場合にフリテンにならない差も生まれている。

**修正方針**: 「捨て牌に対する選択肢を配る」を 1 つの関数にし、
配る選択肢の集合を引数にする。C9 のフリテン判定もここに一本化される。

### C17. `BaseActor` の DISCARD と REACH が同一処理

**状態**: 済。`applyDiscard(t, iam, wind)` に抜き、`REACH` は `reach()` + `applyDiscard()` にした。
波括弧なしで `const` を宣言していた `DISTRIBUTE` と `REACH_ACCEPTED` も揃えた。
イベント種別のハンドラをテーブルに載せて switch を畳む話は未着手。

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

**状態**: 済。

1. `currentWind` / `oneShotMap` / `missingMap` の書き換えはすべて `assign` を通した
   （notify_* のように「イベントを配りながら context も変える」ものは `enqueueActions` を使う）。
   直接のミューテーションは残っていない。
2. `controller` と `genEventID`（可変のクロージャ）を context から出し、
   `createControllerMachine(c)` のクロージャに移した。
   `createMachine` はもともと Controller ごとに呼ばれているので、`input` を使うまでもない。

結果、context は `currentWind` / `oneShotMap` / `missingMap` / `pendingNewDora` の
素のデータだけになり、`actor.getPersistedSnapshot()` がそのまま JSON にできる。
固定: `controller-unit.test.ts`「context は直列化できる（C18）」。

なお、局の再開に必要なのは状態機械の context だけではない（手牌・河・山・点数は
Controller 側にある）。そちらは `RoundHistory` が受け持っていて、C18 とは別の経路。

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

**状態**: 済。`"iam" in e` で絞るようにした（TS の絞り込みが効くので `any` は不要）。
重複排除は `applyToObserver()` に切り出し、規則をコメントに書いた
（`iam` を持つイベントは本人あてのぶんだけ / 持たないイベントは ID につき 1 回 /
`DISTRIBUTE` だけ 4 家ぶん）。

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

**状態**: 一部済。`ActionLogic` は素の関数にした（`actions.ts`、呼び出し側は
`import * as actions` で名前空間として使う）。あわせて L2 の `doAnkan` → `doAnKan` も揃えた。
`PlayerEfficiency` / `RiskRank` は C10 と同じ理由で保留（実装が途中で、
仕上げるときに `export * as` へ移す）。

**箇所**: `controller.ts:527`（`ActionLogic`）、
`player-efficiency.ts:40`（`PlayerEfficiency`）、`:125`（`RiskRank`）

`refactor-report.md` M27 で `Efficiency` と `mjimage` に対して行ったのと同じ話。
`PlayerEfficiency` と `RiskRank` は `src/index.ts:100` で公開されているので、
公開面を保つなら M27 と同じく `export * as` で名前空間の形だけ残す。
`ActionLogic` は公開されていないので素の関数にしてよい。

### C21. manager の getter が内部の可変オブジェクトを返す

**状態**: 済。`ScoreManager.summary` / `PlaceManager.sticks` / `PlaceManager.playerMap` は写しを返す。
固定: `controller-unit.test.ts`「summary は写しを返す（C21）」「sticks と playerMap は写しを返す（C21）」。

なお、実害が出ていなかった理由を確かめた: `RoundHistory` は局を始める前の値を握るが、
`DISTRIBUTE` のたびに manager 自体が作り直されるため、古いオブジェクトはそのまま凍る。
報告書に書いた「型ではなく偶然に支えられている」がそのとおりで、
getter を写しに変えても履歴の中身は変わらなかった（テストで確認済み）。

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

**状態**: 済。局の作り直しを `Controller.prepareNextRound()` に抜いた。
手牌・河・点数などの盤面は `DISTRIBUTE` のハンドラ（`actor.ts`）が作り直すので（C1）、
ここが見るのは controller 側の入れ物（山・`applied`・`mailBox`・`actor`）だけ。
「初期化すべきものの一覧」がこの 2 か所に分かれて揃った。

終局条件は構築子のパラメータ（`endRound`、既定 `ROUND.W1`）にし、`startGame(endRound?)` で
上書きもできる。東風戦や 1 局戦を回せる。
テスト側の `startNextRound`（`utils/controller.ts`）は `prepareNextRound()` の呼び出しに置き換えた
（それまでは同じ初期化をテストが書き写していた）。

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

**状態**: 済。`actor` の生成を構築子の末尾に移し、`private newActor()` にまとめた。
`prepareNextRound()` も同じものを使うので、生成が 2 か所に散らない。
フィールドの宣言順への依存も無くなった。

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
| L1 | ~~`river.ts:5,41-43`~~ | `DiscardEntry.callMarker` は `markCalled()` が書くだけで読み手がゼロ | **済**（`markCalled` ごと削除） |
| L2 | ~~`controller.ts:497` / `:765`~~ | `doAnKan`（controller）と `doAnkan`（ActionLogic）で K の大小が違う | **済**（C20 と同時に `doAnKan` へ統一） |
| L3 | ~~`state-machine.ts:264-267`~~ | `chied` が `params: { action: "chi" }` を渡すが `notify_choice_after_called` は `_params` を無視 | **済**（削除） |
| L4 | `state-machine.ts` | 和了時だけ `sticks: { reach: 0, dead: 0 }` のハードコード。他の 3 分岐は `placeManager.sticks` | **一部**（意図をコメントにした。`placeManager` 側で 0 にする案は未着手） |
| L5 | ~~`state-machine.ts:776-777`~~ | `hands[event.iam] = ...` がループ内不変 | **済**（ループの外へ） |
| L6 | `state-machine.ts` | テンパイ料の `3000` が直値。`shouldContinue` の条件も式に埋まっている | **一部**（`NOTEN_PENALTY` に出した。`shouldContinue` はそのまま） |
| L7 | `state-machine.ts` | `params as { replacementWin: boolean } \| undefined` / `as { action: string }`（既存 TODO） | **一部**（`setup()` に移行してアクション名・ガード名は型で縛った。params の型付けは下記の理由で見送り） |
| L8 | ~~`state-machine.ts:78`~~ | マシンの `id` が `"Untitled"` | **済** |
| L9 | `managers.ts:141-153` | `addTileToSafeMap` / `isSafeTile` が `@deprecated` のまま `player-efficiency.ts` の `RiskRank` から使われている | 代替を決めるか、非推奨を外す |
| L10 | ~~`controller.ts` / `state-machine.ts`~~ | `console.debug` / `console.warn` / `console.error` の直書き | **済**（`logger.ts` を追加し `Controller` に注入） |

L7 の中身: `createMachine(config, implementations)` を `setup({ types, actions, guards }).createMachine(config)` に
書き換えた。これで **states から参照するアクション名・ガード名がコンパイルで検査される**。
C3（`disable_none_shot`）と同じ綴り誤りを入れると `tsc` が止まることを確認済み。

params（`{ action: "kan" }` / `{ replacementWin: true }`）の型付けは見送った。
実装に `enqueueActions` を使っているアクションがあると、
「アクションの型 → マシンのアクション union → そのアクションの型」と推論が循環し、
`Two different types with this name exist` で通らない。
`enqueueActions` をやめれば型は付くが、`missingMap` の更新は
「4 家ぶんの `doWin` を計算した結果」なので、assign を別アクションに分けると同じ計算を 2 度することになる。
params の形は `DrawParams` / `DrawnChoiceParams` として名前を付け、
受け取り側で 1 度だけキャストする形に留めた。

`controller-unit.test.ts` の「参照しているアクションはすべて実装されている（C3）」は、
config を動的に組み立てるようになった場合の保険として残してある。

L10 の中身: `logger.ts` に `Logger`（`debug` / `warn` / `error`）を置き、
`Controller` の構築子パラメータで受け取る（既定は `consoleLogger` なので出力は今までどおり）。
observer と状態機械のガードも controller のロガーを使う。
`Player` は今のところログを出さないので繋いでいない。
テストは `silentLogger` を渡していて、`npm test` の出力から進行ログが消えた。

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

現在は 3 つのファイルで役割を分けてある。

| ファイル | 見るもの |
|---|---|
| `controller.test.ts` | 既存の通しシナリオと `callable`（22 件） |
| `controller-unit.test.ts` | controller 配下の各モジュールの単体の性質（61 件 + 既知バグ 1 件） |
| `controller-scenario.test.ts` | 状態機械を通さないと現れない性質（16 件 + 既知バグ 4 件） |

台本つきの対局を組み立てる道具は `src/lib/__tests__/utils/controller.ts` にまとめてある
（`MockPlayer` / `MockWall` / `createScenario` / `stepUntil` / `startNextRound` /
`recordEvents`）。`controller.test.ts` に直接書かれていた `MockPlayer` / `MockWall` は
ここへ移した。

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

`controller-scenario.test.ts` が固定したもの。

| 対象 | 固定した性質 |
|---|---|
| C5 カンドラ | 暗槓・加槓・大明槓の 3 つの台本。めくる契機をイベントの並びで固定（暗槓はカン直後、明槓は打牌後） |
| C9 チャンカン | 直前にロンを見逃した人はチャンカンでもロンできない |
| C3 一発 | ポンが割り込むと一発が消える（点数では見えないので役で見る） |
| C16 立直の宣言牌 | 宣言牌のロンを見逃すとフリテンになり、続けて聞かれても選択肢が無い |
| C6 和了の申告 | `canWin` は常に true。申告の `boardContext` がそのまま点数になる（意図的な現状の仕様として固定） |
| C1 局をまたいだ河 | 2 局目の九種九牌が 1 局目の捨て牌に影響されない |
| イベント列 | 1 局分のイベントの型の並び（C15・C16・C18 で崩れていないことの見張り） |
| context | 状態機械の context が素のデータだけで、JSON にできる（C18） |
| 再現性 | 同じ種からは同じ 1 局になる（`Player` の打牌選択まで含めた最終点数） |

まだ直していないものは `test.fails` で「期待どおりに動かない」ことを固定してある（C10 のみ）。
直すと失敗に転じるので、そのとき通常の `test` に書き換える。
C6 は直さない判断なので、`test.fails` ではなく通常の `test` で現状の仕様を固定してある。

`test.fails` は「どこで失敗しても通る」ので、台本が壊れて別の場所で落ちても気づけない。
シナリオ側は「目的の局面まで到達したこと」を通常の `test` で別に確かめ、
それを台本の見張りにしてある（例: 「台本どおり加槓する」と
「加槓でもカンした人の打牌後に新ドラがめくられるべき」の対）。

C3 のテストはマシンの config を走査して、参照されているアクション名がすべて
実装されていることを確かめる形にした。綴り誤りは文字列である以上再発するので、
綴りを直したあとも残してある。名前だけでは「entry からアクションが消えた」を
拾えないので、振る舞いの側（ポンで一発が消える）も別に固定してある。

### テストのために足した機能

いずれも既定の振る舞いは変えていない。

| 箇所 | 追加 | 何のため |
|---|---|---|
| `managers.ts` | `Rand` 型、`shuffle(array, rand)`、`createSeededRand(seed)` | 乱数を差し替え可能にする。`Math.random` を spy する必要がなくなる |
| `wall.ts` | `new Wall(backup?, { rand })` | 山を種から固定する |
| `controller.ts` | `Controller` の `rand` / `newWall` パラメータ | 席順と山を固定する。局をまたいでも台本つきの山を使い続けられる |
| `controller.ts` | `endRound`（構築子 / `startGame`） | 東風戦・1 局戦を回せる（C22 で構築子のパラメータに移した） |
| `game.ts` | `createLocalGame({ seed, rand, newWall, endRound, logger })` | 上を local game から使う |
| `logger.ts` | `Logger` / `consoleLogger` / `silentLogger` | 進行ログの出し先を差し替える（L10）。テストは `silentLogger` を渡して出力を黙らせている |

`Controller.wall` はフィールド初期化子から構築子へ移した（`newWall` を使うため）。
C23（`actor` の初期化子で `this` が漏れる）はまだそのまま。

`MockWall` の制約: 台本と `addExclude` で使う牌を本物の山から避けて引くため、
山の終盤で「除外していない牌が残っていない」状態になり得る。
局を最後まで回す台本には向かないので、必要なところまで `stepUntil` で進めること。

---

## 実施順序

**1. 安全網** — 済。`controller-unit.test.ts`（61 + 1 件）と
`controller-scenario.test.ts`（16 + 4 件）で C1 / C5 / C6 / C9 も含めて固定してある。
新しいシナリオは `utils/controller.ts` の道具立てで書く。

**2. 正しさ（単独で完結し、影響範囲が小さい順）** — C10 を除いて済。

| 項目 | 変わるもの | |
|---|---|---|
| C12 `Wall.draw` のガード | 例外メッセージのみ | 済 |
| C11 `Replayer.prev` の assert | `src/` 内に呼び出しゼロ | 済 |
| C3 `disable_none_shot` の綴り | ポン後に一発が消える | 済 |
| C2 `getCallBlockIndex` の方角 | 東家以外の鳴き牌の描画位置 | 済 |
| C1 `River.reset()` の呼び出し | 2 局目以降のフリテン・ダブルリーチ・四風連打・九種九牌 | 済 |
| C13 空配列の選択肢 | `Player` が候補を絞り切ったときに落ちなくなる | 済 |
| C9 チャンカンのフリテン | C16 と同時が効率的 | 済 |
| C10 `selectMinPriority` | `Player` の打牌選択 | 保留 |

C10 を保留にしたのは、対局の正しさではなく Player の打ち方の質の話であり、
`PlayerEfficiency` / `RiskRank` の実装自体がまだ途中のため。
Player を仕上げるときに C10 の節の A〜D をまとめて決める。

**3. 構造** — 済。C4（ファイル分割）→ C8（`pollReplies`）→ C20（`ActionLogic`）→
C17（`BaseActor`）の順で行い、C7 の死んだコードは C4 の途中で落とした。
残っているのは C7 のロン判定の二重（C6 と同時）、C8 の `mailBox` の型絞り込み、
C20 の `PlayerEfficiency` / `RiskRank`（C10 と同じく保留）。

**4. 状態機械** — 済。C15（ブロードキャストの共通化）→ C16（捨て牌の受けの統合）→
C14（イベントの型注釈）→ C18（`assign` への移行と context の整理）→ C5（カンドラ）。
C6 は保留（意図的、上記）。

**5. 残り** — C19 / C21 / C22 / C23 / L1 / L7 / L10 は済。
残るのは C24（`ActorHand.clone`、`refactor-report.md` M18 と同時）と
L9（`@deprecated` の結論、C10 待ち）。L4 / L6 / L7 は一部済。
