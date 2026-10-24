import type { ObjectType } from '../geometry/types'

const SOLID_NAMES: Partial<Record<ObjectType, string>> = {
  sphere: 'küre',
  prism: 'prizma',
  pyramid: 'piramit',
  cylinder: 'silindir',
  cone: 'koni',
}

function alphabetOf(type: ObjectType): string {
  if (type === 'point') return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  if (type === 'angle') return 'αβγδεθ'
  if (type === 'plane') return 'pqrstuvw'
  return 'abcdefghijklmnopqrstuvwxyz'
}

/** Naming uses a supplied snapshot, so a rejected construction reserves no names. */
export function createObjectName(type: ObjectType, names: Iterable<string>): string {
  const occupied = new Set(names)
  const word = SOLID_NAMES[type]
  if (word) {
    let index = 1
    while (occupied.has(`${word}${index}`)) index++
    return `${word}${index}`
  }
  const alphabet = alphabetOf(type)
  for (let index = 0; ; index++) {
    const suffix = index < alphabet.length ? '' : String(Math.floor(index / alphabet.length))
    const candidate = alphabet[index % alphabet.length]! + suffix
    if (!occupied.has(candidate)) return candidate
  }
}
