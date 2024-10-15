[![npm version](https://badge.fury.io/js/@konoui%2Fmjimage.svg)](https://badge.fury.io/js/@konoui%2Fmjimage)

## 麻雀牌ジェネレーター

仕様に沿ってテキストを入力することで、SVG 形式の画像を表示する Typescript ライブラリです。

## 仕様

### 牌

| 牌     | 記述                                                    |
| ------ | ------------------------------------------------------- |
| 萬子牌 | 1m 2m 3m ... 9m                                         |
| 筒子牌 | 1p 2p 3p ... 9p                                         |
| 索子牌 | 1s 2s 3s ... 9s                                         |
| 風牌   | 1z(東) 2z(南) 3z(西) 4z(北) 1w(東) 2w(南) 3w(西) 4w(北) |
| 三元牌 | 5z(白) 6z(發) 7z(中) 1d(白) 2d(發) 3d(中)               |
| 赤ドラ | 0m 0p 0s 　                                             |
| 裏牌   | \_                                                      |

※ 風牌の w は wind の、三元牌の d は dragon の略

### 制御文字

| 記号 | 説明                                             | 記載例      |
| ---- | ------------------------------------------------ | ----------- |
| \-   | 横向きの牌を表す                                 | -123s       |
| ,    | ブロックの塊を表す                               | 123,-123    |
| t    | ツモ牌を表す                                     | 123,t3p     |
| d    | ドラ牌を表す                                     | 123,t3p,d4p |
| ^    | ツモ切りを表す（牌の色が暗くなる）               | 3^56m       |
| r    | 赤ドラを示す（ 0m や 0p や 0s と同様に扱われる） | r5s         |

### 入力例

例 1）
456m456s456p1w2w3w1d,t2p,d3p

例 2）
23789p, t1w, -456p, 9-99p, d3p

※ スペースは無視されます。

### 卓全体の生成

例）

```yaml
table:
  1w:
    hand: 123456789m1234s
    discard: 12345m12345s12345p1234w
    score: 0
  2w:
    hand: 123456789m1234s,t1p
    discard: 12345m12345s12345p1234w
    score: 3000
  3w:
    hand: 123456789m1234s
    discard: 12345m12345s12345p1234w
    score: 25000
  4w:
    hand: 123456789m1234s
    discard: 12345m12345s12345p1234w
    score: 12000
  board:
    doras: 1m
    sticks:
      reach: 1
      dead: 3
    round: 1w1
    front: 2w
```

## 牌画像

[【保存版】商用無料の高クオリティーの麻雀画像の無料素材まとめ](https://majandofu.com/mahjong-images)

## 使い方

[設定例](doc/configuration.md)

[html の例](browser-mjimage/example/index.html)
