import { circlePoint, type PolyhedronShape, type RoundShape } from './solids'
import { add, centroid, cross, dot, normalize, scale, sub, type Vec3 } from './vec3'

/** Where the viewer is: perspective from a position, orthographic along a direction. */
export interface Viewer {
  orthographic: boolean
  position: Vec3
  /** Unit view direction, into the scene. */
  direction: Vec3
}

export type Segment = readonly [Vec3, Vec3]

export interface Outline {
  visible: Segment[]
  hidden: Segment[]
}

/** Does a face with this outward normal through `point` face the viewer? */
export function facesViewer(normal: Vec3, point: Vec3, viewer: Viewer): boolean {
  return viewer.orthographic ? dot(normal, viewer.direction) < 0 : dot(normal, sub(viewer.position, point)) > 0
}

/** Outward unit normal of each face (away from the solid's center). */
export function outwardNormals(shape: PolyhedronShape): Vec3[] {
  const center = centroid(shape.vertices)
  return shape.faces.map(face => {
    const points = face.map(index => shape.vertices[index]!)
    let normal = normalize(cross(sub(points[1]!, points[0]!), sub(points[2]!, points[0]!))) ?? { x: 0, y: 1, z: 0 }
    if (dot(normal, sub(centroid(points), center)) < 0) normal = scale(normal, -1)
    return normal
  })
}

/**
 * For a convex solid an edge is seen when at least one of its two faces is turned toward
 * the viewer; it is hidden when both are turned away.
 */
export function polyhedronEdgeVisibility(shape: PolyhedronShape, viewer: Viewer): boolean[] {
  const normals = outwardNormals(shape)
  const front = shape.faces.map((face, index) => facesViewer(normals[index]!, shape.vertices[face[0]!]!, viewer))
  return shape.edges.map(([from, to]) => shape.faces.some((face, index) => {
    if (!front[index]) return false
    const a = face.indexOf(from)
    const b = face.indexOf(to)
    return a >= 0 && b >= 0 && (Math.abs(a - b) === 1 || Math.abs(a - b) === face.length - 1)
  }))
}

/** Outward normal of the round side at an angle (constant along a generator). */
function sideNormal(shape: RoundShape, angle: number): Vec3 {
  const radial = add(scale(shape.u, Math.cos(angle)), scale(shape.v, Math.sin(angle)))
  return normalize(add(scale(radial, shape.height), scale(shape.axis, shape.radius - shape.topRadius)))!
}

/**
 * The circles of a cylinder or cone split into seen and hidden pieces, plus the silhouette
 * generators where the side turns away from the viewer (always seen).
 */
export function roundOutline(shape: RoundShape, viewer: Viewer, segments = 96): Outline {
  const visible: Segment[] = []
  const hidden: Segment[] = []
  const caps: { center: Vec3; normal: Vec3; radius: number }[] = [{ center: shape.baseCenter, normal: scale(shape.axis, -1), radius: shape.radius }]
  if (shape.topRadius > 0) caps.push({ center: shape.top, normal: shape.axis, radius: shape.topRadius })
  const capFront = caps.map(cap => facesViewer(cap.normal, cap.center, viewer))
  const step = 2 * Math.PI / segments
  for (const [index, cap] of caps.entries()) {
    for (let segment = 0; segment < segments; segment++) {
      const from = circlePoint(cap.center, shape.u, shape.v, cap.radius, segment * step)
      const to = circlePoint(cap.center, shape.u, shape.v, cap.radius, (segment + 1) * step)
      const middle = (segment + 0.5) * step
      const side = facesViewer(sideNormal(shape, middle), circlePoint(cap.center, shape.u, shape.v, cap.radius, middle), viewer)
      ;(side || capFront[index] ? visible : hidden).push([from, to])
    }
  }
  // Silhouettes: where the side's facing changes sign along the circle.
  const facing = (angle: number) => {
    const rim = circlePoint(shape.baseCenter, shape.u, shape.v, shape.radius, angle)
    const normal = sideNormal(shape, angle)
    return viewer.orthographic ? -dot(normal, viewer.direction) : dot(normal, sub(viewer.position, rim))
  }
  for (let segment = 0; segment < segments; segment++) {
    const [a, b] = [segment * step, (segment + 1) * step]
    const [fa, fb] = [facing(a), facing(b)]
    if (fa === 0 || Math.sign(fa) === Math.sign(fb)) continue
    const angle = a + (b - a) * fa / (fa - fb)
    const rim = circlePoint(shape.baseCenter, shape.u, shape.v, shape.radius, angle)
    visible.push([rim, shape.topRadius > 0 ? circlePoint(shape.top, shape.u, shape.v, shape.topRadius, angle) : shape.top])
  }
  return { visible, hidden }
}
