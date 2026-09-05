/**
 * Deterministic seeded PRNG — xoshiro128** algorithm.
 *
 * Pure TypeScript, no external dependencies.
 * Provides a reproducible sequence for a given seed integer.
 * All dataset generation in Milestone 2 uses this exclusively.
 *
 * Reference: https://prng.di.unimi.it/xoshiro128starstar.c
 */

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/**
 * Creates a deterministic pseudo-random number generator seeded with
 * four 32-bit unsigned integers.  We derive the four state words from
 * a single integer seed using a simple splitmix32 expansion.
 */
function splitmix32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul((z ^ (z >>> 16)), 0x85ebca6b) >>> 0;
    z = Math.imul((z ^ (z >>> 13)), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
}

export interface SeededRng {
  /** Integer in [0, 2^32) */
  nextUint32(): number;
  /** Float in [0, 1) */
  nextFloat(): number;
  /** Integer in [min, max] (inclusive both ends) */
  nextInt(min: number, max: number): number;
  /** Pick one element from an array */
  pick<T>(arr: readonly T[]): T;
  /** Shuffle array in-place (Fisher-Yates) */
  shuffle<T>(arr: T[]): T[];
}

/**
 * Create a seeded deterministic RNG.
 * Same seed → same sequence every time.
 *
 * @param seed - integer seed (e.g. 42 for the canonical Eval A dataset)
 */
export function createRng(seed: number): SeededRng {
  const sm = splitmix32(seed);
  // Expand seed into four 32-bit state words
  let s0 = sm();
  let s1 = sm();
  let s2 = sm();
  let s3 = sm();

  function nextUint32(): number {
    const result = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (s1 << 9) >>> 0;
    s2 ^= s0;
    s3 ^= s1;
    s1 ^= s2;
    s0 ^= s3;
    s2 ^= t;
    s3 = rotl(s3, 11);
    return result;
  }

  function nextFloat(): number {
    return nextUint32() / 0x1_0000_0000;
  }

  function nextInt(min: number, max: number): number {
    return Math.floor(nextFloat() * (max - min + 1)) + min;
  }

  function pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error("pick: empty array");
    const val = arr[nextInt(0, arr.length - 1)];
    if (val === undefined) throw new Error("pick: index out of bounds");
    return val;
  }

  function shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = nextInt(0, i);
      const tmp = arr[i];
      const src = arr[j];
      if (tmp !== undefined && src !== undefined) {
        arr[i] = src;
        arr[j] = tmp;
      }
    }
    return arr;
  }

  return { nextUint32, nextFloat, nextInt, pick, shuffle };
}
