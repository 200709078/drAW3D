import { expect, test } from '@playwright/test'
import { derivedPosition, intersectionCount, planesMeet, type DerivedSource } from '../src/geometry/derived'
import { initialSidePoint, lineShape, planeShape, polyhedronShape, roundShape, sphereShape } from '../src/geometry/solids'
import { outwardNormals, polyhedronEdgeVisibility, roundOutline, type Viewer } from '../src/geometry/visibility'
import { distance, dot, length, sub, vec, type Vec3 } from '../src/geometry/vec3'

const point = (x: number, y: number, z: number): DerivedSource => ({ kind: 'point', position: vec(x, y, z) })
const ground = planeShape(vec(0, 0, 0), vec(1, 0, 0), vec(0, 0, 1))!

function close(actual: Vec3 | null, expected: Vec3): void {
  expect(actual).not.toBeNull()
  expect(distance(actual!, expected)).toBeLessThan(1e-9)
}

test('orta nokta: iki nokta veya doğru parçası', () => {
  close(derivedPosition('midpoint', [point(0, 0, 0), point(4, 2, -2)]), vec(2, 1, -1))
  close(derivedPosition('midpoint', [lineShape('segment', vec(0, 0, 0), vec(0, 6, 0))!]), vec(0, 3, 0))
  expect(derivedPosition('midpoint', [lineShape('line', vec(0, 0, 0), vec(0, 6, 0))!])).toBeNull()
})

test('kesişimler: doğru-düzlem, doğru-doğru, doğru-küre; parçalar ve paralellik', () => {
  const vertical = lineShape('line', vec(1, 5, 1), vec(1, 4, 1))!
  close(derivedPosition('intersect', [vertical, ground]), vec(1, 0, 1))
  close(derivedPosition('intersect', [ground, vertical]), vec(1, 0, 1))
  // A segment that stops above the plane does not meet it.
  expect(derivedPosition('intersect', [lineShape('segment', vec(1, 5, 1), vec(1, 4, 1))!, ground])).toBeNull()
  expect(derivedPosition('intersect', [lineShape('line', vec(0, 1, 0), vec(1, 1, 0))!, ground])).toBeNull()
  const xLine = lineShape('line', vec(0, 0, 0), vec(1, 0, 0))!
  close(derivedPosition('intersect', [xLine, lineShape('line', vec(3, -1, 0), vec(3, 1, 0))!]), vec(3, 0, 0))
  expect(derivedPosition('intersect', [xLine, lineShape('line', vec(3, 1, -1), vec(3, 1, 1))!])).toBeNull()
  expect(derivedPosition('intersect', [xLine, lineShape('line', vec(0, 2, 0), vec(1, 2, 0))!])).toBeNull()
  const ball = sphereShape(vec(5, 0, 0), vec(5, 2, 0))!
  close(derivedPosition('intersect', [xLine, ball], 0), vec(3, 0, 0))
  close(derivedPosition('intersect', [xLine, ball], 1), vec(7, 0, 0))
  // A ray from inside meets the sphere once.
  const ray = lineShape('ray', vec(5, 0, 0), vec(6, 0, 0))!
  close(derivedPosition('intersect', [ray, ball], 0), vec(7, 0, 0))
  expect(derivedPosition('intersect', [ray, ball], 1)).toBeNull()
  expect(intersectionCount(xLine, ball)).toBe(2)
  expect(intersectionCount(ground, xLine)).toBe(1)
  expect(intersectionCount(ball, ball)).toBe(0)
})

test('izdüşüm ve dik/paralel yapıların gizli noktaları', () => {
  close(derivedPosition('project', [point(3, 4, -2), ground]), vec(3, 0, -2))
  close(derivedPosition('project', [point(3, 4, -2), lineShape('segment', vec(0, 0, 0), vec(1, 0, 0))!]), vec(3, 0, 0))
  const along = derivedPosition('along', [point(1, 1, 1), ground])!
  expect(Math.abs(along.y - 1)).toBeCloseTo(1, 12)
  const xLine = lineShape('line', vec(0, 0, 0), vec(2, 0, 0))!
  close(derivedPosition('along', [point(0, 5, 0), xLine]), vec(1, 5, 0))
  const first = derivedPosition('basis', [point(0, 5, 0), xLine], 0)!
  const second = derivedPosition('basis', [point(0, 5, 0), xLine], 1)!
  for (const corner of [first, second]) {
    expect(dot(sub(corner, vec(0, 5, 0)), vec(1, 0, 0))).toBeCloseTo(0, 12)
    expect(length(sub(corner, vec(0, 5, 0)))).toBeCloseTo(1, 12)
  }
  expect(dot(sub(first, vec(0, 5, 0)), sub(second, vec(0, 5, 0)))).toBeCloseTo(0, 12)
})

test('iki düzlemin kesişim doğrusu', () => {
  const wall = planeShape(vec(0, 0, 3), vec(1, 0, 3), vec(0, 1, 3))!
  const meet = planesMeet(ground, wall)!
  expect(Math.abs(meet.direction.x)).toBeCloseTo(1, 12)
  close(meet.point, vec(0, 0, 3))
  expect(planesMeet(ground, planeShape(vec(0, 2, 0), vec(1, 2, 0), vec(0, 2, 1))!)).toBeNull()
  close(derivedPosition('planeMeet', [ground, wall], 0), vec(0, 0, 3))
})

test('gizli kenarlar: küpün köşeden bakışta 3 kenarı gizlidir', () => {
  const a = vec(0, 0, 0)
  const b = vec(2, 0, 0)
  const cube = polyhedronShape('prism', a, b, initialSidePoint(a, b), 4, 2)!
  const normals = outwardNormals(cube)
  expect(normals.every(normal => Math.abs(length(normal) - 1) < 1e-12)).toBe(true)
  const from = (x: number, y: number, z: number): Viewer => ({ orthographic: false, position: vec(x, y, z), direction: vec(0, 0, 0) })
  // The cube spans x 0..2, y 0..2, z -2..0; the corner (2, 2, 0) faces the viewer.
  const corner = polyhedronEdgeVisibility(cube, from(20, 20, 20))
  expect(corner.filter(Boolean)).toHaveLength(9)
  // Straight from the front the sides are edge-on: only the front face's four edges are seen;
  // the others lie behind them on the screen.
  const front = polyhedronEdgeVisibility(cube, { orthographic: true, position: vec(0, 0, 0), direction: vec(0, 0, -1) })
  expect(front.filter(Boolean)).toHaveLength(4)
})

test('silindirin görünür sınırları ve arkadaki yarım çember', () => {
  const cylinder = roundShape('cylinder', vec(0, 0, 0), vec(1, 0, 0), 3)!
  const outline = roundOutline(cylinder, { orthographic: false, position: vec(0, 4, 20), direction: vec(0, 0, 0) }, 96)
  // Two silhouette generators, the whole top circle seen from above, the back of the base hidden.
  const silhouettes = outline.visible.filter(([from, to]) => Math.abs(distance(from, to) - 3) < 1e-9)
  expect(silhouettes).toHaveLength(2)
  expect(outline.hidden.length).toBeGreaterThan(40)
  expect(outline.hidden.length).toBeLessThan(56)
  expect(outline.hidden.every(([from]) => from.y === 0 && from.z <= 0.2)).toBe(true)
})
