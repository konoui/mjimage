# 外部の mjai 牌譜（validator の較正用）

自作のエンコーダを自作の期待値で確かめても mjai 準拠の証明にはならない。
検証コードとエンコーダが同じ誤解（フィールド名・立直の 3 段分解・`consumed` の並び）を
共有するため。そこで **validator をまず外部の実ログで較正し**（正しいログを弾かないことを確かめ）、
そのうえで自分の出力に当てる。

## 取り込んでいるもの

### `gimite-kuikae.mjson`

- 出典: [gimite/mjai](https://github.com/gimite/mjai) の `test/kuikae.mjson`
- ライセンス: **New BSD Licence**（作者 Hiroshi Ichikawa。`README.rdoc` と `mjai.gemspec` に記載。
  リポジトリに LICENSE ファイルは無く、GitHub の自動判定も付いていない）
- 中身: 食い替えの検査用に手で書かれた 6 行。原典の作者自身によるもので、対局記録ではない

### `gimite-fullgame.jsonl`

- 出典: [gimite/mjai](https://github.com/gimite/mjai) の `test/test.mjlog.golden.log`。
  同ファイルは JSON 行と人が読む盤面表示が混ざっているので、`grep '^{'` で JSON 行だけを抜いた
- ライセンス: 上と同じ **New BSD Licence**
- 中身: 1 半荘（17 局）ぶんの完全なログ・2015 イベント。`hora` / `ryukyoku` / `ankan` /
  `daiminkan` / `reach` まですべての種別が出てくるので、較正の主役はこちら

**経緯**: このログは gimite/mjai 付属の変換器が**天鳳の対局記録から変換したもの**
（`start_game` の `uri` が `http://tenhou.net/0/?log=test&tw=0`）。リポジトリの BSD が
対局記録そのものにも及ぶかは自明ではないが、対局記録は事実の記録であること、
出典が明示されていること、リポジトリ作者自身がテストデータとして配布していることから、
出典を明記した上で同梱する判断をした。

再取得するには次のようにする。

```sh
curl -sL https://raw.githubusercontent.com/gimite/mjai/master/test/test.mjlog.golden.log \
  | grep '^{' > gimite-fullgame.jsonl
```

## 取り込んでいないもの

### Mortal / mjai.app

いずれも **AGPL-3.0** なので、MIT のこのリポジトリには同梱できない。
プロトコルの最終確認（Phase 5）で外部プロセスとして使うのは問題ない。

## 分かったこと（較正の成果）

原典の実ログは今の mjai とは**方言が違う**。

- `start_kyoku` が `oya` と `dora_marker` しか持たない（`bakaze` / `kyoku` / `honba` /
  `kyotaku` / `tehais` / `scores` が無い）
- 配牌は `haipai` という別イベントで来る（`tehais` ではなく `pais`）
- `dahai` に `tsumogiri` が無い
- `hora` は `actor` / `target` / `pai` だけ

そのため validator には `dialect` を持たせてある。`"legacy"` が外部ログの較正用、
`"strict"` が自分の出力の検査用（原典のスーパーセット）。
今の形（`bakaze` などを持つ `start_kyoku`）は Mortal 系の実装が広めたもので、
その系統のログは AGPL のため較正には使えない。
