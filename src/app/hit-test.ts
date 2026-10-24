import type { ShapeMap } from '../document/dependencies'
import { partsOf } from '../geometry/parts'
import { isPoint, type GeometryObject, type ObjectId, type PointObject } from '../geometry/types'
import { clamp, distance, dot, intersectPlane, intersectTriangle, lerp, pointOnRay, sub, UP, ORIGIN, type Vec3 } from '../geometry/vec3'
import type { Projector, ScreenPoint } from './camera-state'

export type PointerKind = 'mouse' | 'pen' | 'touch'

/** Pixel tolerance for picking points and edges. */
export function hitTolerance(kind: PointerKind): number {
  return kind === 'touch' ? 22 : kind === 'pen' ? 14 : 10
}

export function isVisible(object: GeometryObject): boolean {
  return !object.hidden && object.geometryValid !== false
}

/** Nearest visible point within the tolerance; points on objects win exact ties. */
export function nearestPoint(
  objects: readonly GeometryObject[], projector: Projector, spot: ScreenPoint, tolerance: number,
  exclude: ReadonlySet<ObjectId> = new Set(),
): PointObject | null {
  let best: PointObject | null = null
  let bestDistance = Infinity
  for (const object of objects) {
    if (!isPoint(object) || !isVisible(object) || exclude.has(object.id)) continue
    const screen = projector.toScreen(object.position)
    if (!screen) continue
    const pixels = Math.hypot(screen.x - spot.x, screen.y - spot.y)
    if (pixels > tolerance) continue
    const tie = Math.abs(pixels - bestDistance) < 1e-3
    if (pixels < bestDistance - 1e-3 || (tie && object.constraint?.type === 'on' && best?.constraint?.type !== 'on')) {
      best = object
      bestDistance = pixels
    }
  }
  return best
}

export interface PartHit {
  ownerId: ObjectId
  part: number
  params: number[]
  position: Vec3
}

/** Objects whose parts can be clicked: helpers belong to their owner, which has the same edges. */
function pickable(object: GeometryObject): boolean {
  return !isPoint(object) && isVisible(object) && object.ownerId === undefined
}

/** Long straight samples are split so a line partly behind the camera stays clickable. */
function refine(samples: readonly Vec3[]): Vec3[] {
  const result: Vec3[] = [samples[0]!]
  for (let index = 1; index < samples.length; index++) {
    const [from, to] = [samples[index - 1]!, samples[index]!]
    const pieces = clamp(Math.ceil(distance(from, to)), 1, 200)
    for (let piece = 1; piece <= pieces; piece++) result.push(lerp(from, to, piece / pieces))
  }
  return result
}

interface CurveCandidate {
  hit: PartHit
  pixels: number
  depth: number
}

/**
 * The object part under the pointer: the closest edge or curve within the pixel tolerance
 * (nearer to the camera on ties) unless the nearest surface along the pointer ray hides it;
 * otherwise that surface.
 */
export function hitPart(
  objects: readonly GeometryObject[], shapes: ShapeMap, projector: Projector, spot: ScreenPoint, tolerance: number,
): PartHit | null {
  const curves: CurveCandidate[] = []
  let surface: PartHit | null = null
  let surfaceDepth = Infinity
  const ray = projector.ray(spot)
  for (const object of objects) {
    if (!pickable(object)) continue
    const shape = shapes.get(object.id)
    if (!shape) continue
    partsOf(shape).forEach((part, index) => {
      if (part.dimension === 1) {
        let best: CurveCandidate | null = null
        const samples = refine(part.samples())
        let previous = projector.toScreen(samples[0]!)
        for (let sample = 1; sample < samples.length; sample++) {
          const current = projector.toScreen(samples[sample]!)
          if (previous && current) {
            const dx = current.x - previous.x
            const dy = current.y - previous.y
            const lengthSquared = dx * dx + dy * dy
            const t = lengthSquared > 0 ? clamp(((spot.x - previous.x) * dx + (spot.y - previous.y) * dy) / lengthSquared, 0, 1) : 0
            const pixels = Math.hypot(previous.x + dx * t - spot.x, previous.y + dy * t - spot.y)
            if (pixels <= tolerance && pixels < (best?.pixels ?? Infinity)) {
              const params = part.project(lerp(samples[sample - 1]!, samples[sample]!, t))
              const position = part.position(params)
              best = { hit: { ownerId: object.id, part: index, params, position }, pixels, depth: dot(sub(position, ray.origin), ray.direction) }
            }
          }
          previous = current
        }
        if (best) curves.push(best)
        return
      }
      const triangles = part.samples()
      for (let corner = 0; corner + 2 < triangles.length; corner += 3) {
        const t = intersectTriangle(ray, triangles[corner]!, triangles[corner + 1]!, triangles[corner + 2]!)
        if (t === null || t >= surfaceDepth) continue
        const params = part.project(pointOnRay(ray, t))
        surface = { ownerId: object.id, part: index, params, position: part.position(params) }
        surfaceDepth = t
      }
    })
  }
  // An edge of the hit face itself is at the face's depth; one further back is hidden by it.
  const visible = curves.filter(candidate => candidate.depth <= surfaceDepth * 1.01 + 0.05)
  visible.sort((first, second) => (Math.abs(first.pixels - second.pixels) < 0.5 ? first.depth - second.depth : first.pixels - second.pixels))
  return visible[0]?.hit ?? surface
}

/** Where the pointer ray meets the horizontal plane at `height` (the ground by default). */
export function planePoint(projector: Projector, spot: ScreenPoint, height = 0): Vec3 | null {
  const ray = projector.ray(spot)
  const t = intersectPlane(ray, { ...ORIGIN, y: height }, UP)
  if (t === null) return null
  const point = pointOnRay(ray, t)
  // Far beyond the ground the click is almost parallel to it: not a useful position.
  return Math.abs(point.x) <= 500 && Math.abs(point.z) <= 500 ? { ...point, y: height } : null
}
