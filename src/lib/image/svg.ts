import { translate, compose, rotateDEG, Matrix } from "transformation-matrix";
import { XMLParser, XMLBuilder } from "fast-xml-parser";

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

export abstract class Mark {
  type: string;
  attrs: Attrs = {};
  styles: Styles = {};
  private deleteMarker = false;
  constructor(type: string) {
    this.type = type;
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
  size(width: number, height: number): this {
    this.attrs.width = width;
    this.attrs.height = height;
    return this;
  }
  remove() {
    this.deleteMarker = true;
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
    if (this.deleteMarker) return "";
    return `${this.left()}${this.center()}${this.right()}`;
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
    console.log(this.styles);
    return this;
  }
  svg() {
    return this.toString();
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
  attrs: Attrs & { fontFamily?: string; fontSize?: number };
  private _text: string = "";
  private isPlain: boolean = false;
  constructor(text = "") {
    super("text");
    this._text = text;
    this.attrs = {};
  }
  text(text: string) {
    this.isPlain = false;
    // FIXME
    this.plain(text);
    return this;
  }
  plain(text: string) {
    this.isPlain = true;
    this._text = text;
    return this;
  }
  font(font: { family: string; size: number }) {
    this.attrs.fontFamily = font.family;
    this.attrs.fontSize = font.size;
    return this;
  }
  protected center() {
    return this._text;
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

export class G extends Mark {
  children: Mark[] = [];
  private matrix: Matrix | undefined;
  constructor() {
    super("g");
  }
  add(e: Mark) {
    this.children.push(e);
    return this;
  }
  rotate(angle: number, cx: number, cy: number) {
    this.compose(rotateDEG(angle, cx, cy));
    return this;
  }
  translate(x: number, y: number) {
    this.compose(translate(x, y));
    return this;
  }
  private compose(m: Matrix) {
    this.matrix = this.matrix == null ? m : compose(this.matrix, m);
  }
  protected center() {
    return this.children.map((c) => c.toString()).join("");
  }
  protected left(...v: string[]) {
    return super.left(serializeGMatrix(this.matrix));
  }
}

const svgHeaders = [
  `xmlns="http://www.w3.org/2000/svg"`,
  `version="1.1"`,
  `xmlns:xlink="http://www.w3.org/1999/xlink"`,
];

export class Svg extends Mark {
  children: Mark[] = [];
  constructor() {
    super("svg");
  }
  private viewBox:
    | { x: number; y: number; width: number; height: number }
    | undefined;
  add(e: Mark) {
    this.children.push(e);
    return this;
  }
  protected center() {
    return this.children.map((c) => c.toString()).join("");
  }
  protected left(...v: string[]): string {
    return `<${[
      this.type,
      ...svgHeaders,
      serializeAttrs(this.attrs),
      serializeViewBox(this.viewBox),
    ]
      .filter((v) => v != "")
      .join(" ")}>`;
  }
  viewbox(x: number, y: number, width: number, height: number) {
    this.viewBox = { x, y, width, height };
    return this;
  }
  importSymbol(input: string) {
    for (const elm of parse(input)) {
      this.add(elm);
    }
  }
  x(x: number): this {
    throw new Error("unimplemented");
  }
  y(y: number): this {
    throw new Error("unimplemented");
  }
  dx(x: number): this {
    throw new Error("unimplemented");
  }
  dy(y: number): this {
    throw new Error("unimplemented");
  }
  each(block: (idx: number, children: Mark[]) => void, deep: boolean) {
    for (let i = 0; i < this.children.length; i++) {
      //
      // if (child instanceof G) {
      //   if (deep) {
      //     child.each(block) // g does not have each
      //   }
      // }
      block(i, this.children);
    }
  }
}

export function SVG() {
  return new Svg();
}
export const MySVG = SVG;
export const MyG = G;
export const MyImage = Image;
export const MyUse = Use;
export const MyRect = Rect;
export const MyText = Text;
export const Element = Mark;

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (match) => "-" + match.toLowerCase());
}

function serializeViewBox(
  v: { x: number; y: number; width: number; height: number } | undefined
) {
  if (v == null) return "";
  return `viewBox="${v.x} ${v.y} ${v.width} ${v.height}"`;
}

function serializeGMatrix(m: Matrix | undefined): string {
  if (m == null) return "";
  return `transform="matrix(${m.a},${m.b},${m.c},${m.d},${m.e},${m.f})"`;
}

function serializeAttrs(attrs: Attrs): string {
  return Object.entries(attrs)
    .filter(([_, value]) => value !== undefined)
    .map(([key, value]) => `${camelToSnake(key)}="${value}"`)
    .join(" ");
}

function serializeStyles(style: Styles): string {
  const s = Object.entries(style)
    .map(([k, v]) => {
      return `${k}: ${v};`;
    })
    .join(" ");
  return s != "" ? `style="${s}"` : "";
}

export function* parse(input: string) {
  const parser = new XMLParser({ ignoreAttributes: false });
  const builder = new XMLBuilder({
    ignoreAttributes: false,
  });

  const doc = parser.parse(input);

  for (const symbol of doc.svg.symbol) {
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
