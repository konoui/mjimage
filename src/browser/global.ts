import { initialize } from "./mjimage";

// ブラウザではグローバルの名前が入口になるので、ここでだけ名前空間を組み立てる。
// ページ側の mjimage.initialize(...) という呼び出し方は変わらない。
(<any>window).mjimage = { initialize };
