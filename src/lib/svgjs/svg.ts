import {
  translate,
  compose,
  rotateDEG,
  Matrix,
  toSVG,
} from "transformation-matrix";
import { XMLParser, XMLBuilder } from "fast-xml-parser";
import { assert } from "../assert";

export type Attrs = {
  /** x coord */
  x?: number;
  /** y coord */
  y?: number;
  /** width */
  width?: number;
  /** height */
  height?: number;

  [key: string]: any;
};

export type Styles = {
  [key: string]: string;
};

/**
 * SVG の要素の共通部分。
 *
 * 位置（x/y/dx/dy）はここには無い。ルートの svg のように置き場所を持たない要素が
 * あるため、位置を持つものだけが Mark として持つ。
 */
export abstract class SvgNode {
  type: string;
  attrs: Attrs = {};
  styles: Styles = {};
  /** 自分を保持しているコンテナ。remove() で自分自身を外すために持つ。 */
  parent: Container | undefined;
  constructor(type: string) {
    this.type = type;
  }
  /** 親から自分を取り除く。親に属していない場合は何もしない。 */
  remove() {
    this.parent?.removeChild(this);
    this.parent = undefined;
  }
  protected left(...v: string[]) {
    return `<${[
      this.type,
      serializeAttrs(this.attrs),
      serializeStyles(this.styles),
      ...v,
    ]
      .filter((v) => v != "")
      .join(" ")}>`;
  }
  protected right() {
    return `</${this.type}>`;
  }
  protected center() {
    return "";
  }
  toString(): string {
    const inner = this.center();
    if (inner != "") return `${this.left()}${inner}${this.right()}`;
    // 中身が無ければ空要素として畳む。left() の派生実装（G の transform など）
    // を活かすため、開始タグの末尾だけを差し替える。
    const open = this.left();
    return `${open.slice(0, -1)}/>`;
  }
  attr(attrs: Record<string, string>): this;
  attr(key: string): string;
  attr(arg: string | Record<string, string>): this | string {
    if (typeof arg === "string") {
      return this.attrs[arg] ?? "";
    } else {
      for (const [key, value] of Object.entries(arg)) {
        this.attrs[key] = value;
      }
      return this;
    }
  }
  css(style: Record<string, string>): this {
    this.styles = { ...this.styles, ...style };
    return this;
  }
  svg() {
    return this.toString();
  }
}

/**
 * 置き場所を持つ要素。座標を指定できるものだけがこれを継承する。
 *
 * 大きさ（width/height）もここに置く。g のように大きさを持たない要素で呼べると、
 * 描画側が無視するだけの属性が出力に混ざる。
 */
export abstract class Mark extends SvgNode {
  size(width: number, height: number): this {
    this.attrs.width = width;
    this.attrs.height = height;
    return this;
  }
  dx(x: number): this {
    if (this.attrs.x == null) this.attrs.x = x;
    else this.attrs.x += x;
    return this;
  }
  dy(y: number): this {
    if (this.attrs.y == null) this.attrs.y = y;
    else this.attrs.y += y;
    return this;
  }
  x(x: number): this {
    this.attrs.x = x;
    return this;
  }
  y(y: number): this {
    this.attrs.y = y;
    return this;
  }
}

export class Image extends Mark {
  attrs: Attrs & { href?: string } = {};
  constructor(url?: string) {
    super("image");
    this.attrs = { ...this.attrs, href: url };
  }
  load(url: string) {
    this.attrs.href = url;
    return this;
  }
}

export class Use extends Mark {
  attrs: Attrs & { href?: string } = {};
  constructor(id?: string) {
    super("use");
    this.attrs = { ...this.attrs, href: this.make(id) };
  }
  use(id: string) {
    this.attrs.href = `#${id}`;
    return this;
  }
  private make(id?: string) {
    if (id == null) return id;
    return `#${id}`;
  }
}

export class Rect extends Mark {
  attrs: Attrs & { stroke?: string; fill?: string } = {};
  constructor() {
    super("rect");
  }
  fill(color: string): this {
    this.attrs.fill = color;
    return this;
  }
  stroke(color: string): this {
    this.attrs.stroke = color;
    return this;
  }
}

export class Text extends Mark {
  private _text: string = "";
  constructor(text = "") {
    super("text");
    this._text = text;
    this.attrs = {};
  }
  plain(text: string) {
    this._text = text;
    return this;
  }
  font(font: { family: string; size: number }) {
    // SVG の属性名をそのまま持つ。キャメルケースで持って出力時に変換すると、
    // viewBox のような本来キャメルケースの属性まで巻き込んでしまう。
    this.attrs["font-family"] = font.family;
    this.attrs["font-size"] = font.size;
    return this;
  }
  protected center() {
    return escapeText(this._text);
  }
}

export class Symbol extends Mark {
  private raw: string;
  constructor(value: string) {
    super("symbol");
    this.raw = value;
  }
  id() {
    return this.attr("id");
  }
  protected center() {
    return this.raw;
  }
}

/**
 * 子要素を持つ要素の共通部分。
 * 自身の位置は持たないので、位置が要る G だけが translate/rotate を足す。
 */
export abstract class Container extends SvgNode {
  children: SvgNode[] = [];
  add(e: SvgNode): this {
    e.parent = this;
    this.children.push(e);
    return this;
  }
  removeChild(e: SvgNode) {
    const i = this.children.indexOf(e);
    if (i >= 0) this.children.splice(i, 1);
  }
  protected center() {
    return this.children.map((c) => c.toString()).join("");
  }
  /**
   * 子要素を走査する。deep が true の場合は子孫まで辿る。
   * 走査中にコールバックが remove() を呼んでも崩れないよう、複製に対して回す。
   */
  each(block: (idx: number, children: SvgNode[]) => void, deep: boolean) {
    const children = [...this.children];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (deep && child instanceof Container) child.each(block, true);
      block(i, children);
    }
  }
}

export class G extends Container {
  private rotateMatrix: Matrix | undefined;
  private translateMatrix: Matrix | undefined;
  constructor() {
    super("g");
  }
  rotate(angle: number, cx: number, cy: number) {
    this.rotateMatrix = rotateDEG(angle, cx, cy);
    return this;
  }
  translate(x: number, y: number) {
    this.translateMatrix = translate(x, y);
    return this;
  }
  protected left(..._v: string[]) {
    // svgjs handle translate first, the followings are same results.
    // console.log("trans/rotate", new G().translate(10, 20).rotate(10, 10, 20).svg());
    // console.log("rotate/trans", new G().rotate(10, 10, 20).translate(10, 20).svg());
    const matrixes = [this.translateMatrix, this.rotateMatrix].filter(
      (v) => v != null
    );
    return matrixes.length == 0
      ? super.left()
      : super.left(serializeGMatrix(compose(matrixes)));
  }
}

const svgHeaders = [
  `xmlns="http://www.w3.org/2000/svg"`,
  `version="1.1"`,
  `xmlns:xlink="http://www.w3.org/1999/xlink"`,
];

export class Svg extends Container {
  constructor() {
    super("svg");
  }
  private viewBox:
    | { x: number; y: number; width: number; height: number }
    | undefined;
  // Mark.left() を使わず自前で組み立てるため、属性の種類を増やしたらここにも足す。
  // css() で与えたスタイルは、ルートの svg を CSS の大きさで置くために使われる。
  protected left(): string {
    return `<${[
      this.type,
      ...svgHeaders,
      serializeAttrs(this.attrs),
      serializeStyles(this.styles),
      serializeViewBox(this.viewBox),
    ]
      .filter((v) => v != "")
      .join(" ")}>`;
  }
  /** ルートの svg は大きさを持つ。ページ側の CSS で上書きできる絶対値になる。 */
  size(width: number, height: number): this {
    this.attrs.width = width;
    this.attrs.height = height;
    return this;
  }
  viewbox(x: number, y: number, width: number, height: number) {
    this.viewBox = { x, y, width, height };
    return this;
  }
  importSymbol(input: string) {
    for (const elm of parse(input)) {
      this.add(elm);
    }
    return this;
  }
}

export function SVG() {
  return new Svg();
}

/**
 * 配置できる要素。中抽象が返す element の公開面。
 * 置き場所を決める操作だけを見せ、内部表現には触らせない。
 */
export interface Placeable {
  translate(x: number, y: number): this;
  rotate(angle: number, cx: number, cy: number): this;
}

/**
 * 利用者に見せる SVG の面。
 *
 * 具象クラスをそのまま返すと、基底クラス経由で内部表現（attrs / styles /
 * parent / type）の書き換えまで公開されてしまう。
 * 返す型をこのインターフェースに絞ることでそれらを隠す。
 */
export interface RenderedSvg {
  /** 表示領域。render が設定済みなので、合成するときだけ触る。 */
  viewbox(x: number, y: number, width: number, height: number): this;
  /** 絶対値の大きさ。width/height 属性になり、ページ側の CSS で上書きできる。 */
  size(width: number, height: number): this;
  /** CSS の単位での大きさ。style になり、ページ側の CSS では上書きされない。 */
  css(style: Record<string, string>): this;
  attr(attrs: Record<string, string>): this;
  add(element: Placeable): this;
  /** スプライトの symbol を読み込む。svgSprite を使う場合に必要。 */
  importSymbol(sprite: string): this;
  svg(): string;
}

/**
 * RenderedSvg の実体。内部の Svg を包み、見せる操作だけを転送する。
 *
 * 型だけ付け替える（Svg を RenderedSvg として返す）には二重キャストが要る。
 * add の引数が実装（SvgNode）と公開面（Placeable）で食い違い、
 * SvgNode の protected メンバのせいでどちら向きにも代入できないためで、
 * キャストするとその一点で型検査が切れてしまう。
 * 包んでしまえばキャストが要らず、内部表現へ手が届かないことも実際に保証される。
 */
class WrappedSvg implements RenderedSvg {
  constructor(private readonly inner: Svg) {}
  /** 内部の走査へ戻す。RenderedSvg には現れないので利用者からは呼べない。 */
  unwrap(): Svg {
    return this.inner;
  }
  viewbox(x: number, y: number, width: number, height: number): this {
    this.inner.viewbox(x, y, width, height);
    return this;
  }
  size(width: number, height: number): this {
    this.inner.size(width, height);
    return this;
  }
  css(style: Record<string, string>): this {
    this.inner.css(style);
    return this;
  }
  attr(attrs: Record<string, string>): this {
    this.inner.attr(attrs);
    return this;
  }
  add(element: Placeable): this {
    // Placeable を満たすのは G だけで、G は SvgNode でもある。
    // 利用者が自作の値を渡した場合はここで弾く。
    assert(
      element instanceof SvgNode,
      `unexpected element: not created by this library`,
    );
    this.inner.add(element);
    return this;
  }
  importSymbol(sprite: string): this {
    this.inner.importSymbol(sprite);
    return this;
  }
  svg(): string {
    return this.inner.svg();
  }
}

/** 組み立てた Svg を公開面へ絞る。 */
export const asRenderedSvg = (svg: Svg): RenderedSvg => new WrappedSvg(svg);

/** asRenderedSvg の逆。公開面で受け取った SVG を内部の走査に回すときだけ使う。 */
export const asSvg = (svg: RenderedSvg): Svg => {
  assert(svg instanceof WrappedSvg, `unexpected svg: not created by SVG()`);
  return svg.unwrap();
};

/**
 * 出力する小数の桁数。
 * 座標計算で出る 403.91999999999996 や、回転行列の 6.12e-17（実質 0）といった
 * 浮動小数点の誤差を落とす。1e-6 の誤差は SVG の描画では無視できる。
 */
const PRECISION = 6;

/**
 * SVG に出力する値の丸め。
 * 呼び出し側へ返す寸法も同じ丸めを通し、viewBox の値と一致させる。
 */
export const round = (v: number) => {
  // NaN や Infinity をそのまま通すと width="NaN" のような SVG ができ、
  // 原因から離れた場所（描画結果）でしか気づけない。
  assert(Number.isFinite(v), `unexpected non finite value: ${v}`);
  const r = Number(v.toFixed(PRECISION));
  // -0 を 0 に正規化する
  return r === 0 ? 0 : r;
};

const serializeValue = (v: unknown) =>
  typeof v === "number" ? String(round(v)) : escapeAttr(String(v));

/** 属性値として安全な文字列にする。利用者が渡す URL やフォント名が入る。 */
function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** テキストノードとして安全な文字列にする。 */
function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function serializeViewBox(
  v: { x: number; y: number; width: number; height: number } | undefined
) {
  if (v == null) return "";
  return `viewBox="${round(v.x)} ${round(v.y)} ${round(v.width)} ${round(
    v.height
  )}"`;
}

function serializeGMatrix(m: Matrix | undefined): string {
  if (m == null) return "";
  const rounded: Matrix = {
    a: round(m.a),
    b: round(m.b),
    c: round(m.c),
    d: round(m.d),
    e: round(m.e),
    f: round(m.f),
  };
  return `transform="${toSVG(rounded)}"`;
}

function serializeAttrs(attrs: Attrs): string {
  return Object.entries(attrs)
    .filter(([_, value]) => value !== undefined)
    .map(([key, value]) => `${key}="${serializeValue(value)}"`)
    .join(" ");
}

function serializeStyles(style: Styles): string {
  const s = Object.entries(style)
    .map(([k, v]) => {
      return `${k}: ${v};`;
    })
    .join(" ");
  return s != "" ? `style="${escapeAttr(s)}"` : "";
}

function* parse(input: string) {
  const parser = new XMLParser({ ignoreAttributes: false });
  const builder = new XMLBuilder({
    ignoreAttributes: false,
  });

  const doc = parser.parse(input);

  // symbol が 1 個だけの場合、fast-xml-parser は配列ではなく単体を返す。
  const found = doc?.svg?.symbol;
  const symbols =
    found == null ? [] : Array.isArray(found) ? found : [found];

  for (const symbol of symbols) {
    const v = builder.build(symbol) as string;
    const symobj = new Symbol(v);
    for (const [key, value] of Object.entries(symbol)) {
      if (key.startsWith("@_"))
        // remove the prefix
        symobj.attrs[key.substring(2)] = value;
    }
    yield symobj;
  }
}
