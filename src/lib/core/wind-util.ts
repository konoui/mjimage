import { Round, Wind, WIND } from ".";

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

export const nextRound = (r: Round) => {
  let w = r.substring(0, 2) as Wind;
  let n = Number(r.substring(2, 3));
  if (n == 4) {
    n = 1;
    w = nextWind(w);
  } else n++;
  return `${w}${n}` as Round;
};

export const prevRound = (r: Round) => {
  return nextRound(nextRound(nextRound(r)));
};

export const nextWind = (w: Wind): Wind => {
  let n = Number(w.toString()[0]);
  n = (n % 4) + 1;
  return `${n}w` as Wind;
};

export const prevWind = (w: Wind): Wind => {
  let n = Number(w.toString()[0]);
  n = (n % 2) + 1;
  return `${n}w` as Wind;
};
