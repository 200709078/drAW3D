import { polyhedronMaxAngle, unfoldPolyhedronNet } from './nets'
import { circlePoint, type PolyhedronShape, type RoundShape, type SolidShape } from './solids'
import {
  EPSILON, add, addScaled, atan2Degrees, clamp, cross, dot, normalize, rotateAround, rotateVector, scale, sub, toDegrees,
  toRadians, type Vec3,
} from './vec3'

/**
 * A net at some opening angle: faces are planar polygons (curved surfaces arrive as a grid
 * of quads), outlines are the cut and fold lines as polylines. Pure data, no rendering.
 */
export interface Net {
  faces: Vec3[][]
  outlines: Vec3[][]
  /** Polyhedra: the solid's vertex index of every face corner, and the edges folded along. */
  faceVertices?: number[][]
  folds?: [number, number][]
  /** Round solids: the cut edge of the side that is glued to its other end. */
  seam?: [Vec3, Vec3]
}

/** Largest opening angle in degrees: where every face reaches the base plane. */
export function maxUnfoldAngle(shape: SolidShape): number {
  if (shape.kind === 'polyhedron') return toDegrees(polyhedronMaxAngle(shape))
  if (shape.solid === 'cylinder') return 90
  // The slant line turns from its own angle with the base down onto the base plane.
  return 180 - atan2Degrees(shape.height, shape.radius - shape.topRadius)
}

const ROUND_SEGMENTS = 64
const SIDE_ROWS = 1

export function unfoldSolid(shape: SolidShape, angleDegrees: number): Net {
  const max = maxUnfoldAngle(shape)
  const angle = clamp(angleDegrees, 0, max)
  if (shape.kind === 'polyhedron') return unfoldPolyhedron(shape, toRadians(angle))
  const progress = max > 0 ? angle / max : 0
  return shape.solid === 'cylinder' ? unfoldCylinder(shape, progress) : unfoldCone(shape, progress)
}

/**
 * Faces open along the net's tree (`geometry/nets.ts`): each turns about the edge it shares
 * with its parent by the angle, at most until it lies in the parent's plane.
 */
function unfoldPolyhedron(shape: PolyhedronShape, angle: number): Net {
  const net = unfoldPolyhedronNet(shape, angle)
  return {
    faces: net.faces, outlines: net.faces.map(face => [...face, face[0]!]),
    faceVertices: net.faceVertices, folds: net.folds,
  }
}

function circle(center: Vec3, u: Vec3, v: Vec3, radius: number): Vec3[] {
  const points: Vec3[] = []
  for (let index = 0; index <= ROUND_SEGMENTS; index++) {
    points.push(circlePoint(center, u, v, radius, 2 * Math.PI * index / ROUND_SEGMENTS))
  }
  return points
}

function disk(center: Vec3, u: Vec3, v: Vec3, radius: number): Vec3[][] {
  const rim = circle(center, u, v, radius)
  return rim.slice(0, -1).map((point, index) => [center, point, rim[index + 1]!])
}

/**
 * The side rolls off the cylinder along the line through the radius point: its curvature
 * drops from 1/r to 0 while the sheet turns down onto the base plane around the base
 * tangent. Arc length is kept, so every intermediate state is a real bending of the side.
 */
function unfoldCylinder(shape: RoundShape, progress: number): Net {
  const { baseCenter, axis, u, v, radius, height, rim } = shape
  const curvature = (1 - progress) / radius
  const tilt = progress * Math.PI / 2
  const place = (point: Vec3) => rotateAround(point, rim, v, tilt)
  const sidePoint = (arc: number, z: number) => {
    const across = curvature > EPSILON ? Math.sin(curvature * arc) / curvature : arc
    const inward = curvature > EPSILON ? (1 - Math.cos(curvature * arc)) / curvature : 0
    return place(addScaled(addScaled(addScaled(rim, v, across), u, -inward), axis, z))
  }
  const halfWidth = Math.PI * radius
  const grid: Vec3[][] = []
  for (let column = 0; column <= ROUND_SEGMENTS; column++) {
    const arc = -halfWidth + 2 * halfWidth * column / ROUND_SEGMENTS
    const line: Vec3[] = []
    for (let row = 0; row <= SIDE_ROWS; row++) line.push(sidePoint(arc, height * row / SIDE_ROWS))
    grid.push(line)
  }
  const faces = disk(baseCenter, u, v, radius)
  for (let column = 0; column < ROUND_SEGMENTS; column++) {
    for (let row = 0; row < SIDE_ROWS; row++) {
      faces.push([grid[column]![row]!, grid[column + 1]![row]!, grid[column + 1]![row + 1]!, grid[column]![row + 1]!])
    }
  }
  // The top cap hangs on the top of the contact line and folds into the sheet's plane.
  const fold = progress * Math.PI / 2
  const towardCenter = add(scale(u, -Math.cos(fold)), scale(axis, Math.sin(fold)))
  const contact = addScaled(rim, axis, height)
  const capCenter = place(addScaled(contact, towardCenter, radius))
  const capU = rotateVector(scale(towardCenter, -1), v, tilt)
  const capV = rotateVector(v, v, tilt)
  faces.push(...disk(capCenter, capU, capV, radius))
  const outlines = [
    circle(baseCenter, u, v, radius),
    circle(capCenter, capU, capV, radius),
    grid.map(line => line[0]!),
    grid.map(line => line[SIDE_ROWS]!),
    grid[0]!,
    grid[ROUND_SEGMENTS]!,
  ]
  return { faces, outlines, seam: [grid[0]![0]!, grid[0]![SIDE_ROWS]!] }
}

/**
 * The side opens around its slant line through the radius point: the cone's half angle widens
 * to 90° (a flat sector) while that slant line turns down onto the base plane. A cut cone is
 * the band of the full cone between its two circles; its top disk hangs on the inner arc.
 */
function unfoldCone(shape: RoundShape, progress: number): Net {
  const { baseCenter, u, v, radius, height, rim, topRadius } = shape
  // The full cone (for a cut cone, extended to its apex).
  const fullHeight = topRadius > 0 ? height * radius / (radius - topRadius) : height
  const fullApex = addScaled(baseCenter, shape.axis, fullHeight)
  const slant = Math.hypot(radius, fullHeight)
  const inner = slant * topRadius / radius
  const halfAngle = Math.asin(radius / slant)
  const sector = 2 * Math.PI * radius / slant
  const generator0 = normalize(sub(rim, fullApex))!
  const deformed = (p: number) => {
    const turn = p * (Math.PI / 2 + halfAngle)
    const sinBeta = Math.sin(halfAngle) + p * (1 - Math.sin(halfAngle))
    const beta = Math.asin(clamp(sinBeta, 0, 1))
    const generator = rotateVector(generator0, v, turn)
    const coneAxis = rotateVector(generator0, v, turn + beta)
    const apex = addScaled(rim, generator, -slant)
    const radial = normalize(addScaled(generator, coneAxis, -Math.cos(beta))) ?? u
    const tangent = cross(radial, coneAxis)
    const point = (distance: number, angle: number) => {
      const around = angle / sinBeta
      const direction = add(scale(coneAxis, Math.cos(beta)),
        scale(add(scale(radial, Math.cos(around)), scale(tangent, Math.sin(around))), sinBeta))
      return addScaled(apex, direction, distance)
    }
    return { apex, point, tangent }
  }
  const now = deformed(progress)
  const arcAt = (distance: number) => {
    const arc: Vec3[] = []
    for (let index = 0; index <= ROUND_SEGMENTS; index++) arc.push(now.point(distance, -sector / 2 + sector * index / ROUND_SEGMENTS))
    return arc
  }
  const outer = arcAt(slant)
  const faces = disk(baseCenter, u, v, radius)
  if (topRadius <= 0) {
    for (let index = 0; index < ROUND_SEGMENTS; index++) faces.push([now.apex, outer[index]!, outer[index + 1]!])
    return {
      faces,
      outlines: [circle(baseCenter, u, v, radius), outer, [outer[0]!, now.apex, outer[ROUND_SEGMENTS]!]],
      seam: [outer[0]!, now.apex],
    }
  }
  const innerArc = arcAt(inner)
  for (let index = 0; index < ROUND_SEGMENTS; index++) faces.push([innerArc[index]!, outer[index]!, outer[index + 1]!, innerArc[index + 1]!])
  // The top disk turns about the inner arc's middle from its closed place into the band's plane.
  const frameAt = (p: number) => {
    const state = deformed(p)
    const contact = state.point(inner, 0)
    const towardApex = normalize(sub(state.apex, contact))!
    const outward = normalize(cross(towardApex, state.tangent))!
    return { contact, towardApex, outward, tangent: state.tangent }
  }
  const closed = frameAt(0)
  const toCenter = normalize(sub(shape.top, closed.contact))!
  const startAngle = Math.atan2(dot(toCenter, scale(closed.outward, -1)), dot(toCenter, closed.towardApex))
  const open = frameAt(progress)
  const fold = startAngle * (1 - progress)
  const direction = add(scale(open.towardApex, Math.cos(fold)), scale(open.outward, -Math.sin(fold)))
  const capCenter = addScaled(open.contact, direction, topRadius)
  faces.push(...disk(capCenter, scale(direction, -1), open.tangent, topRadius))
  return {
    faces,
    outlines: [circle(baseCenter, u, v, radius), outer, innerArc, [outer[0]!, innerArc[0]!], [outer[ROUND_SEGMENTS]!, innerArc[ROUND_SEGMENTS]!],
      circle(capCenter, scale(direction, -1), open.tangent, topRadius)],
    seam: [outer[0]!, innerArc[0]!],
  }
}
