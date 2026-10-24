import { expect, test } from '@playwright/test'
import {
  polygonArea, polyhedronShape, roundShape, surfaceArea, type PolyhedronShape, type RoundShape,
} from '../src/geometry/solids'
import { maxUnfoldAngle, unfoldSolid, type Net } from '../src/geometry/unfold'
import { distance, dot, sub, vec, type Vec3 } from '../src/geometry/vec3'

const A = vec(0, 0, 0)
const B = vec(3, 0, 0)
const C = vec(1.5, 0, 3)

function prism(sides: number, height = 4): PolyhedronShape {
  return polyhedronShape('prism', A, B, C, sides, height)!
}

function pyramid(sides: number, height = 4): PolyhedronShape {
  return polyhedronShape('pyramid', A, B, C, sides, height)!
}

function netArea(net: Net): number {
  return net.faces.reduce((sum, face) => sum + polygonArea(face), 0)
}

function heightAboveBase(point: Vec3, base: Vec3, normal: Vec3): number {
  return dot(sub(point, base), normal)
}

function edgeLengths(polygon: readonly Vec3[]): number[] {
  return polygon.map((vertex, index) => distance(vertex, polygon[(index + 1) % polygon.length]!))
}

test.describe('çokyüzlü açınımı', () => {
  for (const sides of [3, 4, 5, 8, 20]) {
    test(`${sides} kenarlı prizma 90°'de düzleşir, alan ve kenarlar korunur`, () => {
      const shape = prism(sides)
      expect(maxUnfoldAngle(shape)).toBe(90)
      const net = unfoldSolid(shape, 90)
      expect(net.faces).toHaveLength(sides + 2)
      for (const face of net.faces) {
        for (const vertex of face) expect(Math.abs(heightAboveBase(vertex, A, shape.normal))).toBeLessThan(1e-9)
      }
      expect(netArea(net)).toBeCloseTo(surfaceArea(shape), 9)
      for (const angle of [0, 17, 45, 90]) {
        const faces = unfoldSolid(shape, angle).faces
        for (let index = 0; index < shape.faces.length; index++) {
          const original = shape.faces[index]!.map(vertex => shape.vertices[vertex]!)
          // Net faces: base, sides in order, top last.
          const netFace = index === 0 ? faces[0]! : index === 1 ? faces[sides + 1]! : faces[index - 1]!
          const expected = edgeLengths(original)
          edgeLengths(netFace).forEach((size, edge) => expect(size).toBeCloseTo(expected[edge]!, 9))
        }
      }
    })

    test(`${sides} kenarlı piramidin yüzleri en büyük açıda tabana iner`, () => {
      const shape = pyramid(sides)
      const max = maxUnfoldAngle(shape)
      expect(max).toBeGreaterThan(90)
      expect(max).toBeLessThan(180)
      const net = unfoldSolid(shape, max)
      for (const face of net.faces) {
        for (const vertex of face) expect(Math.abs(heightAboveBase(vertex, A, shape.normal))).toBeLessThan(1e-9)
      }
      expect(netArea(net)).toBeCloseTo(surfaceArea(shape), 9)
      // Opened faces lie outside the base, not folded back over it.
      for (const face of net.faces.slice(1)) {
        expect(distance(face[2]!, shape.baseCenter)).toBeGreaterThan(distance(face[0]!, shape.baseCenter))
      }
      expect(unfoldSolid(shape, max + 30)).toEqual(net)
    })
  }

  test('0°de açınım cismin kendisidir', () => {
    const shape = prism(6)
    const closed = unfoldSolid(shape, 0)
    const top = closed.faces[closed.faces.length - 1]!
    top.forEach((vertex, index) => expect(distance(vertex, shape.top[index]!)).toBeLessThan(1e-12))
    const tip = unfoldSolid(pyramid(5), 0).faces.slice(1).map(face => face[2]!)
    for (const apex of tip) expect(distance(apex, pyramid(5).apex!)).toBeLessThan(1e-12)
  })
})

test.describe('silindir ve koni açınımı', () => {
  const center = vec(1, 0, -2)
  const rim = vec(3, 0, -2)

  function cylinder(height = 5): RoundShape {
    return roundShape('cylinder', center, rim, height)!
  }

  function cone(height = 5): RoundShape {
    return roundShape('cone', center, rim, height)!
  }

  test('silindir kapalıyken yan yüzey silindirin üzerindedir, açılınca tabana iner', () => {
    const shape = cylinder()
    for (const face of unfoldSolid(shape, 0).faces) {
      for (const point of face) {
        const along = dot(sub(point, center), shape.axis)
        const radial = distance(point, { x: center.x + shape.axis.x * along, y: center.y + shape.axis.y * along, z: center.z + shape.axis.z * along })
        expect(along).toBeGreaterThan(-1e-9)
        expect(along).toBeLessThan(shape.height + 1e-9)
        expect(radial).toBeLessThan(shape.radius + 1e-9)
      }
    }
    const flat = unfoldSolid(shape, 90)
    for (const face of flat.faces) for (const point of face) expect(Math.abs(point.y)).toBeLessThan(1e-9)
    // Polygon areas approximate the circles; the side is exact.
    expect(netArea(flat)).toBeCloseTo(surfaceArea(shape), 1)
  })

  test('silindirin yan yüzeyi her ara durumda bükülerek açılır: yükseklik ve alan korunur', () => {
    const shape = cylinder()
    const areas = [0, 20, 45, 70, 90].map(angle => netArea(unfoldSolid(shape, angle)))
    // Chords of the curved side shorten slightly; the flat net is exact.
    for (const area of areas) expect(Math.abs(area - areas[4]!) / areas[4]!).toBeLessThan(2e-3)
    for (const angle of [10, 50, 80]) {
      const sides = unfoldSolid(shape, angle).faces.filter(face => face.length === 4)
      expect(sides).toHaveLength(64)
      for (const [bottom, , , top] of sides) expect(distance(bottom!, top!)).toBeCloseTo(shape.height, 9)
    }
  })

  test('koni en büyük açıda tabana iner ve dilim taban çemberine dışarıdan değer', () => {
    const shape = cone()
    const max = maxUnfoldAngle(shape)
    expect(max).toBeCloseTo(180 - Math.atan2(5, 2) * 180 / Math.PI, 12)
    const closed = unfoldSolid(shape, 0)
    // The closed sector's apex is the cone's apex.
    expect(distance(closed.faces[closed.faces.length - 1]![0]!, shape.top)).toBeLessThan(1e-9)
    const flat = unfoldSolid(shape, max)
    for (const face of flat.faces) for (const point of face) expect(Math.abs(point.y)).toBeLessThan(1e-9)
    const apex = flat.faces[flat.faces.length - 1]![0]!
    expect(distance(apex, center)).toBeCloseTo(2 + Math.hypot(2, 5), 9)
    const slant = Math.hypot(2, 5)
    for (const angle of [0, 30, 60, 100, max]) {
      const sector = unfoldSolid(shape, angle).faces.slice(64)
      for (const [tip, from, to] of sector) {
        expect(distance(tip!, from!)).toBeCloseTo(slant, 9)
        expect(distance(tip!, to!)).toBeCloseTo(slant, 9)
      }
    }
    const areas = [0, 30, 60, max].map(angle => netArea(unfoldSolid(shape, angle)))
    for (const area of areas) expect(Math.abs(area - areas[3]!) / areas[3]!).toBeLessThan(2e-3)
    expect(areas[3]).toBeCloseTo(surfaceArea(shape), 1)
  })
})
