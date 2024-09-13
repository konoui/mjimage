import { Wind, WIND } from "../core/constants";

export function createWindMap<T>(initial: T, clone = false) {
  const m: { [key in Wind]: T } = {
    [WIND.EAST]: initial,
    [WIND.SOUTH]: initial,
    [WIND.WEST]: initial,
    [WIND.NORTH]: initial,
  };
  if (clone) {
    for (let w of Object.values(WIND)) m[w] = structuredClone(initial);
  }

  return m;
}
