import type { MeasureKind, ObjectType, RegularKind } from '../geometry/types'

/** Objects named by a word and a number: `prizma1`, `hacim2`. */
const WORD_NAMES: Partial<Record<NameGroup, string>> = {
  sphere: 'küre',
  prism: 'prizma',
  pyramid: 'piramit',
  cylinder: 'silindir',
  cone: 'koni',
  length: 'uzunluk',
  distance: 'uzaklık',
  baseArea: 'alan',
  surfaceArea: 'yüzeyAlanı',
  volume: 'hacim',
  edge: 'kenar',
  radius: 'yarıçap',
  helper: 'yardımcı',
  frustum: 'kesikPiramit',
  frustumCone: 'kesikKoni',
  tetrahedron: 'dörtyüzlü',
  cube: 'küp',
  octahedron: 'sekizyüzlü',
  dodecahedron: 'onikiyüzlü',
  icosahedron: 'yirmiyüzlü',
  section: 'kesit',
}

/**
 * Object types, measure kinds for measures (`angle` names both kinds of angle), and the
 * helper segments of solids (`edge`) and spheres (`radius`) and the hidden points of
 * constructed lines and planes (`helper`), which keep the short names free.
 */
export type NameGroup = Exclude<ObjectType, 'measure' | 'regular'> | MeasureKind | 'edge' | 'radius' | 'helper'
  | 'frustum' | 'frustumCone' | RegularKind

function alphabetOf(group: NameGroup): string {
  if (group === 'point') return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  if (group === 'angle') return 'αβγδεθ'
  if (group === 'plane') return 'pqrstuvw'
  // Parameters avoid the coordinate names x, y, z and the constants e and i.
  if (group === 'parameter') return 'abcdkmnrstuvw'
  return 'abcdefghijklmnopqrstuvwxyz'
}

/** Naming uses a supplied snapshot, so a rejected construction reserves no names. */
export function createObjectName(group: NameGroup, names: Iterable<string>): string {
  const occupied = new Set(names)
  const word = WORD_NAMES[group]
  if (word) {
    let index = 1
    while (occupied.has(`${word}${index}`)) index++
    return `${word}${index}`
  }
  const alphabet = alphabetOf(group)
  for (let index = 0; ; index++) {
    const suffix = index < alphabet.length ? '' : String(Math.floor(index / alphabet.length))
    const candidate = alphabet[index % alphabet.length]! + suffix
    if (!occupied.has(candidate)) return candidate
  }
}
