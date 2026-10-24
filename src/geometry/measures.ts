import { polygonArea, solidVolume, surfaceArea, type LineShape, type PlaneShape, type Shape } from './solids'
import type { MeasureKind } from './types'
import {
  EPSILON, add, addScaled, angleBetween, centroid, clamp, cross, distance, dot, length, lerp, scale, sub, toDegrees,
  type Vec3,
} from './vec3'

/** What a measure reads: a point's position or another object's shape. */
export type MeasureTarget = { kind: 'point'; position: Vec3 } | Shape

export type MeasureUnit = 'length' | 'angle' | 'area' | 'volume'

export interface MeasureResult {
  value: number
  unit: MeasureUnit
  /** Where the value is written in the scene. */
  anchor: Vec3
  /** The shortest connection a distance is measured along. */
  from?: Vec3
  to?: Vec3
}

export type MeasureOutcome = { ok: true; result: MeasureResult } | { ok: false; error: string }

export const MEASURE_UNITS: Readonly<Record<MeasureKind, MeasureUnit>> = {
  length: 'length', distance: 'length', angle: 'angle', baseArea: 'area', surfaceArea: 'area', volume: 'volume',
}

/** Allowed parameter interval of a line kind along a → b (in units of |b − a|). */
export function interval(line: LineShape): [number, number] {
  if (line.extent === 'segment') return [0, 1]
  if (line.extent === 'ray') return [0, Infinity]
  return [-Infinity, Infinity]
}

function closestOnLine(line: LineShape, point: Vec3): Vec3 {
  const d = sub(line.b, line.a)
  const [min, max] = interval(line)
  return addScaled(line.a, d, clamp(dot(sub(point, line.a), d) / dot(d, d), min, max))
}

/** Closest points of two straight components (lines, rays, segments). */
export function closestBetweenLines(first: LineShape, second: LineShape): [Vec3, Vec3] {
  const d1 = sub(first.b, first.a)
  const d2 = sub(second.b, second.a)
  const r = sub(first.a, second.a)
  const [a, e, b] = [dot(d1, d1), dot(d2, d2), dot(d1, d2)]
  const [c, f] = [dot(d1, r), dot(d2, r)]
  const [min1, max1] = interval(first)
  const [min2, max2] = interval(second)
  const denominator = a * e - b * b
  // Parallel: any s works; start from the clamped projection of the second start.
  let s = denominator > EPSILON * a * e ? clamp((b * f - c * e) / denominator, min1, max1) : clamp(-c / a, min1, max1)
  if (!Number.isFinite(s)) s = 0
  let t = clamp((b * s + f) / e, min2, max2)
  // Re-solve s for the clamped t, then t once more for the clamped s.
  s = clamp((b * t - c) / a, min1, max1)
  t = clamp((b * s + f) / e, min2, max2)
  return [addScaled(first.a, d1, s), addScaled(second.a, d2, t)]
}

function signedDistance(plane: PlaneShape, point: Vec3): number {
  return dot(sub(point, plane.center), plane.normal)
}

function linePlane(line: LineShape, plane: PlaneShape): [Vec3, Vec3] {
  const d = sub(line.b, line.a)
  const [min, max] = interval(line)
  const along = dot(d, plane.normal)
  const start = signedDistance(plane, line.a)
  // Where the line meets the plane, clamped to the component; parallel lines are equally far everywhere.
  const t = Math.abs(along) < EPSILON ? clamp(0, min, max) : clamp(-start / along, min, max)
  const point = addScaled(line.a, d, Number.isFinite(t) ? t : 0)
  return [point, addScaled(point, plane.normal, -signedDistance(plane, point))]
}

function planePlane(first: PlaneShape, second: PlaneShape): [Vec3, Vec3] | null {
  // Only parallel planes are apart; intersecting ones are at distance 0.
  if (length(cross(first.normal, second.normal)) > 1e-9) return null
  return [first.center, addScaled(first.center, second.normal, -signedDistance(second, first.center))]
}

type Linear = { kind: 'point'; position: Vec3 } | LineShape | PlaneShape

function isLinear(target: MeasureTarget): target is Linear {
  return target.kind === 'point' || target.kind === 'line' || target.kind === 'plane'
}

/** Closest points of two points, lines or planes; null when they intersect (distance 0, no direction). */
function closestPoints(first: Linear, second: Linear): [Vec3, Vec3] | 'intersect' {
  if (first.kind === 'point' && second.kind === 'point') return [first.position, second.position]
  if (first.kind === 'point' && second.kind === 'line') return [first.position, closestOnLine(second, first.position)]
  if (first.kind === 'point' && second.kind === 'plane') {
    return [first.position, addScaled(first.position, second.normal, -signedDistance(second, first.position))]
  }
  if (first.kind === 'line' && second.kind === 'line') return closestBetweenLines(first, second)
  if (first.kind === 'line' && second.kind === 'plane') return linePlane(first, second)
  if (first.kind === 'plane' && second.kind === 'plane') return planePlane(first, second) ?? 'intersect'
  const swapped = closestPoints(second, first)
  return swapped === 'intersect' ? swapped : [swapped[1], swapped[0]]
}

function direction(target: LineShape | PlaneShape): Vec3 {
  return target.kind === 'line' ? target.direction : target.normal
}

/** Acute angle in degrees between two lines, a line and a plane, or two planes. */
function angleOf(first: LineShape | PlaneShape, second: LineShape | PlaneShape): number {
  const between = toDegrees(angleBetween(direction(first), direction(second)))
  const acute = Math.min(between, 180 - between)
  // A line meets a plane at the complement of its angle with the normal.
  return first.kind === second.kind ? acute : 90 - acute
}

function centerOf(shape: Shape): Vec3 {
  switch (shape.kind) {
    case 'line': return scale(add(shape.start, shape.end), 0.5)
    case 'plane': return shape.center
    case 'angle': return shape.vertex
    case 'sphere': return shape.center
    case 'polyhedron': return centroid(shape.vertices)
    case 'round': return lerp(shape.baseCenter, shape.top, 0.4)
    case 'section': return shape.center
  }
}

/** The value of a measure of its targets, or why it cannot be measured. */
export function measure(kind: MeasureKind, targets: readonly MeasureTarget[]): MeasureOutcome {
  const unit = MEASURE_UNITS[kind]
  const [first, second] = targets
  switch (kind) {
    case 'length': {
      if (targets.length !== 1 || first?.kind !== 'line' || first.extent !== 'segment') {
        return { ok: false, error: 'Uzunluk bir doğru parçası ister.' }
      }
      return { ok: true, result: { value: distance(first.a, first.b), unit, anchor: scale(add(first.a, first.b), 0.5) } }
    }
    case 'distance': {
      if (targets.length !== 2 || !first || !second || !isLinear(first) || !isLinear(second)) {
        return { ok: false, error: 'Uzaklık iki nokta, doğru veya düzlem ister.' }
      }
      const closest = closestPoints(first, second)
      if (closest === 'intersect') {
        const anchor = first.kind === 'plane' ? first.center : first.kind === 'line' ? first.a : first.position
        return { ok: true, result: { value: 0, unit, anchor } }
      }
      const [from, to] = closest
      return { ok: true, result: { value: distance(from, to), unit, anchor: scale(add(from, to), 0.5), from, to } }
    }
    case 'angle': {
      if (targets.length !== 2 || !first || !second || (first.kind !== 'line' && first.kind !== 'plane')
        || (second.kind !== 'line' && second.kind !== 'plane')) {
        return { ok: false, error: 'İki nesne arasındaki açı iki doğru veya düzlem ister.' }
      }
      const anchor = scale(add(centerOf(first), centerOf(second)), 0.5)
      return { ok: true, result: { value: angleOf(first, second), unit, anchor } }
    }
    case 'baseArea':
    case 'surfaceArea':
    case 'volume': {
      // A section's area is its own.
      if (kind === 'baseArea' && targets.length === 1 && first?.kind === 'section') {
        return { ok: true, result: { value: first.area, unit, anchor: first.center } }
      }
      if (targets.length !== 1 || !first || first.kind === 'point'
        || (first.kind !== 'sphere' && first.kind !== 'polyhedron' && first.kind !== 'round')) {
        return { ok: false, error: 'Bu ölçüm bir cisim ister.' }
      }
      if (first.kind === 'sphere') {
        if (kind === 'baseArea') return { ok: false, error: 'Kürenin tabanı yoktur.' }
        const r = first.radius
        const value = kind === 'volume' ? 4 / 3 * Math.PI * r ** 3 : 4 * Math.PI * r * r
        return { ok: true, result: { value, unit, anchor: first.center } }
      }
      const value = kind === 'volume' ? solidVolume(first)
        : kind === 'surfaceArea' ? surfaceArea(first)
          : first.kind === 'polyhedron' ? polygonArea(first.base) : Math.PI * first.radius ** 2
      return { ok: true, result: { value, unit, anchor: centerOf(first) } }
    }
  }
}
