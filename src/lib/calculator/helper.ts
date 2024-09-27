import { Wind, WIND } from "../core/constants";

export function createWindMap<T>(initial: T, clone = false) {
  const m: { [key in Wind]: T } = {
    [WIND.E]: initial,
    [WIND.S]: initial,
    [WIND.W]: initial,
    [WIND.N]: initial,
  };
  if (clone) {
    for (let w of Object.values(WIND)) m[w] = structuredClone(initial);
  }

  return m;
}
