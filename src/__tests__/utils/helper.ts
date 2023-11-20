import fs from "fs";
import path from "path";
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
