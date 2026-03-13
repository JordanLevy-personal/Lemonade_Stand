import type { RngState } from './types'

const UINT_32 = 4_294_967_296

export function normalizeSeed(seed: number): number {
  return (seed >>> 0) || 1
}

export function nextFloat(rng: RngState): [number, RngState] {
  const nextSeed = normalizeSeed(rng.seed + 0x6d2b79f5)
  let mixed = nextSeed
  mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
  const value = ((mixed ^ (mixed >>> 14)) >>> 0) / UINT_32

  return [value, { seed: nextSeed }]
}

export function nextInt(rng: RngState, maxExclusive: number): [number, RngState] {
  const [value, nextRng] = nextFloat(rng)
  return [Math.floor(value * maxExclusive), nextRng]
}
