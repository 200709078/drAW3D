import type { PolyhedronShape } from './solids'
import { add, angleBetween, centroid, cross, distance, dot, normalize, rotateVector, scale, sub, type Vec3 } from './vec3'

/** A face hinged on its parent face along an edge (vertex indices). */
export interface Hinge {
  face: number
  parent: number
  edge: [number, number]
}

/** A polyhedron's opened faces with the solid's vertex indices of each corner. */
export interface PolyhedronNet {
  /** Face indices in tree order: the root (base) first. */
  order: number[]
  faces: Vec3[][]
  faceVertices: number[][]
  /** Edges the net folds along (shared by two net faces). */
  folds: [number, number][]
}

/** Outward unit normal of each face (away from the solid's center). */
export function faceNormals(shape: PolyhedronShape): Vec3[] {
  const center = centroid(shape.vertices)
  return shape.faces.map(face => {
    const points = face.map(index => shape.vertices[index]!)
    let normal = normalize(cross(sub(points[1]!, points[0]!), sub(points[2]!, points[0]!))) ?? { x: 0, y: 1, z: 0 }
    if (dot(normal, sub(centroid(points), center)) < 0) normal = scale(normal, -1)
    return normal
  })
}

const edgeKey = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`)

/** Faces meeting at each edge. */
function adjacency(faces: readonly (readonly number[])[]): Map<string, { edge: [number, number]; faces: number[] }> {
  const edges = new Map<string, { edge: [number, number]; faces: number[] }>()
  faces.forEach((face, index) => face.forEach((from, corner) => {
    const to = face[(corner + 1) % face.length]!
    const key = edgeKey(from, to)
    const entry = edges.get(key) ?? { edge: [from, to], faces: [] }
    entry.faces.push(index)
    edges.set(key, entry)
  }))
  return edges
}

/** Breadth-first hinges from face 0, neighbors in face order. */
function breadthFirst(faces: readonly (readonly number[])[], allowed?: ReadonlySet<string>): Hinge[] {
  const edges = adjacency(faces)
  const hinges: Hinge[] = []
  const reached = new Set([0])
  const queue = [0]
  while (queue.length) {
    const parent = queue.shift()!
    const face = faces[parent]!
    face.forEach((from, corner) => {
      const to = face[(corner + 1) % face.length]!
      const key = edgeKey(from, to)
      if (allowed && !allowed.has(key)) return
      for (const neighbor of edges.get(key)?.faces ?? []) {
        if (reached.has(neighbor)) continue
        reached.add(neighbor)
        hinges.push({ face: neighbor, parent, edge: [from, to] })
        queue.push(neighbor)
      }
    })
  }
  return hinges
}

/**
 * The net's tree. Prisms and frustums: every side on its base edge, the top on the last
 * side. Pyramids: every side on its base edge. The cube: one of its 11 nets. Other regular
 * polyhedra: breadth first from the base.
 */
export function unfoldTree(shape: PolyhedronShape): Hinge[] {
  const n = shape.base.length
  if (shape.solid === 'prism' || shape.solid === 'frustum') {
    const sides = shape.base.map((_, index): Hinge => ({ face: 2 + index, parent: 0, edge: [index, (index + 1) % n] }))
    return [...sides, { face: 1, parent: 2 + n - 1, edge: [n + n - 1, n] }]
  }
  if (shape.solid === 'pyramid') return shape.base.map((_, index) => ({ face: 1 + index, parent: 0, edge: [index, (index + 1) % n] }))
  if (shape.solid === 'cube') {
    const nets = cubeNets(shape.faces)
    return nets[Math.min(Math.max(Math.round(shape.net ?? 0), 0), nets.length - 1)]!
  }
  return breadthFirst(shape.faces)
}

/** How far each hinge opens until its face lies in its parent's plane (radians). */
export function hingeLimits(shape: PolyhedronShape, tree: readonly Hinge[]): number[] {
  const normals = faceNormals(shape)
  return tree.map(hinge => angleBetween(normals[hinge.face]!, normals[hinge.parent]!))
}

interface Affine {
  /** Row-major 3×3. */
  m: number[]
  t: Vec3
}

const IDENTITY: Affine = { m: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: { x: 0, y: 0, z: 0 } }

function times(m: readonly number[], v: Vec3): Vec3 {
  return {
    x: m[0]! * v.x + m[1]! * v.y + m[2]! * v.z,
    y: m[3]! * v.x + m[4]! * v.y + m[5]! * v.z,
    z: m[6]! * v.x + m[7]! * v.y + m[8]! * v.z,
  }
}

function apply(affine: Affine, point: Vec3): Vec3 {
  return add(times(affine.m, point), affine.t)
}

/** First `second`, then `first`. */
function compose(first: Affine, second: Affine): Affine {
  const m: number[] = []
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      m.push(first.m[row * 3]! * second.m[column]! + first.m[row * 3 + 1]! * second.m[3 + column]! + first.m[row * 3 + 2]! * second.m[6 + column]!)
    }
  }
  return { m, t: add(times(first.m, second.t), first.t) }
}

/** Rotation about the line through `origin` along the unit `axis`. */
function rotation(origin: Vec3, axis: Vec3, angle: number): Affine {
  const columns = [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }].map(basis => rotateVector(basis, axis, angle))
  const m = [columns[0]!.x, columns[1]!.x, columns[2]!.x, columns[0]!.y, columns[1]!.y, columns[2]!.y, columns[0]!.z, columns[1]!.z, columns[2]!.z]
  return { m, t: sub(origin, times(m, origin)) }
}

/**
 * Open the faces along the tree: every hinge turns by `angle`, but no further than where
 * its face reaches its parent's plane, so at the largest angle the net lies flat.
 */
export function unfoldPolyhedronNet(shape: PolyhedronShape, angle: number, tree: readonly Hinge[] = unfoldTree(shape)): PolyhedronNet {
  const normals = faceNormals(shape)
  const limits = hingeLimits(shape, tree)
  const transforms = new Map<number, Affine>([[0, IDENTITY]])
  tree.forEach((hinge, index) => {
    const [from, to] = hinge.edge
    const origin = shape.vertices[from]!
    const axis = normalize(sub(shape.vertices[to]!, origin))!
    const limit = limits[index]!
    // Turn the way that brings the face's normal onto its parent's.
    const towards = (sign: number) => distance(rotateVector(normals[hinge.face]!, axis, sign * limit), normals[hinge.parent]!)
    const sign = towards(1) <= towards(-1) ? 1 : -1
    const own = rotation(origin, axis, sign * Math.min(Math.max(angle, 0), limit))
    transforms.set(hinge.face, compose(transforms.get(hinge.parent) ?? IDENTITY, own))
  })
  const order = [0, ...tree.map(hinge => hinge.face)]
  return {
    order,
    faces: order.map(face => shape.faces[face]!.map(index => apply(transforms.get(face)!, shape.vertices[index]!))),
    faceVertices: order.map(face => [...shape.faces[face]!]),
    folds: tree.map(hinge => hinge.edge),
  }
}

/** Largest opening angle of a polyhedron's net, in radians. */
export function polyhedronMaxAngle(shape: PolyhedronShape): number {
  return Math.max(0, ...hingeLimits(shape, unfoldTree(shape)))
}

let cubeCache: { key: string; nets: Hinge[][] } | null = null

/**
 * The 11 nets of a cube, each as a tree rooted at face 0. All spanning trees of the face
 * graph are opened flat and grouped by their shape up to rotation and reflection.
 */
export function cubeNets(faces: readonly (readonly number[])[]): Hinge[][] {
  const key = JSON.stringify(faces)
  if (cubeCache?.key === key) return cubeCache.nets
  const edges = [...adjacency(faces).entries()].filter(([, entry]) => entry.faces.length === 2)
  const classes = new Map<string, Hinge[]>()
  const size = edges.length
  // Five of the twelve edges, as bit masks in a fixed order.
  for (let mask = 0; mask < 1 << size; mask++) {
    let bits = 0
    for (let bit = mask; bit; bit &= bit - 1) bits++
    if (bits !== faces.length - 1) continue
    const allowed = new Set(edges.filter((_, index) => mask & (1 << index)).map(([edge]) => edge))
    const tree = breadthFirst(faces, allowed)
    if (tree.length !== faces.length - 1) continue
    const shapeKey = netShape(faces, tree)
    if (!classes.has(shapeKey)) classes.set(shapeKey, tree)
  }
  const nets = [...classes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, tree]) => tree)
  cubeCache = { key, nets }
  return nets
}

/** The flat layout of a cube net on a unit grid, normalized under the square's 8 symmetries. */
function netShape(faces: readonly (readonly number[])[], tree: readonly Hinge[]): string {
  // A unit cube with these faces; the net is flattened onto face 0's plane.
  const cube = unitCube(faces)
  const net = unfoldPolyhedronNet(cube, Math.PI, tree)
  const base = net.faces[0]!
  const origin = base[0]!
  const u = normalize(sub(base[1]!, origin))!
  const normal = normalize(cross(sub(base[1]!, origin), sub(base[2]!, origin)))!
  const v = cross(normal, u)
  const cells = net.faces.map(face => {
    const center = sub(centroid(face), origin)
    return [Math.round(dot(center, u) - 0.5), Math.round(dot(center, v) - 0.5)] as const
  })
  const variants = [
    (x: number, y: number) => [x, y], (x: number, y: number) => [-x, y], (x: number, y: number) => [x, -y],
    (x: number, y: number) => [-x, -y], (x: number, y: number) => [y, x], (x: number, y: number) => [-y, x],
    (x: number, y: number) => [y, -x], (x: number, y: number) => [-y, -x],
  ]
  return variants.map(variant => {
    const moved = cells.map(([x, y]) => variant(x, y) as [number, number])
    const minX = Math.min(...moved.map(([x]) => x))
    const minY = Math.min(...moved.map(([, y]) => y))
    return moved.map(([x, y]) => `${x - minX}:${y - minY}`).sort().join(' ')
  }).sort()[0]!
}

/** A unit cube with the given face structure (vertex indices as in the real cube). */
function unitCube(faces: readonly (readonly number[])[]): PolyhedronShape {
  // Rebuild positions from the structure: face 0 on the ground, its opposite face above.
  const vertexCount = Math.max(...faces.flat()) + 1
  const positions: Vec3[] = Array.from({ length: vertexCount }, () => ({ x: 0, y: 0, z: 0 }))
  const base = faces[0]!
  const square = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }]
  base.forEach((index, corner) => { positions[index] = square[corner]! })
  for (let index = 0; index < vertexCount; index++) {
    if (base.includes(index)) continue
    // The vertex above a base vertex shares an edge with it.
    const below = base.find(corner => faces.some(face => {
      const at = face.indexOf(index)
      return at >= 0 && (face[(at + 1) % face.length] === corner || face[(at + face.length - 1) % face.length] === corner)
    }))!
    positions[index] = { ...positions[below]!, y: 1 }
  }
  return {
    kind: 'polyhedron', solid: 'cube', base: base.map(index => positions[index]!), top: [], apex: null,
    baseCenter: centroid(base.map(index => positions[index]!)), normal: { x: 0, y: 1, z: 0 }, height: 1,
    heightStart: positions[0]!, heightEnd: positions[0]!, vertices: positions, faces: faces.map(face => [...face]), edges: [],
  }
}
