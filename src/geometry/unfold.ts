import { circlePoint, maxUnfoldAngle, type PolyhedronShape, type RoundShape, type SolidShape } from './solids'
import {
  EPSILON, add, addScaled, clamp, cross, dot, normalize, rotateAround, rotateVector, scale, sub, toRadians, type Vec3,
} from './vec3'

/**
 * A net at some opening angle: faces are planar polygons (curved surfaces arrive as a grid
 * of quads), outlines are the cut and fold lines as polylines. Pure data, no rendering.
 */
export interface Net {
  faces: Vec3[][]
  outlines: Vec3[][]
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

/** Sign that turns a face hinged on the base edge from→to away from the base center. */
function outwardSign(from: Vec3, to: Vec3, baseCenter: Vec3, up: Vec3): number {
  const axis = normalize(sub(to, from))!
  const outward = sub(scale(add(from, to), 0.5), baseCenter)
  return Math.sign(dot(cross(axis, up), outward)) || 1
}

function unfoldPolyhedron(shape: PolyhedronShape, angle: number): Net {
  const { base, normal, baseCenter } = shape
  const n = base.length
  const faces: Vec3[][] = [base]
  const up = scale(normal, shape.height)
  for (let index = 0; index < n; index++) {
    const from = base[index]!
    const to = base[(index + 1) % n]!
    const axis = normalize(sub(to, from))!
    const turn = angle * outwardSign(from, to, baseCenter, up)
    const open = (vertex: Vec3) => rotateAround(vertex, from, axis, turn)
    if (shape.solid === 'pyramid') {
      faces.push([from, to, open(shape.apex!)])
      continue
    }
    const side = [from, to, open(shape.top[(index + 1) % n]!), open(shape.top[index]!)]
    faces.push(side)
    // The top hangs on the last side face and opens once more around that face's top edge.
    if (index === n - 1) {
      const hinge = side[3]!
      faces.push(shape.top.map(vertex => rotateAround(open(vertex), hinge, axis, turn)))
    }
  }
  return { faces, outlines: faces.map(face => [...face, face[0]!]) }
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
  return { faces, outlines }
}

/**
 * The side opens around its slant line through the radius point: the cone's half angle widens
 * to 90° (a flat sector) while that slant line turns down onto the base plane.
 */
function unfoldCone(shape: RoundShape, progress: number): Net {
  const { baseCenter, u, v, radius, height, rim } = shape
  const slant = Math.hypot(radius, height)
  const halfAngle = Math.asin(radius / slant)
  const sector = 2 * Math.PI * radius / slant
  const generator0 = normalize(sub(rim, shape.top))!
  const turn = progress * (Math.PI / 2 + halfAngle)
  const sinBeta = Math.sin(halfAngle) + progress * (1 - Math.sin(halfAngle))
  const beta = Math.asin(clamp(sinBeta, 0, 1))
  const generator = rotateVector(generator0, v, turn)
  const coneAxis = rotateVector(generator0, v, turn + beta)
  const apex = addScaled(rim, generator, -slant)
  const radial = normalize(addScaled(generator, coneAxis, -Math.cos(beta))) ?? u
  const tangent = cross(radial, coneAxis)
  const sidePoint = (distance: number, angle: number) => {
    const around = angle / sinBeta
    const direction = add(scale(coneAxis, Math.cos(beta)),
      scale(add(scale(radial, Math.cos(around)), scale(tangent, Math.sin(around))), sinBeta))
    return addScaled(apex, direction, distance)
  }
  const arc: Vec3[] = []
  for (let index = 0; index <= ROUND_SEGMENTS; index++) arc.push(sidePoint(slant, -sector / 2 + sector * index / ROUND_SEGMENTS))
  const faces = disk(baseCenter, u, v, radius)
  for (let index = 0; index < ROUND_SEGMENTS; index++) faces.push([apex, arc[index]!, arc[index + 1]!])
  return {
    faces,
    outlines: [circle(baseCenter, u, v, radius), arc, [arc[0]!, apex, arc[ROUND_SEGMENTS]!]],
  }
}
