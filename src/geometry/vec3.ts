/** Plain 3D vectors: structured-cloneable, so models and history snapshots hold them directly. */
export interface Vec3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

export const EPSILON = 1e-9
/** Positions closer than this are the same point. */
export const SAME_POINT = 1e-3

export const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 }
export const UP: Vec3 = { x: 0, y: 1, z: 0 }
export const X_AXIS: Vec3 = { x: 1, y: 0, z: 0 }
export const Z_AXIS: Vec3 = { x: 0, y: 0, z: 1 }

export function vec(x: number, y: number, z: number): Vec3 {
  return { x, y, z }
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

export function scale(a: Vec3, factor: number): Vec3 {
  return { x: a.x * factor, y: a.y * factor, z: a.z * factor }
}

/** a + b·factor */
export function addScaled(a: Vec3, b: Vec3, factor: number): Vec3 {
  return { x: a.x + b.x * factor, y: a.y + b.y * factor, z: a.z + b.z * factor }
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

export function length(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z)
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

/** Unit vector, or null for a (near) zero vector. */
export function normalize(a: Vec3): Vec3 | null {
  const size = length(a)
  return size > EPSILON ? scale(a, 1 / size) : null
}

export function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }
}

export function centroid(points: readonly Vec3[]): Vec3 {
  let x = 0
  let y = 0
  let z = 0
  for (const point of points) {
    x += point.x
    y += point.y
    z += point.z
  }
  const count = Math.max(points.length, 1)
  return { x: x / count, y: y / count, z: z / count }
}

/** Rotate a vector around a unit axis (Rodrigues). */
export function rotateVector(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const k = cross(axis, v)
  const along = dot(axis, v) * (1 - cos)
  return {
    x: v.x * cos + k.x * sin + axis.x * along,
    y: v.y * cos + k.y * sin + axis.y * along,
    z: v.z * cos + k.z * sin + axis.z * along,
  }
}

/** Rotate a point around the line through `origin` with unit direction `axis`. */
export function rotateAround(point: Vec3, origin: Vec3, axis: Vec3, angle: number): Vec3 {
  return add(origin, rotateVector(sub(point, origin), axis, angle))
}

/** Unit vector perpendicular to a unit vector; stable for every direction. */
export function anyPerpendicular(unit: Vec3): Vec3 {
  const helper = Math.abs(unit.y) < 0.9 ? UP : X_AXIS
  return normalize(cross(helper, unit))!
}

/** Component of v perpendicular to the unit vector n. */
export function rejectFrom(v: Vec3, n: Vec3): Vec3 {
  return addScaled(v, n, -dot(v, n))
}

export function isFiniteVec(v: Vec3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)
}

export function angleBetween(a: Vec3, b: Vec3): number {
  // atan2 stays accurate near 0 and π, unlike acos of the dot product.
  return Math.atan2(length(cross(a, b)), dot(a, b))
}

export const toRadians = (degrees: number): number => degrees * Math.PI / 180
export const atan2Degrees = (y: number, x: number): number => Math.atan2(y, x) * 180 / Math.PI
export const toDegrees = (radians: number): number => radians * 180 / Math.PI
export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

export interface Ray {
  origin: Vec3
  /** Unit direction. */
  direction: Vec3
}

export function pointOnRay(ray: Ray, t: number): Vec3 {
  return addScaled(ray.origin, ray.direction, t)
}

/** Distance along the ray to the plane through `point` with normal `normal`; null if parallel or behind. */
export function intersectPlane(ray: Ray, point: Vec3, normal: Vec3): number | null {
  const denominator = dot(ray.direction, normal)
  if (Math.abs(denominator) < EPSILON) return null
  const t = dot(sub(point, ray.origin), normal) / denominator
  return t >= 0 ? t : null
}

/** Parameter on the line a + s·d (d not necessarily unit) closest to the ray. */
export function closestOnLineToRay(a: Vec3, d: Vec3, ray: Ray): number | null {
  const w = sub(a, ray.origin)
  const dd = dot(d, d)
  const de = dot(d, ray.direction)
  const denominator = dd - de * de
  if (dd < EPSILON || Math.abs(denominator) < EPSILON * dd) return null
  return (de * dot(w, ray.direction) - dot(w, d)) / denominator
}

/** Möller–Trumbore; distance along the ray or null. */
export function intersectTriangle(ray: Ray, a: Vec3, b: Vec3, c: Vec3): number | null {
  const edge1 = sub(b, a)
  const edge2 = sub(c, a)
  const p = cross(ray.direction, edge2)
  const det = dot(edge1, p)
  if (Math.abs(det) < EPSILON) return null
  const inverse = 1 / det
  const s = sub(ray.origin, a)
  const u = dot(s, p) * inverse
  if (u < 0 || u > 1) return null
  const q = cross(s, edge1)
  const v = dot(ray.direction, q) * inverse
  if (v < 0 || u + v > 1) return null
  const t = dot(edge2, q) * inverse
  return t > EPSILON ? t : null
}
