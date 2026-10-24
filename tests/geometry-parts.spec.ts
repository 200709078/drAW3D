import { expect, test } from '@playwright/test'
import { nearestPart, partsOf, type Part } from '../src/geometry/parts'
import {
  angleShape, initialSidePoint, lineShape, planeShape, polyhedronShape, roundShape, sphereShape, type Shape,
} from '../src/geometry/solids'
import { distance, dot, length, vec, type Ray, type Vec3 } from '../src/geometry/vec3'

const a = vec(0, 0, 0)
const b = vec(4, 0, 0)

const shapes: Record<string, Shape> = {
  segment: lineShape('segment', vec(1, 1, 1), vec(5, 2, -1))!,
  line: lineShape('line', vec(1, 1, 1), vec(5, 2, -1))!,
  ray: lineShape('ray', vec(1, 1, 1), vec(5, 2, -1))!,
  plane: planeShape(vec(0, 1, 0), vec(3, 1, 0), vec(0, 2, 3))!,
  angle: angleShape(vec(3, 0, 0), vec(0, 0, 0), vec(0, 0, 3))!,
  sphere: sphereShape(vec(1, 2, 3), vec(1, 2, 6))!,
  prism: polyhedronShape('prism', a, b, initialSidePoint(a, b), 5, 3)!,
  pyramid: polyhedronShape('pyramid', a, b, initialSidePoint(a, b), 4, 3)!,
  cylinder: roundShape('cylinder', vec(1, 0, 1), vec(3, 0, 1), 4)!,
  cone: roundShape('cone', vec(1, 0, 1), vec(3, 0, 1), 4)!,
}

/** Deterministic sample parameters for a part. */
function sampleParams(part: Part): number[][] {
  const samples = part.samples()
  const picks = [samples[0]!, samples[Math.floor(samples.length / 3)]!, samples[Math.floor(samples.length / 2)]!]
  return picks.map(point => part.project(point))
}

test('parça sayıları cismin kenar ve yüzlerini izler', () => {
  expect(partsOf(shapes.prism!)).toHaveLength(15 + 7)
  expect(partsOf(shapes.pyramid!)).toHaveLength(8 + 5)
  expect(partsOf(shapes.cylinder!)).toHaveLength(5)
  expect(partsOf(shapes.cone!)).toHaveLength(3)
  expect(partsOf(shapes.angle!)).toHaveLength(3)
  expect(partsOf(shapes.prism!)).toBe(partsOf(shapes.prism!))
})

for (const [name, shape] of Object.entries(shapes)) {
  test(`${name}: parça üzerindeki nokta izdüşümünde yerinde kalır`, () => {
    for (const part of partsOf(shape)) {
      for (const params of sampleParams(part)) {
        const point = part.position(params)
        const again = part.position(part.project(point))
        expect(distance(point, again)).toBeLessThan(1e-6)
        for (const tangent of part.tangents(params)) expect(length(tangent)).toBeCloseTo(1, 6)
      }
    }
  })
}

test('doğru parçası ve ışın çizilen uçların ötesine taşmaz', () => {
  const [segment] = partsOf(shapes.segment!)
  expect(distance(segment!.position(segment!.project(vec(100, 0, 0))), vec(5, 2, -1))).toBeLessThan(1e-9)
  const [ray] = partsOf(shapes.ray!)
  expect(distance(ray!.position(ray!.project(vec(-100, 0, 0))), vec(1, 1, 1))).toBeLessThan(1e-9)
  const [line] = partsOf(shapes.line!)
  expect(distance(line!.position(line!.project(vec(-100, -20, 50))), vec(1, 1, 1))).toBeGreaterThan(10)
})

test('yüz dışındaki nokta yüzün en yakın kenarına çekilir', () => {
  const parts = partsOf(shapes.prism!)
  const top = parts[15 + 1]!
  const far = vec(50, 3, 50)
  const clamped = top.position(top.project(far))
  expect(clamped.y).toBeCloseTo(3, 9)
  const center = shapes.prism!.kind === 'polyhedron' ? shapes.prism!.baseCenter : a
  expect(distance(vec(clamped.x, 0, clamped.z), center)).toBeLessThan(4)
})

test('açı yayı kollar arasında kalır', () => {
  const arc = partsOf(shapes.angle!)[2]!
  const outside = arc.position(arc.project(vec(-1, 0, -0.2)))
  expect(outside.x >= -1e-9 && outside.z >= -1e-9).toBe(true)
})

test('işaretçi ışını parçayı izler', () => {
  const down = (x: number, z: number): Ray => ({ origin: vec(x, 50, z), direction: vec(0, -1, 0) })
  const [base] = partsOf(shapes.cylinder!)
  const onCircle = base!.position(base!.fromRay(down(10, 1))!)
  expect(distance(onCircle, vec(3, 0, 1))).toBeLessThan(1e-9)
  const sphere = partsOf(shapes.sphere!)[0]!
  const top = sphere.position(sphere.fromRay(down(1, 3))!)
  expect(distance(top, vec(1, 5, 3))).toBeLessThan(1e-9)
  const plane = partsOf(shapes.plane!)[0]!
  expect(plane.fromRay({ origin: vec(0, 50, 0), direction: vec(1, 0, 0) })).toBeNull()
  const side = partsOf(shapes.cylinder!)[2]!
  const hit = side.position(side.fromRay({ origin: vec(10, 2, 1), direction: vec(-1, 0, 0) })!)
  expect(distance(hit, vec(3, 2, 1))).toBeLessThan(0.05)
})

test('parçası kalmayan nokta en yakın parçaya geçer, eşitlikte kenar yeğlenir', () => {
  const parts = partsOf(shapes.pyramid!)
  const corner = shapes.pyramid!.kind === 'polyhedron' ? shapes.pyramid!.base[2]! : a
  const nearest = nearestPart(parts, corner)!
  expect(nearest.part).toBeLessThan(8)
  expect(distance(parts[nearest.part]!.position(nearest.params), corner)).toBeLessThan(1e-9)
  const inside = nearestPart(parts, vec(2, 0, -2))!
  expect(nearest.part).not.toBe(inside.part)
  expect(dot(parts[inside.part]!.position(inside.params), vec(0, 1, 0))).toBeCloseTo(0, 9)
})
