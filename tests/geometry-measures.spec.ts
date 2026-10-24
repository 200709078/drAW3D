import { expect, test } from '@playwright/test'
import { measure, type MeasureTarget } from '../src/geometry/measures'
import { initialSidePoint, lineShape, planeShape, polyhedronShape, roundShape, sphereShape } from '../src/geometry/solids'
import type { MeasureKind } from '../src/geometry/types'
import { vec, type Vec3 } from '../src/geometry/vec3'

const point = (x: number, y: number, z: number): MeasureTarget => ({ kind: 'point', position: vec(x, y, z) })
const segment = (a: Vec3, b: Vec3) => lineShape('segment', a, b)!
const ray = (a: Vec3, b: Vec3) => lineShape('ray', a, b)!
const line = (a: Vec3, b: Vec3) => lineShape('line', a, b)!
const ground = planeShape(vec(0, 0, 0), vec(1, 0, 0), vec(0, 0, 1))!

function value(kind: MeasureKind, ...targets: MeasureTarget[]): number {
  const outcome = measure(kind, targets)
  if (!outcome.ok) throw new Error(outcome.error)
  return outcome.result.value
}

test('nokta ile nokta, doğru, doğru parçası, ışın ve düzlem arası uzaklık', () => {
  expect(value('distance', point(0, 0, 0), point(3, 4, 0))).toBeCloseTo(5, 12)
  const xAxis = [vec(0, 0, 0), vec(1, 0, 0)] as const
  expect(value('distance', point(5, 3, 4), line(...xAxis))).toBeCloseTo(5, 12)
  // The segment ends at x = 1 and the ray starts at x = 0.
  expect(value('distance', point(4, 4, 0), segment(...xAxis))).toBeCloseTo(5, 12)
  expect(value('distance', point(-3, 4, 0), ray(...xAxis))).toBeCloseTo(5, 12)
  expect(value('distance', point(-3, 4, 0), line(...xAxis))).toBeCloseTo(4, 12)
  expect(value('distance', point(1, -2, 7), ground)).toBeCloseTo(2, 12)
  expect(value('distance', ground, point(1, -2, 7))).toBeCloseTo(2, 12)
  const result = measure('distance', [point(1, 3, 1), ground])
  expect(result.ok && result.result.from).toEqual(vec(1, 3, 1))
  expect(result.ok && result.result.to).toEqual(vec(1, 0, 1))
})

test('aykırı, paralel ve kesişen doğrular', () => {
  const xLine = line(vec(0, 0, 0), vec(1, 0, 0))
  const skew = line(vec(0, 3, 0), vec(0, 3, 1))
  expect(value('distance', xLine, skew)).toBeCloseTo(3, 12)
  const parallel = line(vec(5, 2, 0), vec(6, 2, 0))
  expect(value('distance', xLine, parallel)).toBeCloseTo(2, 12)
  expect(value('distance', xLine, line(vec(2, -1, 0), vec(2, 1, 0)))).toBeCloseTo(0, 12)
  // Segments: the closest points are on their ends.
  expect(value('distance', segment(vec(0, 0, 0), vec(1, 0, 0)), segment(vec(3, 0, 1), vec(3, 0, 5)))).toBeCloseTo(Math.hypot(2, 1), 12)
  expect(value('distance', segment(vec(0, 0, 0), vec(1, 0, 0)), segment(vec(3, 0, 0), vec(5, 0, 0)))).toBeCloseTo(2, 12)
})

test('doğru ile düzlem, düzlem ile düzlem', () => {
  expect(value('distance', line(vec(0, 2, 0), vec(1, 2, 0)), ground)).toBeCloseTo(2, 12)
  expect(value('distance', line(vec(0, 2, 0), vec(1, 1, 0)), ground)).toBe(0)
  expect(value('distance', segment(vec(0, 2, 0), vec(1, 1, 0)), ground)).toBeCloseTo(1, 12)
  const raised = planeShape(vec(0, 3, 0), vec(1, 3, 0), vec(0, 3, 1))!
  expect(value('distance', ground, raised)).toBeCloseTo(3, 12)
  const wall = planeShape(vec(0, 0, 0), vec(1, 0, 0), vec(0, 1, 0))!
  expect(value('distance', ground, wall)).toBe(0)
})

test('iki doğru, doğru ile düzlem, iki düzlem arasındaki dar açı', () => {
  const xLine = line(vec(0, 0, 0), vec(1, 0, 0))
  expect(value('angle', xLine, line(vec(0, 0, 0), vec(1, 1, 0)))).toBeCloseTo(45, 9)
  expect(value('angle', xLine, line(vec(0, 0, 0), vec(-1, 1, 0)))).toBeCloseTo(45, 9)
  expect(value('angle', line(vec(0, 0, 0), vec(1, 1, 0)), ground)).toBeCloseTo(45, 9)
  expect(value('angle', ground, line(vec(0, 0, 0), vec(0, 5, 0)))).toBeCloseTo(90, 9)
  const tilted = planeShape(vec(0, 0, 0), vec(1, 0, 0), vec(0, 1, 1))!
  expect(value('angle', ground, tilted)).toBeCloseTo(45, 9)
  expect(measure('angle', [point(0, 0, 0), ground])).toEqual({ ok: false, error: 'İki nesne arasındaki açı iki doğru veya düzlem ister.' })
})

test('uzunluk, taban alanı, yüzey alanı ve hacim', () => {
  expect(value('length', segment(vec(0, 0, 0), vec(3, 4, 12)))).toBeCloseTo(13, 12)
  expect(measure('length', [line(vec(0, 0, 0), vec(1, 0, 0))]).ok).toBe(false)
  const a = vec(0, 0, 0)
  const b = vec(2, 0, 0)
  const cube = polyhedronShape('prism', a, b, initialSidePoint(a, b), 4, 2)!
  expect(value('baseArea', cube)).toBeCloseTo(4, 12)
  expect(value('surfaceArea', cube)).toBeCloseTo(24, 12)
  expect(value('volume', cube)).toBeCloseTo(8, 12)
  const pyramid = polyhedronShape('pyramid', a, b, initialSidePoint(a, b), 4, 3)!
  expect(value('volume', pyramid)).toBeCloseTo(4, 12)
  const cone = roundShape('cone', a, vec(3, 0, 0), 4)!
  expect(value('baseArea', cone)).toBeCloseTo(9 * Math.PI, 12)
  expect(value('surfaceArea', cone)).toBeCloseTo(Math.PI * 3 * 5 + 9 * Math.PI, 12)
  expect(value('volume', roundShape('cylinder', a, vec(1, 0, 0), 2)!)).toBeCloseTo(2 * Math.PI, 12)
  const ball = sphereShape(a, vec(0, 2, 0))!
  expect(value('volume', ball)).toBeCloseTo(32 / 3 * Math.PI, 12)
  expect(value('surfaceArea', ball)).toBeCloseTo(16 * Math.PI, 12)
  expect(measure('baseArea', [ball])).toEqual({ ok: false, error: 'Kürenin tabanı yoktur.' })
  expect(measure('volume', [ground])).toEqual({ ok: false, error: 'Bu ölçüm bir cisim ister.' })
})
