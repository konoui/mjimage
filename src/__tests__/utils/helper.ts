import fs from "fs";
import path from "path";

import { SVG, registerWindow } from "@svgdotjs/svg.js";
import { createHTMLWindow } from "svgdom";
// @ts-ignore, https://github.com/DefinitelyTyped/DefinitelyTyped/pull/66501/files
import { config } from "svgdom";

export const loadTestData = (
  filename: string,
  data: string = "",
  update: boolean = false
) => {
  const current_dir = path.resolve("");
  const gotPath = `${current_dir}/src/__tests__/__snapshots__/${filename}`;
  if (update) fs.writeFileSync(gotPath, data);
  const want = fs.readFileSync(gotPath);
  return want;
};

export const initSvgDOM = () => {
  const window = createHTMLWindow();
  const document = window.document;
  registerWindow(window, document);

  config.setFontDir("./node_modules/svgdom/fonts/");
  return { window, document };
};
