import type { SectionShape } from './section'
import type { LineKind, PolyhedronKind, RegularKind, RoundKind } from './types'
import {
  EPSILON, UP, X_AXIS, add, addScaled, angleBetween, anyPerpendicular, centroid, cross, distance, dot,
  length, lerp, normalize, rotateAround, scale, sub, vec, type Vec3,
} from './vec3'

/** Drawn length of a line (centered between its points) and of a ray. */
export const LINE_LENGTH = 100
export const RAY_LENGTH = 50
export const PLANE_SIZE = 30
export const ANGLE_ARC_RADIUS = 1

export interface LineShape {
  kind: 'line'
  extent: LineKind
  a: Vec3
  b: Vec3
  /** Unit direction a → b. */
  direction: Vec3
  /** Drawn part: segment ends, a line centered between a and b, or a ray from a. */
  start: Vec3
  end: Vec3
}

export interface PlaneShape {
  kind: 'plane'
  center: Vec3
  normal: Vec3
  /** In-plane unit axes; u points from the first to the second point. */
  u: Vec3
  v: Vec3
  size: number
}

export interface AngleShape {
  kind: 'angle'
  a: Vec3
  vertex: Vec3
  c: Vec3
  normal: Vec3
  /** Unit direction of the first arm; the arc sweeps from it around `normal`. */
  u: Vec3
  v: Vec3
  radians: number
  arcRadius: number
}

export interface SphereShape {
  kind: 'sphere'
  center: Vec3
  radius: number
}

/** Prisms, pyramids, frustums (cut pyramids) and the regular polyhedra. */
export type PolyhedronSolid = PolyhedronKind | 'frustum' | RegularKind

export interface PolyhedronShape {
  kind: 'polyhedron'
  solid: PolyhedronSolid
  /** Base polygon; base[0] = A, base[1] = B. */
  base: Vec3[]
  /** Prism and frustum: the top polygon. Otherwise empty. */
  top: Vec3[]
  /** Pyramid apex (also the apex a frustum was cut from); null otherwise. */
  apex: Vec3 | null
  baseCenter: Vec3
  /** Unit normal from the base toward the top/apex. */
  normal: Vec3
  height: number
  /**
   * The dashed height line: A–A' for a prism, center–apex for a pyramid, center–top center
   * for a frustum. Regular polyhedra have none (start equals end).
   */
  heightStart: Vec3
  heightEnd: Vec3
  /** Prism and frustum: base then top. Pyramid: base then apex. Regular: A, B, then the rest. */
  vertices: Vec3[]
  /** Vertex indices of each face, base first (prism/frustum: then the top, then the sides). */
  faces: number[][]
  /** Prism/frustum: base edges, top edges, side edges. Pyramid: base, then sides. */
  edges: [number, number][]
  /** Cube only: which of the 11 nets opens. */
  net?: number
}

export interface RoundShape {
  kind: 'round'
  solid: RoundKind
  baseCenter: Vec3
  /** Unit height direction. */
  axis: Vec3
  /** Unit radius direction toward the radius point, and the tangent axis × u. */
  u: Vec3
  v: Vec3
  radius: number
  height: number
  /** Cylinder and cut cone: top center. Cone: apex. */
  top: Vec3
  /** Top circle radius: the radius for a cylinder, 0 for a cone, between for a cut cone. */
  topRadius: number
  /** The radius point on the base circle. */
  rim: Vec3
  /** The top circle's point above the radius point; the apex of a cone. */
  topRim: Vec3
}

export type SolidShape = PolyhedronShape | RoundShape
export type Shape = LineShape | PlaneShape | AngleShape | SphereShape | SolidShape | SectionShape

export function lineShape(extent: LineKind, a: Vec3, b: Vec3): LineShape | null {
  const direction = normalize(sub(b, a))
  if (!direction) return null
  if (extent === 'segment') return { kind: 'line', extent, a, b, direction, start: a, end: b }
  if (extent === 'ray') return { kind: 'line', extent, a, b, direction, start: a, end: addScaled(a, direction, RAY_LENGTH) }
  const middle = scale(add(a, b), 0.5)
  return {
    kind: 'line', extent, a, b, direction,
    start: addScaled(middle, direction, -LINE_LENGTH / 2),
    end: addScaled(middle, direction, LINE_LENGTH / 2),
  }
}

export function planeShape(a: Vec3, b: Vec3, c: Vec3): PlaneShape | null {
  const normal = normalize(cross(sub(b, a), sub(c, a)))
  const u = normalize(sub(b, a))
  if (!normal || !u) return null
  return { kind: 'plane', center: centroid([a, b, c]), normal, u, v: cross(normal, u), size: PLANE_SIZE }
}

export function arePointsCollinear(a: Vec3, b: Vec3, c: Vec3): boolean {
  const ab = sub(b, a)
  const ac = sub(c, a)
  return length(cross(ab, ac)) <= 1e-4 * Math.max(length(ab) * length(ac), EPSILON)
}

export function angleShape(a: Vec3, vertex: Vec3, c: Vec3): AngleShape | null {
  const u = normalize(sub(a, vertex))
  const w = normalize(sub(c, vertex))
  if (!u || !w) return null
  // A straight or zero angle has no plane of its own; any plane through the arms works.
  const normal = normalize(cross(u, w)) ?? anyPerpendicular(u)
  return {
    kind: 'angle', a, vertex, c, normal, u, v: cross(normal, u),
    radians: angleBetween(u, w), arcRadius: ANGLE_ARC_RADIUS,
  }
}

export function sphereShape(center: Vec3, surface: Vec3): SphereShape | null {
  const radius = distance(center, surface)
  return radius > EPSILON ? { kind: 'sphere', center, radius } : null
}

/** Default third point of a prism/pyramid: horizontal, perpendicular to AB, |AB| from its middle. */
export function initialSidePoint(a: Vec3, b: Vec3): Vec3 {
  const middle = scale(add(a, b), 0.5)
  const flat = normalize(vec(b.x - a.x, 0, b.z - a.z))
  if (!flat) return add(middle, X_AXIS)
  return addScaled(middle, vec(-flat.z, 0, flat.x), distance(a, b))
}

/**
 * Regular n-gon with first edge AB in the plane ABC, on the side of AB away from C.
 * Null when AB is degenerate or C lies on line AB.
 */
export function regularPolygonFromEdge(a: Vec3, b: Vec3, c: Vec3, sides: number): Vec3[] | null {
  const ab = sub(b, a)
  const side = length(ab)
  if (side < EPSILON || sides < 3) return null
  let normal = normalize(cross(ab, sub(c, a)))
  if (!normal) return null
  const middle = scale(add(a, b), 0.5)
  let inward = normalize(cross(normal, ab))!
  if (dot(sub(c, middle), inward) > 0) inward = scale(inward, -1)
  const center = addScaled(middle, inward, side / (2 * Math.tan(Math.PI / sides)))
  const step = 2 * Math.PI / sides
  if (distance(rotateAround(a, center, normal, step), b) > 1e-6 * Math.max(side, 1)) normal = scale(normal, -1)
  const vertices = [a, b]
  for (let index = 2; index < sides; index++) vertices.push(rotateAround(a, center, normal, step * index))
  return vertices
}

/** Unit normal of the base toward the solid: the opposite of AB × AC. */
function polyhedronNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 | null {
  const normal = normalize(cross(sub(b, a), sub(c, a)))
  return normal ? scale(normal, -1) : null
}

export function polyhedronShape(
  solid: PolyhedronKind, a: Vec3, b: Vec3, c: Vec3, sides: number, height: number, topRatio?: number,
): PolyhedronShape | null {
  const base = regularPolygonFromEdge(a, b, c, sides)
  const normal = polyhedronNormal(a, b, c)
  if (!base || !normal || !(height > 0)) return null
  const n = base.length
  const baseCenter = centroid(base)
  const baseFace = base.map((_, index) => index)
  const baseEdges = base.map((_, index): [number, number] => [index, (index + 1) % n])
  if (solid === 'prism') {
    const top = base.map(vertex => addScaled(vertex, normal, height))
    const faces = [baseFace, baseFace.map(index => n + index)]
    for (let index = 0; index < n; index++) faces.push([index, (index + 1) % n, n + (index + 1) % n, n + index])
    return {
      kind: 'polyhedron', solid, base, top, apex: null, baseCenter, normal, height,
      heightStart: a, heightEnd: top[0]!,
      vertices: [...base, ...top], faces,
      edges: [...baseEdges, ...baseEdges.map(([from, to]): [number, number] => [n + from, n + to]),
        ...base.map((_, index): [number, number] => [index, n + index])],
    }
  }
  if (topRatio !== undefined && topRatio > 0 && topRatio < 1) {
    // A frustum: the pyramid of height h / (1 − k) cut at height h.
    const apex = addScaled(baseCenter, normal, height / (1 - topRatio))
    const top = base.map(vertex => lerp(vertex, apex, 1 - topRatio))
    const faces = [baseFace, baseFace.map(index => n + index)]
    for (let index = 0; index < n; index++) faces.push([index, (index + 1) % n, n + (index + 1) % n, n + index])
    return {
      kind: 'polyhedron', solid: 'frustum', base, top, apex, baseCenter, normal, height,
      heightStart: baseCenter, heightEnd: addScaled(baseCenter, normal, height),
      vertices: [...base, ...top], faces,
      edges: [...baseEdges, ...baseEdges.map(([from, to]): [number, number] => [n + from, n + to]),
        ...base.map((_, index): [number, number] => [index, n + index])],
    }
  }
  const apex = addScaled(baseCenter, normal, height)
  return {
    kind: 'polyhedron', solid, base, top: [], apex, baseCenter, normal, height,
    heightStart: baseCenter, heightEnd: apex,
    vertices: [...base, apex],
    faces: [baseFace, ...base.map((_, index) => [index, (index + 1) % n, n])],
    edges: [...baseEdges, ...base.map((_, index): [number, number] => [index, n])],
  }
}

/** Height direction of a cylinder/cone: world up made perpendicular to the radius. */
export function roundAxis(center: Vec3, rim: Vec3): Vec3 {
  const radial = normalize(sub(rim, center))
  if (!radial) return UP
  return normalize(addScaled(UP, radial, -dot(UP, radial))) ?? X_AXIS
}

/** A cylinder, a cone, or with `topRatio` (0–1) a cone cut parallel to its base. */
export function roundShape(solid: RoundKind, center: Vec3, rim: Vec3, height: number, topRatio?: number): RoundShape | null {
  const radial = sub(rim, center)
  const radius = length(radial)
  const u = normalize(radial)
  if (!u || !(height > 0)) return null
  const axis = roundAxis(center, rim)
  const top = addScaled(center, axis, height)
  const ratio = solid === 'cylinder' ? 1 : topRatio !== undefined && topRatio > 0 && topRatio < 1 ? topRatio : 0
  const topRadius = radius * ratio
  return {
    kind: 'round', solid, baseCenter: center, axis, u, v: cross(axis, u), radius, height, top, topRadius, rim,
    topRim: addScaled(top, u, topRadius),
  }
}

export function circlePoint(center: Vec3, u: Vec3, v: Vec3, radius: number, angle: number): Vec3 {
  return add(center, add(scale(u, Math.cos(angle) * radius), scale(v, Math.sin(angle) * radius)))
}

/** Slant length of a round solid's side. */
export function slantLength(shape: RoundShape): number {
  return Math.hypot(shape.height, shape.radius - shape.topRadius)
}

/** Total surface area, used to check that nets keep every face. */
export function surfaceArea(shape: SolidShape): number {
  if (shape.kind === 'round') {
    const [r, t] = [shape.radius, shape.topRadius]
    return Math.PI * (r + t) * slantLength(shape) + Math.PI * (r * r + t * t)
  }
  return shape.faces.reduce((sum, face) => sum + polygonArea(face.map(index => shape.vertices[index]!)), 0)
}

export function polygonArea(polygon: readonly Vec3[]): number {
  let total = vec(0, 0, 0)
  for (let index = 1; index + 1 < polygon.length; index++) {
    total = add(total, cross(sub(polygon[index]!, polygon[0]!), sub(polygon[index + 1]!, polygon[0]!)))
  }
  return length(total) / 2
}

/** Volume of a convex polyhedron: pyramids from its center over every face. */
function polyhedronVolume(shape: PolyhedronShape): number {
  const center = centroid(shape.vertices)
  let total = 0
  for (const face of shape.faces) {
    const points = face.map(index => shape.vertices[index]!)
    const normal = normalize(cross(sub(points[1]!, points[0]!), sub(points[2]!, points[0]!)))
    if (!normal) continue
    total += polygonArea(points) * Math.abs(dot(sub(points[0]!, center), normal)) / 3
  }
  return total
}

export function solidVolume(shape: SolidShape): number {
  if (shape.kind === 'round') {
    const [r, t] = [shape.radius, shape.topRadius]
    return Math.PI * shape.height * (r * r + r * t + t * t) / 3
  }
  return polyhedronVolume(shape)
}
