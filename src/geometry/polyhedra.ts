import { regularPolygonFromEdge, type PolyhedronShape } from './solids'
import type { RegularKind } from './types'
import {
  add, centroid, cross, distance, dot, normalize, scale, sub, vec, type Vec3,
} from './vec3'

const PHI = (1 + Math.sqrt(5)) / 2

/** Vertex count of each face and the canonical vertices (any size; scaled later). */
const CANONICAL: Readonly<Record<RegularKind, { sides: number; vertices: () => Vec3[] }>> = {
  tetrahedron: { sides: 3, vertices: () => [vec(1, 1, 1), vec(1, -1, -1), vec(-1, 1, -1), vec(-1, -1, 1)] },
  cube: {
    sides: 4,
    vertices: () => [-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => vec(x, y, z)))),
  },
  octahedron: {
    sides: 3,
    vertices: () => [vec(1, 0, 0), vec(-1, 0, 0), vec(0, 1, 0), vec(0, -1, 0), vec(0, 0, 1), vec(0, 0, -1)],
  },
  dodecahedron: {
    sides: 5,
    vertices: () => [
      ...[-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => vec(x, y, z)))),
      ...[-1, 1].flatMap(a => [-1, 1].flatMap(b => [vec(0, a / PHI, b * PHI), vec(a / PHI, b * PHI, 0), vec(b * PHI, 0, a / PHI)])),
    ],
  },
  icosahedron: {
    sides: 3,
    vertices: () => [-1, 1].flatMap(a => [-1, 1].flatMap(b => [vec(0, a, b * PHI), vec(a, b * PHI, 0), vec(b * PHI, 0, a)])),
  },
}

export const REGULAR_FACE_SIDES: Readonly<Record<RegularKind, number>> = {
  tetrahedron: 3, cube: 4, octahedron: 3, dodecahedron: 5, icosahedron: 3,
}

interface Canonical {
  vertices: Vec3[]
  /** Counterclockwise seen from outside. */
  faces: number[][]
}

const cache = new Map<RegularKind, Canonical>()

/** Faces of a convex polyhedron: planes through vertices with every vertex on one side. */
function canonical(kind: RegularKind): Canonical {
  const cached = cache.get(kind)
  if (cached) return cached
  const vertices = CANONICAL[kind].vertices()
  const center = centroid(vertices)
  const faces: number[][] = []
  const seen = new Set<string>()
  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      for (let k = j + 1; k < vertices.length; k++) {
        const normal = normalize(cross(sub(vertices[j]!, vertices[i]!), sub(vertices[k]!, vertices[i]!)))
        if (!normal) continue
        const offsets = vertices.map(vertex => dot(sub(vertex, vertices[i]!), normal))
        const outward = dot(sub(vertices[i]!, center), normal) > 0 ? 1 : -1
        if (offsets.some(offset => offset * outward > 1e-9)) continue
        const members = offsets.flatMap((offset, index) => (Math.abs(offset) < 1e-9 ? [index] : []))
        const key = members.join(',')
        if (seen.has(key) || members.length !== CANONICAL[kind].sides) continue
        seen.add(key)
        // Order around the face center, counterclockwise from outside.
        const faceNormal = scale(normal, outward)
        const faceCenter = centroid(members.map(index => vertices[index]!))
        const reference = sub(vertices[members[0]!]!, faceCenter)
        const angle = (index: number) => {
          const relative = sub(vertices[index]!, faceCenter)
          return Math.atan2(dot(cross(reference, relative), faceNormal), dot(reference, relative))
        }
        faces.push([...members].sort((a, b) => (angle(a) + 2 * Math.PI) % (2 * Math.PI) - (angle(b) + 2 * Math.PI) % (2 * Math.PI)))
      }
    }
  }
  const result = { vertices, faces }
  cache.set(kind, result)
  return result
}

/** Orthonormal frame at an edge: along the edge, across it inside the face, the face's outward normal. */
function frame(from: Vec3, to: Vec3, normal: Vec3): { origin: Vec3; e1: Vec3; e2: Vec3; n: Vec3 } {
  const e1 = normalize(sub(to, from))!
  return { origin: from, e1, e2: cross(normal, e1), n: normal }
}

/**
 * A regular polyhedron whose base face is the regular polygon on edge AB away from C (as
 * for prisms) and which lies on the side of that face opposite to AB × AC.
 */
export function regularShape(kind: RegularKind, a: Vec3, b: Vec3, c: Vec3): PolyhedronShape | null {
  const { vertices, faces } = canonical(kind)
  const sides = CANONICAL[kind].sides
  const base = regularPolygonFromEdge(a, b, c, sides)
  const up = normalize(cross(sub(b, a), sub(c, a)))
  if (!base || !up) return null
  const normal = scale(up, -1)
  const baseCenter = centroid(base)
  const face = faces[0]!
  const faceCenter = centroid(face.map(index => vertices[index]!))
  const faceNormal = normalize(sub(faceCenter, centroid(vertices)))!
  // Map the canonical base edge onto AB with the base face's outward normal pointing down.
  const size = distance(a, b) / distance(vertices[face[0]!]!, vertices[face[1]!]!)
  let [first, second] = [face[0]!, face[1]!]
  const target = frame(a, b, scale(normal, -1))
  const sideOf = (from: Vec3, to: Vec3, n: Vec3, point: Vec3) => dot(sub(point, from), cross(n, normalize(sub(to, from))!))
  // The face must lie on the same side of the edge in both frames.
  if (Math.sign(sideOf(vertices[first]!, vertices[second]!, faceNormal, faceCenter)) !== Math.sign(sideOf(a, b, scale(normal, -1), baseCenter))) {
    [first, second] = [second, first]
  }
  const source = frame(vertices[first]!, vertices[second]!, faceNormal)
  const place = (point: Vec3): Vec3 => {
    const relative = sub(point, source.origin)
    const [x, y, z] = [dot(relative, source.e1), dot(relative, source.e2), dot(relative, source.n)]
    return add(target.origin, add(add(scale(target.e1, x * size), scale(target.e2, y * size)), scale(target.n, z * size)))
  }
  // A and B first, the base face next, then the rest: helper points find vertices by index.
  const order = [first, second, ...face.filter(index => index !== first && index !== second),
    ...vertices.map((_, index) => index).filter(index => !face.includes(index))]
  const position = new Map(order.map((index, place) => [index, place]))
  const placed = order.map(index => place(vertices[index]!))
  placed[0] = a
  placed[1] = b
  const mapped = faces.map(each => each.map(index => position.get(index)!))
  // The base face first, its vertices starting at A…
  const baseFace = mapped[0]!
  const rotate = baseFace.indexOf(0)
  mapped[0] = [...baseFace.slice(rotate), ...baseFace.slice(0, rotate)]
  // …and going on to B, as a prism's base does (face normals do not depend on the winding).
  if (mapped[0][1] !== 1) mapped[0] = [0, ...mapped[0].slice(1).reverse()]
  const edges: [number, number][] = []
  const seen = new Set<string>()
  for (const each of mapped) {
    each.forEach((from, index) => {
      const to = each[(index + 1) % each.length]!
      const key = from < to ? `${from},${to}` : `${to},${from}`
      if (seen.has(key)) return
      seen.add(key)
      edges.push([from, to])
    })
  }
  const height = Math.max(...placed.map(point => dot(sub(point, a), normal)))
  return {
    kind: 'polyhedron', solid: kind, base: mapped[0]!.map(index => placed[index]!), top: [], apex: null, baseCenter, normal,
    height, heightStart: baseCenter, heightEnd: baseCenter, vertices: placed, faces: mapped, edges,
  }
}

/** For tests: the canonical face count of each solid. */
export function regularFaceCount(kind: RegularKind): number {
  return canonical(kind).faces.length
}
