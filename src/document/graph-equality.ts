/** Compare cloneable model fields, including shared references and NaN coordinates.
 * Prototypes are intentionally ignored: structuredClone restores plain models.
 */
export function equalModelGraphs(first: unknown, second: unknown): boolean {
  const pairs: [unknown, unknown][] = [[first, second]]
  const forwards = new WeakMap<object, object>()
  const backwards = new WeakMap<object, object>()
  while (pairs.length) {
    const pair = pairs.pop()!
    const [left, right] = pair
    if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
      if (!Object.is(left, right)) return false
      continue
    }
    if (forwards.has(left) || backwards.has(right)) {
      if (forwards.get(left) !== right || backwards.get(right) !== left) return false
      continue
    }
    forwards.set(left, right)
    backwards.set(right, left)
    if (Array.isArray(left) !== Array.isArray(right)) return false
    if (Array.isArray(left) && Array.isArray(right) && left.length !== right.length) return false
    const keys = Object.keys(left)
    if (keys.length !== Object.keys(right).length) return false
    for (const key of keys) {
      if (!Object.hasOwn(right, key)) return false
      const leftValue: unknown = Reflect.get(left, key)
      const rightValue: unknown = Reflect.get(right, key)
      pairs.push([leftValue, rightValue])
    }
  }
  return true
}
