// README に貼る example 用。牌スプライト用の svgo.config.mjs と違い
// removeDimensions を入れない。width/height が消えると viewBox の比率だけが残り、
// markdown 上の表示サイズが変わってしまうため。
export default {
  plugins: [
    {
      name: "preset-default",
    },
  ],
};
