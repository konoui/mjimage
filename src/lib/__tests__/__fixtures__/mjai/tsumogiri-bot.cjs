// テスト用の mjai bot。stdio で 1 行 1 JSON を喋る。
//
// 中身は「自分のツモをそのまま切る」だけ。実 bot（Mortal など）を持ち出さずに、
// 線の向こうに本当のプロセスがいる状態で StdioBot と worker ブリッジを試すために置く。
//
// 応答の約束は mjai のとおり: 受け取った 1 行につき 1 行返す。行動しない場面は none。

const readline = require("node:readline");

const rl = readline.createInterface({ input: process.stdin });
const say = (v) => process.stdout.write(JSON.stringify(v) + "\n");

let me = null;

rl.on("line", (line) => {
  if (line.trim().length === 0) return;
  let e;
  try {
    e = JSON.parse(line);
  } catch {
    return say({ type: "none" });
  }

  switch (e.type) {
    case "hello":
      return say({ type: "join", name: "tsumogiri", room: "default" });
    case "start_game":
      // 自分の席番号はここで渡される。これが無いと自分の手番が分からない。
      if (typeof e.id === "number") me = e.id;
      return say({ type: "none" });
    case "tsumo":
      if (e.actor === me && e.pai !== "?")
        return say({
          type: "dahai",
          actor: me,
          pai: e.pai,
          tsumogiri: true,
        });
      return say({ type: "none" });
    default:
      return say({ type: "none" });
  }
});
