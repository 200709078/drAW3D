import { circlePoint, polygonArea, type PlaneShape, type SolidShape, type SphereShape } from './solids'
import { addScaled, centroid, cross, distance, dot, lerp, normalize, sub, type Vec3 } from './vec3'

/** Where a plane cuts a solid: a convex polygon in the plane. */
export interface SectionShape {
  kind: 'section'
  polygon: Vec3[]
  center: Vec3
  normal: Vec3
  area: number
}

const ROUND_SEGMENTS = 96

/** Segments whose intersections with a plane outline the section of a convex solid. */
function boundarySegments(shape: SolidShape): [Vec3, Vec3][] {
  if (shape.kind === 'polyhedron') return shape.edges.map(([from, to]) => [shape.vertices[from]!, shape.vertices[to]!])
  const segments: [Vec3, Vec3][] = []
  const { baseCenter, top, u, v, radius, topRadius } = shape
  for (let index = 0; index < ROUND_SEGMENTS; index++) {
    const [a, b] = [2 * Math.PI * index / ROUND_SEGMENTS, 2 * Math.PI * (index + 1) / ROUND_SEGMENTS]
    const rim = circlePoint(baseCenter, u, v, radius, a)
    segments.push([rim, circlePoint(baseCenter, u, v, radius, b)])
    const upper = topRadius > 0 ? circlePoint(top, u, v, topRadius, a) : top
    segments.push([rim, upper])
    if (topRadius > 0) segments.push([upper, circlePoint(top, u, v, topRadius, b)])
  }
  return segments
}

/** Points ordered around their center in the plane. */
function ordered(points: Vec3[], normal: Vec3): Vec3[] {
  const center = centroid(points)
  const u = normalize(sub(points[0]!, center)) ?? { x: 1, y: 0, z: 0 }
  const v = cross(normal, u)
  return [...points].sort((a, b) => Math.atan2(dot(sub(a, center), v), dot(sub(a, center), u))
    - Math.atan2(dot(sub(b, center), v), dot(sub(b, center), u)))
}

function finish(points: Vec3[], normal: Vec3): SectionShape | null {
  const unique: Vec3[] = []
  for (const point of points) if (!unique.some(other => distance(other, point) < 1e-7)) unique.push(point)
  if (unique.length < 3) return null
  const polygon = ordered(unique, normal)
  const area = polygonArea(polygon)
  if (area < 1e-9) return null
  return { kind: 'section', polygon, center: centroid(polygon), normal, area }
}

/** The section of a solid or sphere by a plane, or null when the plane misses it. */
export function sectionOf(shape: SolidShape | SphereShape, plane: PlaneShape): SectionShape | null {
  const side = (point: Vec3) => dot(sub(point, plane.center), plane.normal)
  if (shape.kind === 'sphere') {
    const offset = side(shape.center)
    if (Math.abs(offset) >= shape.radius) return null
    const center = addScaled(shape.center, plane.normal, -offset)
    const radius = Math.sqrt(shape.radius ** 2 - offset ** 2)
    const points = Array.from({ length: ROUND_SEGMENTS }, (_, index) =>
      circlePoint(center, plane.u, plane.v, radius, 2 * Math.PI * index / ROUND_SEGMENTS))
    return finish(points, plane.normal)
  }
  const points: Vec3[] = []
  for (const [from, to] of boundarySegments(shape)) {
    const [a, b] = [side(from), side(to)]
    if (Math.abs(a) < 1e-9) points.push(from)
    if (Math.abs(b) < 1e-9) points.push(to)
    if (a * b < 0) points.push(lerp(from, to, a / (a - b)))
  }
  return finish(points, plane.normal)
}
