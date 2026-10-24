import { circlePoint, type Shape } from './solids'
import {
  EPSILON, add, addScaled, anyPerpendicular, centroid, clamp, closestOnLineToRay, cross, distance, dot, intersectPlane,
  intersectTriangle, length, lerp, normalize, pointOnRay, rejectFrom, scale, sub, type Ray, type Vec3,
} from './vec3'

/**
 * A part is an edge (curve) or face (surface) of an object that a point can lie on. Each part
 * has its own parameter space; a constrained point stores only its part index and parameters,
 * so it follows the object when the object changes.
 */
export interface Part {
  readonly dimension: 1 | 2
  position(params: readonly number[]): Vec3
  /** Parameters of the part point nearest to `point`. */
  project(point: Vec3): number[]
  /** Unit directions a point can move in at `params` (the select tool's arrows). */
  tangents(params: readonly number[]): Vec3[]
  /** Curves: a polyline for screen-space hit tests. Surfaces: a flat list of triangle corners. */
  samples(): Vec3[]
  /** Parameters under a pointer ray while dragging; null keeps the point where it is. */
  fromRay(ray: Ray): number[] | null
}

const CURVE_SAMPLES = 96
const ROUND_SEGMENTS = 48

function nearestTriangleHit(triangles: readonly Vec3[], ray: Ray): Vec3 | null {
  let best = Infinity
  for (let index = 0; index + 2 < triangles.length; index += 3) {
    const t = intersectTriangle(ray, triangles[index]!, triangles[index + 1]!, triangles[index + 2]!)
    if (t !== null && t < best) best = t
  }
  return Number.isFinite(best) ? pointOnRay(ray, best) : null
}

function memo<T>(create: () => T): () => T {
  let value: T | undefined
  return () => (value ??= create())
}

export function segmentPart(start: Vec3, end: Vec3, range: readonly [number, number] = [0, 1]): Part {
  const d = sub(end, start)
  const unit = normalize(d)
  const [min, max] = range
  const at = (t: number) => addScaled(start, d, clamp(t, min, max))
  return {
    dimension: 1,
    position: ([t = 0]) => at(t),
    project: point => [clamp(dot(sub(point, start), d) / Math.max(dot(d, d), EPSILON), min, max)],
    tangents: () => (unit ? [unit] : []),
    samples: () => [at(min), at(max)],
    fromRay: ray => {
      const t = closestOnLineToRay(start, d, ray)
      return t === null ? null : [clamp(t, min, max)]
    },
  }
}

/** A circle, or with `sweep` an arc whose parameter runs 0 → 1 from u around u × v. */
export function circlePart(center: Vec3, u: Vec3, v: Vec3, radius: number, sweep?: number): Part {
  const normal = cross(u, v)
  const angleOf = (t: number) => (sweep === undefined ? t : clamp(t, 0, 1) * sweep)
  const paramOf = (point: Vec3) => {
    const relative = sub(point, center)
    let angle = Math.atan2(dot(relative, v), dot(relative, u))
    if (sweep === undefined) return [angle]
    if (angle < 0) angle += 2 * Math.PI
    // Outside the arc, snap to the nearer end.
    if (angle > sweep) angle = angle - sweep < 2 * Math.PI - angle ? sweep : 0
    return [sweep > EPSILON ? angle / sweep : 0]
  }
  return {
    dimension: 1,
    position: ([t = 0]) => circlePoint(center, u, v, radius, angleOf(t)),
    project: paramOf,
    tangents: ([t = 0]) => {
      const angle = angleOf(t)
      return [add(scale(u, -Math.sin(angle)), scale(v, Math.cos(angle)))]
    },
    samples: memo(() => {
      const points: Vec3[] = []
      const total = sweep ?? 2 * Math.PI
      const count = Math.max(8, Math.ceil(CURVE_SAMPLES * total / (2 * Math.PI)))
      for (let index = 0; index <= count; index++) points.push(circlePoint(center, u, v, radius, total * index / count))
      return points
    }),
    fromRay: ray => {
      const t = intersectPlane(ray, center, normal)
      return t === null ? null : paramOf(pointOnRay(ray, t))
    },
  }
}

function insideConvex(polygon: readonly Vec3[], normal: Vec3, point: Vec3): boolean {
  for (let index = 0; index < polygon.length; index++) {
    const from = polygon[index]!
    const to = polygon[(index + 1) % polygon.length]!
    if (dot(cross(sub(to, from), sub(point, from)), normal) < -EPSILON) return false
  }
  return true
}

function closestOnSegment(point: Vec3, from: Vec3, to: Vec3): Vec3 {
  const d = sub(to, from)
  return lerp(from, to, clamp(dot(sub(point, from), d) / Math.max(dot(d, d), EPSILON), 0, 1))
}

/**
 * A planar convex face. Parameters are coordinates around the face center in units of the
 * face size, so a point keeps its relative place when the solid is scaled.
 */
export function polygonPart(polygon: readonly Vec3[]): Part {
  const center = centroid(polygon)
  let normal = cross(sub(polygon[1]!, polygon[0]!), sub(polygon[2]!, polygon[0]!))
  // Orient the normal so that the polygon winds counterclockwise around it.
  normal = normalize(normal) ?? anyPerpendicular(normalize(sub(polygon[1]!, polygon[0]!)) ?? { x: 1, y: 0, z: 0 })
  const e1 = normalize(rejectFrom(sub(polygon[1]!, polygon[0]!), normal)) ?? anyPerpendicular(normal)
  const e2 = cross(normal, e1)
  const size = Math.max(...polygon.map(vertex => distance(vertex, center)), EPSILON)
  const clampInside = (point: Vec3) => {
    const onPlane = addScaled(point, normal, -dot(sub(point, center), normal))
    if (insideConvex(polygon, normal, onPlane)) return onPlane
    let best = polygon[0]!
    let bestDistance = Infinity
    for (let index = 0; index < polygon.length; index++) {
      const candidate = closestOnSegment(onPlane, polygon[index]!, polygon[(index + 1) % polygon.length]!)
      const candidateDistance = distance(candidate, onPlane)
      if (candidateDistance < bestDistance) [best, bestDistance] = [candidate, candidateDistance]
    }
    return best
  }
  const paramOf = (point: Vec3) => {
    const relative = sub(clampInside(point), center)
    return [dot(relative, e1) / size, dot(relative, e2) / size]
  }
  return {
    dimension: 2,
    position: ([s = 0, t = 0]) => clampInside(add(center, add(scale(e1, s * size), scale(e2, t * size)))),
    project: paramOf,
    tangents: () => [e1, e2],
    samples: memo(() => polygon.slice(1, -1).flatMap((vertex, index) => [polygon[0]!, vertex, polygon[index + 2]!])),
    fromRay: ray => {
      const t = intersectPlane(ray, center, normal)
      return t === null ? null : paramOf(pointOnRay(ray, t))
    },
  }
}

/** A square plane; parameters are world distances from the center along u and v. */
export function planePart(center: Vec3, u: Vec3, v: Vec3, size: number): Part {
  const half = size / 2
  const normal = cross(u, v)
  const paramOf = (point: Vec3) => {
    const relative = sub(point, center)
    return [clamp(dot(relative, u), -half, half), clamp(dot(relative, v), -half, half)]
  }
  const at = (s: number, t: number) => add(center, add(scale(u, clamp(s, -half, half)), scale(v, clamp(t, -half, half))))
  return {
    dimension: 2,
    position: ([s = 0, t = 0]) => at(s, t),
    project: paramOf,
    tangents: () => [u, v],
    samples: memo(() => {
      const [a, b, c, d] = [at(-half, -half), at(half, -half), at(half, half), at(-half, half)]
      return [a, b, c, a, c, d]
    }),
    fromRay: ray => {
      const t = intersectPlane(ray, center, normal)
      return t === null ? null : paramOf(pointOnRay(ray, t))
    },
  }
}

/** Parameters are the unit direction from the center. */
export function spherePart(center: Vec3, radius: number): Part {
  const paramOf = (point: Vec3) => {
    const direction = normalize(sub(point, center)) ?? { x: 0, y: 1, z: 0 }
    return [direction.x, direction.y, direction.z]
  }
  return {
    dimension: 2,
    position: ([x = 0, y = 1, z = 0]) => addScaled(center, normalize({ x, y, z }) ?? { x: 0, y: 1, z: 0 }, radius),
    project: paramOf,
    tangents: ([x = 0, y = 1, z = 0]) => {
      const normal = normalize({ x, y, z }) ?? { x: 0, y: 1, z: 0 }
      const first = anyPerpendicular(normal)
      return [first, cross(normal, first)]
    },
    samples: memo(() => {
      const triangles: Vec3[] = []
      const rings = 16
      const segments = 24
      const at = (ring: number, segment: number) => {
        const polar = Math.PI * ring / rings
        const azimuth = 2 * Math.PI * segment / segments
        return add(center, scale({
          x: Math.sin(polar) * Math.cos(azimuth), y: Math.cos(polar), z: Math.sin(polar) * Math.sin(azimuth),
        }, radius))
      }
      for (let ring = 0; ring < rings; ring++) {
        for (let segment = 0; segment < segments; segment++) {
          const [a, b, c, d] = [at(ring, segment), at(ring + 1, segment), at(ring + 1, segment + 1), at(ring, segment + 1)]
          triangles.push(a, b, c, a, c, d)
        }
      }
      return triangles
    }),
    fromRay: ray => {
      const toCenter = sub(center, ray.origin)
      const along = dot(toCenter, ray.direction)
      const squared = dot(toCenter, toCenter) - along * along
      if (squared <= radius * radius) {
        const half = Math.sqrt(radius * radius - squared)
        const t = along - half > 0 ? along - half : along + half
        if (t > 0) return paramOf(pointOnRay(ray, t))
      }
      return paramOf(pointOnRay(ray, Math.max(along, 0)))
    },
  }
}

/**
 * The side of a cylinder (topRadius = radius) or cone (topRadius = 0). Parameters are the
 * angle around the axis and the height fraction from the base.
 */
export function roundSidePart(
  base: Vec3, axis: Vec3, u: Vec3, v: Vec3, radius: number, height: number, topRadius: number,
): Part {
  const at = (angle: number, fraction: number) => {
    const f = clamp(fraction, 0, 1)
    return addScaled(circlePoint(base, u, v, radius + (topRadius - radius) * f, angle), axis, height * f)
  }
  const paramOf = (point: Vec3) => {
    const relative = sub(point, base)
    return [Math.atan2(dot(relative, v), dot(relative, u)), clamp(dot(relative, axis) / height, 0, 1)]
  }
  const samples = memo(() => {
    const triangles: Vec3[] = []
    for (let index = 0; index < ROUND_SEGMENTS; index++) {
      const [from, to] = [2 * Math.PI * index / ROUND_SEGMENTS, 2 * Math.PI * (index + 1) / ROUND_SEGMENTS]
      const [a, b, c, d] = [at(from, 0), at(to, 0), at(to, 1), at(from, 1)]
      triangles.push(a, b, c, a, c, d)
    }
    return triangles
  })
  return {
    dimension: 2,
    position: ([angle = 0, fraction = 0]) => at(angle, fraction),
    project: paramOf,
    tangents: ([angle = 0, fraction = 0]) => [
      add(scale(u, -Math.sin(angle)), scale(v, Math.cos(angle))),
      normalize(sub(at(angle, Math.min(fraction + 0.01, 1)), at(angle, Math.max(fraction - 0.01, 0)))) ?? axis,
    ],
    samples,
    fromRay: ray => {
      const hit = nearestTriangleHit(samples(), ray)
      if (hit) return paramOf(hit)
      const t = closestOnLineToRay(base, axis, ray)
      return t === null ? null : paramOf(pointOnRay(ray, Math.max(0, dot(sub(addScaled(base, axis, t), ray.origin), ray.direction))))
    },
  }
}

/** A disk; parameters are the angle and the radius fraction. */
export function diskPart(center: Vec3, u: Vec3, v: Vec3, radius: number): Part {
  const normal = cross(u, v)
  const paramOf = (point: Vec3) => {
    const relative = sub(point, center)
    const [x, y] = [dot(relative, u), dot(relative, v)]
    return [Math.atan2(y, x), clamp(Math.hypot(x, y) / radius, 0, 1)]
  }
  return {
    dimension: 2,
    position: ([angle = 0, fraction = 0]) => circlePoint(center, u, v, radius * clamp(fraction, 0, 1), angle),
    project: paramOf,
    tangents: ([angle = 0]) => [
      add(scale(u, -Math.sin(angle)), scale(v, Math.cos(angle))),
      add(scale(u, Math.cos(angle)), scale(v, Math.sin(angle))),
    ],
    samples: memo(() => {
      const triangles: Vec3[] = []
      for (let index = 0; index < ROUND_SEGMENTS; index++) {
        triangles.push(center,
          circlePoint(center, u, v, radius, 2 * Math.PI * index / ROUND_SEGMENTS),
          circlePoint(center, u, v, radius, 2 * Math.PI * (index + 1) / ROUND_SEGMENTS))
      }
      return triangles
    }),
    fromRay: ray => {
      const t = intersectPlane(ray, center, normal)
      return t === null ? null : paramOf(pointOnRay(ray, t))
    },
  }
}

const partCache = new WeakMap<Shape, Part[]>()

/**
 * Parts of a shape in a fixed order:
 * - line: the drawn line; plane: the square; sphere: the surface;
 * - angle: arm to A, arm to C, arc;
 * - prism/pyramid: every edge (shape.edges order), then every face (shape.faces order);
 * - cylinder and cut cone: base circle, top circle, side, base disk, top disk;
 * - cone: base circle, side, base disk;
 * - section: the polygon, then its edges.
 */
export function partsOf(shape: Shape): Part[] {
  const cached = partCache.get(shape)
  if (cached) return cached
  const parts = createParts(shape)
  partCache.set(shape, parts)
  return parts
}

function createParts(shape: Shape): Part[] {
  switch (shape.kind) {
    case 'line': {
      if (shape.extent === 'segment') return [segmentPart(shape.a, shape.b)]
      const d = length(sub(shape.b, shape.a))
      const startT = shape.extent === 'ray' ? 0 : dot(sub(shape.start, shape.a), shape.direction) / d
      const endT = dot(sub(shape.end, shape.a), shape.direction) / d
      return [segmentPart(shape.a, shape.b, [startT, endT])]
    }
    case 'plane':
      return [planePart(shape.center, shape.u, shape.v, shape.size)]
    case 'sphere':
      return [spherePart(shape.center, shape.radius)]
    case 'angle':
      return [
        segmentPart(shape.vertex, shape.a),
        segmentPart(shape.vertex, shape.c),
        circlePart(shape.vertex, shape.u, shape.v, shape.arcRadius, shape.radians),
      ]
    case 'polyhedron':
      return [
        ...shape.edges.map(([from, to]) => segmentPart(shape.vertices[from]!, shape.vertices[to]!)),
        ...shape.faces.map(face => polygonPart(face.map(index => shape.vertices[index]!))),
      ]
    case 'section':
      return [
        polygonPart(shape.polygon),
        ...shape.polygon.map((point, index) => segmentPart(point, shape.polygon[(index + 1) % shape.polygon.length]!)),
      ]
    case 'round': {
      const { baseCenter, axis, u, v, radius, height, top, topRadius } = shape
      if (topRadius > 0) {
        return [
          circlePart(baseCenter, u, v, radius),
          circlePart(top, u, v, topRadius),
          roundSidePart(baseCenter, axis, u, v, radius, height, topRadius),
          diskPart(baseCenter, u, v, radius),
          diskPart(top, u, v, topRadius),
        ]
      }
      return [
        circlePart(baseCenter, u, v, radius),
        roundSidePart(baseCenter, axis, u, v, radius, height, 0),
        diskPart(baseCenter, u, v, radius),
      ]
    }
  }
}

/** Nearest part to a point, for points whose part no longer exists (fewer sides). */
export function nearestPart(parts: readonly Part[], point: Vec3): { part: number; params: number[] } | null {
  let best: { part: number; params: number[] } | null = null
  let bestDistance = Infinity
  parts.forEach((part, index) => {
    const params = part.project(point)
    const candidate = distance(part.position(params), point)
    // Prefer edges at equal distance: a vertex-near point stays on the edge.
    if (candidate < bestDistance - 1e-9) {
      best = { part: index, params }
      bestDistance = candidate
    }
  })
  return best
}
