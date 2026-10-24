import { expect, test } from '@playwright/test'
import {
  angleShape, arePointsCollinear, initialSidePoint, lineShape, planeShape, polygonArea, polyhedronShape,
  regularPolygonFromEdge, roundAxis, roundShape, solidVolume, sphereShape, surfaceArea,
} from '../src/geometry/solids'
import { maxUnfoldAngle } from '../src/geometry/unfold'
import { centroid, cross, distance, dot, length, normalize, sub, toDegrees, vec, type Vec3 } from '../src/geometry/vec3'

function expectClose(actual: Vec3, expected: Vec3, digits = 9): void {
  expect(actual.x).toBeCloseTo(expected.x, digits)
  expect(actual.y).toBeCloseTo(expected.y, digits)
  expect(actual.z).toBeCloseTo(expected.z, digits)
}

test.describe('düzgün çokgen', () => {
  for (const sides of [3, 4, 6, 11, 20]) {
    test(`${sides} kenar: AB'den başlar, kenarlar eşit, düzlemsel ve C'nin karşı tarafında`, () => {
      const a = vec(1, 2, 3)
      const b = vec(4, 2.5, 3)
      const c = vec(2.5, 2, 6)
      const polygon = regularPolygonFromEdge(a, b, c, sides)!
      expect(polygon).toHaveLength(sides)
      expect(polygon[0]).toBe(a)
      expect(polygon[1]).toBe(b)
      const side = distance(a, b)
      polygon.forEach((vertex, index) => expect(distance(vertex, polygon[(index + 1) % sides]!)).toBeCloseTo(side, 9))
      const normal = normalize(cross(sub(b, a), sub(c, a)))!
      for (const vertex of polygon) expect(dot(sub(vertex, a), normal)).toBeCloseTo(0, 9)
      const middle = centroid([a, b])
      // The polygon center and C are on opposite sides of AB.
      const across = normalize(cross(normal, sub(b, a)))!
      expect(dot(sub(centroid(polygon), middle), across) * dot(sub(c, middle), across)).toBeLessThan(0)
    })
  }

  test('AB tekse veya C AB doğrusundaysa çokgen yoktur', () => {
    expect(regularPolygonFromEdge(vec(0, 0, 0), vec(0, 0, 0), vec(1, 0, 0), 4)).toBeNull()
    expect(regularPolygonFromEdge(vec(0, 0, 0), vec(2, 0, 0), vec(5, 0, 0), 4)).toBeNull()
  })

  test('varsayılan C yatay, AB ye dik ve |AB| uzaklıktadır', () => {
    const c = initialSidePoint(vec(0, 0, 0), vec(4, 0, 0))
    expectClose(c, vec(2, 0, 4))
    expectClose(initialSidePoint(vec(1, 0, 1), vec(1, 3, 1)), vec(2, 1.5, 1))
  })
})

test.describe('cisim şekilleri', () => {
  const a = vec(0, 0, 0)
  const b = vec(4, 0, 0)

  test('prizma tabandan yukarı uzar; köşeler, yüzler ve kenarlar sayılır', () => {
    const shape = polyhedronShape('prism', a, b, initialSidePoint(a, b), 4, 3)!
    expectClose(shape.normal, vec(0, 1, 0))
    expect(shape.vertices).toHaveLength(8)
    expect(shape.faces).toHaveLength(6)
    expect(shape.edges).toHaveLength(12)
    expectClose(shape.heightEnd, vec(0, 3, 0))
    expect(solidVolume(shape)).toBeCloseTo(48, 9)
    expect(surfaceArea(shape)).toBeCloseTo(2 * 16 + 4 * 12, 9)
    // The base is away from C (C is at z = +4).
    expect(shape.baseCenter.z).toBeCloseTo(-2, 9)
  })

  test('piramidin tepesi taban merkezinin üstündedir', () => {
    const shape = polyhedronShape('pyramid', a, b, initialSidePoint(a, b), 6, 5)!
    expect(shape.vertices).toHaveLength(7)
    expect(shape.faces).toHaveLength(7)
    expect(shape.edges).toHaveLength(12)
    expectClose(sub(shape.apex!, shape.baseCenter), vec(0, 5, 0))
    expect(solidVolume(shape)).toBeCloseTo(polygonArea(shape.base) * 5 / 3, 9)
  })

  test('yükseklik veya taban tanımsızsa şekil yoktur', () => {
    expect(polyhedronShape('prism', a, b, initialSidePoint(a, b), 4, 0)).toBeNull()
    expect(polyhedronShape('prism', a, a, initialSidePoint(a, b), 4, 1)).toBeNull()
    expect(roundShape('cone', a, a, 1)).toBeNull()
  })

  test('silindir ve koninin ekseni dünya yukarısının yarıçapa dik bileşenidir', () => {
    expectClose(roundAxis(vec(0, 0, 0), vec(2, 0, 0)), vec(0, 1, 0))
    const tilted = roundAxis(vec(0, 0, 0), vec(1, 1, 0))
    expect(dot(tilted, vec(1, 1, 0))).toBeCloseTo(0, 12)
    expectClose(roundAxis(vec(0, 0, 0), vec(0, 3, 0)), vec(1, 0, 0))
    const cylinder = roundShape('cylinder', vec(1, 0, 1), vec(3, 0, 1), 4)!
    expectClose(cylinder.top, vec(1, 4, 1))
    expectClose(cylinder.topRim, vec(3, 4, 1))
    expect(solidVolume(cylinder)).toBeCloseTo(Math.PI * 16, 9)
    const cone = roundShape('cone', vec(1, 0, 1), vec(3, 0, 1), 4)!
    expectClose(cone.topRim, cone.top)
    expect(surfaceArea(cone)).toBeCloseTo(Math.PI * 2 * Math.hypot(2, 4) + Math.PI * 4, 9)
  })

  test('en büyük açınım açıları', () => {
    expect(maxUnfoldAngle(polyhedronShape('prism', a, b, initialSidePoint(a, b), 5, 2)!)).toBe(90)
    expect(maxUnfoldAngle(roundShape('cylinder', a, b, 2)!)).toBe(90)
    const cone = roundShape('cone', a, b, 4)!
    expect(maxUnfoldAngle(cone)).toBeCloseTo(180 - toDegrees(Math.atan2(4, 4)), 12)
    const pyramid = polyhedronShape('pyramid', a, b, initialSidePoint(a, b), 4, 2)!
    // Square base 4: apothem 2, height 2 → the faces lean at 45°.
    expect(maxUnfoldAngle(pyramid)).toBeCloseTo(135, 9)
  })
})

test.describe('doğru, düzlem, açı, küre', () => {
  test('doğru iki yana 50, ışın başlangıçtan 50 birim, doğru parçası uçlar arası çizilir', () => {
    const line = lineShape('line', vec(0, 0, 0), vec(2, 0, 0))!
    expectClose(line.start, vec(-49, 0, 0))
    expectClose(line.end, vec(51, 0, 0))
    const ray = lineShape('ray', vec(1, 0, 0), vec(1, 0, 2))!
    expectClose(ray.end, vec(1, 0, 50))
    expect(lineShape('segment', vec(1, 1, 1), vec(1, 1, 1))).toBeNull()
  })

  test('düzlem doğrusal noktalardan kurulamaz', () => {
    expect(planeShape(vec(0, 0, 0), vec(1, 1, 1), vec(2, 2, 2))).toBeNull()
    expect(arePointsCollinear(vec(0, 0, 0), vec(1, 1, 1), vec(3, 3, 3))).toBe(true)
    const plane = planeShape(vec(0, 0, 0), vec(3, 0, 0), vec(0, 0, 3))!
    expect(Math.abs(plane.normal.y)).toBeCloseTo(1, 12)
    expectClose(plane.center, vec(1, 0, 1))
  })

  test('açı köşedeki kollar arasındadır; doğru açı da çizilebilir', () => {
    const right = angleShape(vec(2, 0, 0), vec(0, 0, 0), vec(0, 0, 2))!
    expect(toDegrees(right.radians)).toBeCloseTo(90, 9)
    const straight = angleShape(vec(2, 0, 0), vec(0, 0, 0), vec(-1, 0, 0))!
    expect(toDegrees(straight.radians)).toBeCloseTo(180, 9)
    expect(length(straight.normal)).toBeCloseTo(1, 12)
    expect(angleShape(vec(0, 0, 0), vec(0, 0, 0), vec(1, 0, 0))).toBeNull()
  })

  test('kürenin yarıçapı merkez ile yüzey noktası arasındadır', () => {
    expect(sphereShape(vec(1, 1, 1), vec(1, 4, 5))!.radius).toBeCloseTo(5, 12)
    expect(sphereShape(vec(1, 1, 1), vec(1, 1, 1))).toBeNull()
  })
})
