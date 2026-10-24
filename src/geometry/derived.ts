import { closestBetweenLines, interval, type MeasureTarget } from './measures'
import type { LineShape, PlaneShape, SphereShape } from './solids'
import type { ConstructRule } from './types'
import {
  EPSILON, addScaled, anyPerpendicular, cross, distance, dot, length, lerp, normalize, scale, sub, type Vec3,
} from './vec3'

/** What a constructed point reads: positions of points and shapes of other objects. */
export type DerivedSource = MeasureTarget

/** Two points closer than this are the same intersection. */
const MEET = 1e-6

function inside(line: LineShape, t: number): boolean {
  const [min, max] = interval(line)
  return t >= min - 1e-9 && t <= max + 1e-9
}

/** Where a line component meets another line, if they meet. */
function lineLine(first: LineShape, second: LineShape): Vec3 | null {
  const [p, q] = closestBetweenLines(first, second)
  const scaleOf = Math.max(1, length(sub(first.b, first.a)), length(sub(second.b, second.a)))
  if (distance(p, q) > MEET * scaleOf) return null
  // Parallel lines that overlap have no single intersection.
  if (length(cross(first.direction, second.direction)) < 1e-9) return null
  return lerp(p, q, 0.5)
}

function linePlane(line: LineShape, plane: PlaneShape): Vec3 | null {
  const d = sub(line.b, line.a)
  const along = dot(d, plane.normal)
  if (Math.abs(along) < EPSILON) return null
  const t = -dot(sub(line.a, plane.center), plane.normal) / along
  return inside(line, t) ? addScaled(line.a, d, t) : null
}

/** Intersections of a line component with a sphere, ordered along the line. */
function lineSphere(line: LineShape, sphere: SphereShape): Vec3[] {
  const d = sub(line.b, line.a)
  const w = sub(line.a, sphere.center)
  const a = dot(d, d)
  const b = 2 * dot(w, d)
  const c = dot(w, w) - sphere.radius ** 2
  const discriminant = b * b - 4 * a * c
  if (discriminant < 0) return []
  const root = Math.sqrt(discriminant)
  const ts = discriminant < 1e-12 * b * b ? [-b / (2 * a)] : [(-b - root) / (2 * a), (-b + root) / (2 * a)]
  return ts.filter(t => inside(line, t)).map(t => addScaled(line.a, d, t))
}

/** The line where two planes meet: a point (nearest the origin) and a unit direction. */
export function planesMeet(first: PlaneShape, second: PlaneShape): { point: Vec3; direction: Vec3 } | null {
  const direction = normalize(cross(first.normal, second.normal))
  if (!direction) return null
  const [n1, n2] = [first.normal, second.normal]
  const [d1, d2] = [dot(n1, first.center), dot(n2, second.center)]
  const n12 = dot(n1, n2)
  const determinant = 1 - n12 * n12
  const point = addScaled(scale(n1, (d1 - d2 * n12) / determinant), n2, (d2 - d1 * n12) / determinant)
  return { point, direction }
}

/** How many points `Kesiştir` gives for a pair of sources (0 when not supported). */
export function intersectionCount(first: DerivedSource, second: DerivedSource): number {
  const kinds = [first.kind, second.kind].sort().join('+')
  if (kinds === 'line+sphere') return 2
  return kinds === 'line+line' || kinds === 'line+plane' ? 1 : 0
}

function intersection(first: DerivedSource, second: DerivedSource, index: number): Vec3 | null {
  const [a, b] = first.kind <= second.kind ? [first, second] : [second, first]
  if (a.kind === 'line' && b.kind === 'line') return index === 0 ? lineLine(a, b) : null
  if (a.kind === 'line' && b.kind === 'plane') return index === 0 ? linePlane(a, b) : null
  if (a.kind === 'line' && b.kind === 'sphere') return lineSphere(a, b)[index] ?? null
  return null
}

/** Foot of the perpendicular from a point to a line (unbounded) or a plane. */
function project(point: Vec3, target: DerivedSource): Vec3 | null {
  if (target.kind === 'line') return addScaled(target.a, target.direction, dot(sub(point, target.a), target.direction))
  if (target.kind === 'plane') return addScaled(point, target.normal, -dot(sub(point, target.center), target.normal))
  return null
}

/** Two unit axes square to a line's direction, or a plane's own axes. */
function basis(target: DerivedSource): [Vec3, Vec3] | null {
  if (target.kind === 'plane') return [target.u, target.v]
  if (target.kind !== 'line') return null
  const first = anyPerpendicular(target.direction)
  return [first, cross(target.direction, first)]
}

/** Position of a constructed point, or null when it is undefined for the current sources. */
export function derivedPosition(rule: ConstructRule, sources: readonly DerivedSource[], index = 0): Vec3 | null {
  const [first, second] = sources
  if (!first) return null
  switch (rule) {
    case 'midpoint':
      if (first.kind === 'line' && !second) return first.extent === 'segment' ? lerp(first.a, first.b, 0.5) : null
      return first.kind === 'point' && second?.kind === 'point' ? lerp(first.position, second.position, 0.5) : null
    case 'intersect':
      return second ? intersection(first, second, index) : null
    case 'project':
      return first.kind === 'point' && second ? project(first.position, second) : null
    case 'along': {
      if (first.kind !== 'point' || !second) return null
      const direction = second.kind === 'line' ? second.direction : second.kind === 'plane' ? second.normal : null
      return direction ? addScaled(first.position, direction, 1) : null
    }
    case 'basis': {
      const axes = first.kind === 'point' && second ? basis(second) : null
      return axes && first.kind === 'point' ? addScaled(first.position, axes[index === 1 ? 1 : 0], 1) : null
    }
    case 'planeMeet': {
      if (first.kind !== 'plane' || second?.kind !== 'plane') return null
      const meet = planesMeet(first, second)
      return meet ? addScaled(meet.point, meet.direction, index === 1 ? 1 : 0) : null
    }
  }
}
