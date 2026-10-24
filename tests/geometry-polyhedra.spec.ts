import { expect, test } from '@playwright/test'
import { flatNet, type NetSheet, type Point2 } from '../src/geometry/net-sheet'
import { cubeNets, unfoldTree } from '../src/geometry/nets'
import { regularShape } from '../src/geometry/polyhedra'
import { sectionOf } from '../src/geometry/section'
import {
  initialSidePoint, planeShape, polygonArea, polyhedronShape, roundShape, solidVolume, sphereShape, surfaceArea,
  type PolyhedronShape, type SolidShape,
} from '../src/geometry/solids'
import { maxUnfoldAngle, unfoldSolid } from '../src/geometry/unfold'
import type { RegularKind } from '../src/geometry/types'
import { add, centroid, cross, distance, dot, normalize, scale, sub, vec, type Vec3 } from '../src/geometry/vec3'
import { layoutSheet, MM_PER_UNIT, netSvg, PAGE, scaleNote } from '../src/rendering/net-svg'

const A = vec(0, 0, 0)
const B = vec(2, 0, 0)
const C = initialSidePoint(A, B)

const REGULAR: readonly { kind: RegularKind; faces: number; vertices: number; volume: number; area: number }[] = [
  { kind: 'tetrahedron', faces: 4, vertices: 4, volume: 1 / (6 * Math.SQRT2), area: Math.sqrt(3) },
  { kind: 'cube', faces: 6, vertices: 8, volume: 1, area: 6 },
  { kind: 'octahedron', faces: 8, vertices: 6, volume: Math.SQRT2 / 3, area: 2 * Math.sqrt(3) },
  { kind: 'dodecahedron', faces: 12, vertices: 20, volume: (15 + 7 * Math.sqrt(5)) / 4, area: 3 * Math.sqrt(25 + 10 * Math.sqrt(5)) },
  { kind: 'icosahedron', faces: 20, vertices: 12, volume: 5 * (3 + Math.sqrt(5)) / 12, area: 5 * Math.sqrt(3) },
]

function faceNormal(points: readonly Vec3[]): Vec3 {
  return normalize(cross(sub(points[1]!, points[0]!), sub(points[2]!, points[0]!)))!
}

/** Convex polygons overlap (more than touching) when no edge normal separates them. */
function overlap(first: readonly Point2[], second: readonly Point2[]): boolean {
  for (const polygon of [first, second]) {
    for (let index = 0; index < polygon.length; index++) {
      const a = polygon[index]!
      const b = polygon[(index + 1) % polygon.length]!
      const axis = { x: a.y - b.y, y: b.x - a.x }
      const project = (points: readonly Point2[]) => points.map(point => point.x * axis.x + point.y * axis.y)
      const [p, q] = [project(first), project(second)]
      const size = Math.hypot(axis.x, axis.y)
      if (Math.min(Math.max(...p), Math.max(...q)) - Math.max(Math.min(...p), Math.min(...q)) < 1e-6 * size) return false
    }
  }
  return true
}

function area2(polygon: readonly Point2[]): number {
  let total = 0
  polygon.forEach((point, index) => {
    const next = polygon[(index + 1) % polygon.length]!
    total += point.x * next.y - next.x * point.y
  })
  return Math.abs(total) / 2
}

function expectFlatNet(shape: PolyhedronShape): NetSheet {
  const net = unfoldSolid(shape, maxUnfoldAngle(shape))
  const root = net.faces[0]!
  const normal = faceNormal(root)
  for (const face of net.faces) for (const point of face) expect(Math.abs(dot(sub(point, root[0]!), normal))).toBeLessThan(1e-9)
  const sheet = flatNet(shape, false)
  expect(sheet.faces.reduce((sum, face) => sum + area2(face), 0)).toBeCloseTo(surfaceArea(shape), 9)
  for (let first = 0; first < sheet.faces.length; first++) {
    for (let second = first + 1; second < sheet.faces.length; second++) {
      expect(overlap(sheet.faces[first]!, sheet.faces[second]!), `yüz ${first} ve ${second} üst üste`).toBe(false)
    }
  }
  return sheet
}

test.describe('düzgün çokyüzlüler', () => {
  for (const { kind, faces, vertices, volume, area } of REGULAR) {
    test(`${kind}: AB kenarı üzerinde kurulur; kenarlar eşit, yüzler düzlemsel; hacim ve alan doğru`, () => {
      const shape = regularShape(kind, A, B, C)!
      expect(shape.faces).toHaveLength(faces)
      expect(shape.vertices).toHaveLength(vertices)
      expect(shape.vertices[0]).toEqual(A)
      expect(shape.vertices[1]).toEqual(B)
      expect(shape.edges).toHaveLength(faces + vertices - 2)
      for (const [from, to] of shape.edges) expect(distance(shape.vertices[from]!, shape.vertices[to]!)).toBeCloseTo(2, 9)
      for (const face of shape.faces) {
        const points = face.map(index => shape.vertices[index]!)
        const normal = faceNormal(points)
        for (const point of points) expect(Math.abs(dot(sub(point, points[0]!), normal))).toBeLessThan(1e-9)
      }
      // The base face lies on the ground (AB, the side of C opposite) and the solid above it.
      expect(shape.faces[0]!.slice(0, 2)).toEqual([0, 1])
      for (const point of shape.vertices) expect(dot(sub(point, A), shape.normal)).toBeGreaterThan(-1e-9)
      expect(solidVolume(shape)).toBeCloseTo(volume * 8, 9)
      expect(surfaceArea(shape)).toBeCloseTo(area * 4, 9)
    })

    test(`${kind}: açınım en büyük açıda düzleşir, yüzler çakışmaz`, () => {
      const shape = regularShape(kind, A, B, C)!
      expect(unfoldTree(shape)).toHaveLength(faces - 1)
      expectFlatNet(shape)
    })
  }

  test('küpün 11 farklı açınımı vardır; her biri düzleşir ve çakışmaz', () => {
    const cube = regularShape('cube', A, B, C)!
    const nets = cubeNets(cube.faces)
    expect(nets).toHaveLength(11)
    const layouts = new Set<string>()
    for (let net = 0; net < 11; net++) {
      const shape = { ...cube, net }
      const sheet = expectFlatNet(shape)
      // Distinct shapes: the sorted distances between face centers differ.
      const centers = sheet.faces.map(face => ({ x: face.reduce((s, p) => s + p.x, 0) / 4, y: face.reduce((s, p) => s + p.y, 0) / 4 }))
      const distances = centers.flatMap((a, i) => centers.slice(i + 1).map(b => Math.round(Math.hypot(a.x - b.x, a.y - b.y) * 1e6)))
      layouts.add(distances.sort((x, y) => x - y).join(','))
    }
    expect(layouts.size).toBe(11)
  })
})

test.describe('kesik cisimler', () => {
  test('kesik piramit: üst taban oranla küçülür; hacim h/3 (A + a + √(Aa)) ve açınım düzleşir', () => {
    const shape = polyhedronShape('pyramid', A, B, C, 4, 3, 0.5)!
    expect(shape.solid).toBe('frustum')
    expect(shape.vertices).toHaveLength(8)
    expect(shape.faces).toHaveLength(6)
    const [bottom, top] = [4, 1]
    expect(solidVolume(shape)).toBeCloseTo(3 / 3 * (bottom + top + Math.sqrt(bottom * top)), 9)
    for (const vertex of shape.top) expect(dot(sub(vertex, A), shape.normal)).toBeCloseTo(3, 9)
    expect(distance(shape.top[0]!, shape.top[1]!)).toBeCloseTo(1, 9)
    expectFlatNet(shape)
  })

  test('kesik koni: hacim πh(R² + Rr + r²)/3, alan π(R + r)s + π(R² + r²); açınımı düzleşir', () => {
    const shape = roundShape('cone', A, B, 3, 0.5)!
    expect(shape.topRadius).toBeCloseTo(1, 12)
    expect(solidVolume(shape)).toBeCloseTo(Math.PI * 3 * (4 + 2 + 1) / 3, 9)
    const slant = Math.hypot(3, 1)
    expect(surfaceArea(shape)).toBeCloseTo(Math.PI * 3 * slant + Math.PI * 5, 9)
    const net = unfoldSolid(shape, maxUnfoldAngle(shape))
    const normal = shape.axis
    for (const face of net.faces) for (const point of face) expect(Math.abs(dot(sub(point, A), normal))).toBeLessThan(1e-9)
    const area = net.faces.reduce((sum, face) => sum + polygonArea(face), 0)
    expect(area / surfaceArea(shape)).toBeCloseTo(1, 2)
  })
})

test.describe('kesit', () => {
  const cube = regularShape('cube', A, B, C)!
  const center = centroid(cube.vertices)

  test('küpü ortadan tabana paralel kesen düzlemin kesiti bir yüz kadardır', () => {
    const [u, v] = [sub(cube.vertices[1]!, cube.vertices[0]!), cross(cube.normal, sub(cube.vertices[1]!, cube.vertices[0]!))]
    const section = sectionOf(cube, planeShape(center, add(center, u), add(center, v))!)!
    expect(section.polygon).toHaveLength(4)
    expect(section.area).toBeCloseTo(4, 9)
  })

  test('köşegen düzlemin kesiti dikdörtgendir, düzlem cismi kesmezse kesit yoktur', () => {
    const [p, q, r] = [cube.vertices[0]!, cube.vertices[1]!, add(cube.vertices[2]!, scale(cube.normal, 2))]
    expect(sectionOf(cube, planeShape(p, q, r)!)!.area).toBeCloseTo(4 * Math.SQRT2, 9)
    const far = add(center, scale(cube.normal, 10))
    expect(sectionOf(cube, planeShape(far, add(far, vec(1, 0, 0)), add(far, vec(0, 0, 1)))!)).toBeNull()
  })

  test('kürenin kesiti çemberdir', () => {
    const sphere = sphereShape(A, vec(2, 0, 0))!
    const at = vec(0, 1, 0)
    const section = sectionOf(sphere, planeShape(at, vec(1, 1, 0), vec(0, 1, 1))!)!
    expect(section.area).toBeCloseTo(3 * Math.PI, 1)
  })
})

test.describe('yazdırılacak açınım', () => {
  const solids: [string, SolidShape][] = [
    ['prizma', polyhedronShape('prism', A, B, C, 5, 3)!],
    ['piramit', polyhedronShape('pyramid', A, B, C, 4, 3)!],
    ['silindir', roundShape('cylinder', A, vec(1, 0, 0), 3)!],
    ['koni', roundShape('cone', A, vec(2, 0, 0), 4)!],
    ['kesik koni', roundShape('cone', A, vec(2, 0, 0), 3, 0.5)!],
    ['yirmiyüzlü', regularShape('icosahedron', A, B, C)!],
  ]
  for (const [name, shape] of solids) {
    test(`${name}: alan korunur; yapıştırma payları katlama çizgisiyle eklenir ve A4'e sığar`, () => {
      const plain = flatNet(shape, false)
      const area = plain.faces.reduce((sum, face) => sum + area2(face), 0)
      expect(area / surfaceArea(shape)).toBeCloseTo(1, 2)
      expect(plain.tabs).toHaveLength(0)
      const tabbed = flatNet(shape, true)
      expect(tabbed.tabs.length).toBeGreaterThan(0)
      expect(tabbed.folds.length).toBe(plain.folds.length + tabbed.tabs.length)
      if (shape.kind === 'polyhedron') {
        // One tab for every edge that is cut: edges − (faces − 1).
        expect(tabbed.tabs).toHaveLength(shape.edges.length - shape.faces.length + 1)
      }
      const layout = layoutSheet(tabbed)
      expect(layout.scale).toBe(MM_PER_UNIT)
      for (const point of [...tabbed.cuts.flat(), ...tabbed.faces.flat()]) {
        const placed = layout.place(point)
        expect(placed.x).toBeGreaterThanOrEqual(10 - 1e-9)
        expect(placed.x).toBeLessThanOrEqual(PAGE.width - 10 + 1e-9)
        expect(placed.y).toBeGreaterThanOrEqual(10 - 1e-9)
        expect(placed.y).toBeLessThanOrEqual(PAGE.height - 10 + 1e-9)
      }
    })
  }

  test('gerçek ölçekte 1 birim 1 cm dir; sığmayan ağ döndürülür, gerekirse küçültülür ve bu yazılır', () => {
    const small = layoutSheet(flatNet(polyhedronShape('prism', A, B, C, 4, 2)!, false))
    const placed = [small.place({ x: 0, y: 0 }), small.place({ x: 1, y: 0 })]
    expect(Math.hypot(placed[1]!.x - placed[0]!.x, placed[1]!.y - placed[0]!.y)).toBeCloseTo(10, 9)
    expect(scaleNote(small)).toContain('1:1')
    // 2πr ≈ 25 cm wide, 3 cm tall: fits only when turned.
    const tall = layoutSheet(flatNet(roundShape('cylinder', A, vec(4, 0, 0), 3)!, false))
    expect(tall.scale).toBe(MM_PER_UNIT)
    expect(tall.rotation).toBe(90)
    const large = layoutSheet(flatNet(roundShape('cylinder', A, vec(6, 0, 0), 10)!, false))
    expect(large.scale).toBeLessThan(MM_PER_UNIT)
    expect(scaleNote(large)).toContain('küçültüldü')
  })

  test('SVG A4 boyutunda, kesim düz ve katlama kesikli çizilir', () => {
    const svg = netSvg(flatNet(polyhedronShape('prism', A, B, C, 4, 2)!, true), { title: 'prizma1 <açınım>', color: '#3366ff' })
    expect(svg).toContain('width="210mm" height="297mm" viewBox="0 0 210 297"')
    expect(svg).toContain('stroke-dasharray')
    expect(svg).toContain('prizma1 &#60;açınım&#62;')
    expect(svg).toContain('yapıştırma payı')
  })
})
