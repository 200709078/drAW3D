import type { Projector, ScreenPoint } from '../../src/app/camera-state'
import { vec, type Vec3 } from '../../src/geometry/vec3'

/** Pixels per world unit of the fake view. */
export const SCALE = 20
const CENTER = 500

/**
 * An orthographic camera looking straight down from y = 100: screen x is world x, screen y
 * is world z. Tool and select logic run against it without WebGL.
 */
export const topDown: Projector = {
  toScreen(point: Vec3): ScreenPoint | null {
    if (point.y > 99) return null
    return { x: CENTER + point.x * SCALE, y: CENTER + point.z * SCALE }
  },
  ray(screen: ScreenPoint) {
    return { origin: vec((screen.x - CENTER) / SCALE, 100, (screen.y - CENTER) / SCALE), direction: vec(0, -1, 0) }
  },
}

/** The screen spot above a world position. */
export function spot(x: number, z: number): ScreenPoint {
  return { x: CENTER + x * SCALE, y: CENTER + z * SCALE }
}

/**
 * A camera on the +z axis looking at -z (screen x is world x, screen y is -world y), for
 * vertical drags and heights.
 */
export const front: Projector = {
  toScreen(point: Vec3): ScreenPoint | null {
    if (point.z > 99) return null
    return { x: CENTER + point.x * SCALE, y: CENTER - point.y * SCALE }
  },
  ray(screen: ScreenPoint) {
    return { origin: vec((screen.x - CENTER) / SCALE, (CENTER - screen.y) / SCALE, 100), direction: vec(0, 0, -1) }
  },
}

export function frontSpot(x: number, y: number): ScreenPoint {
  return { x: CENTER + x * SCALE, y: CENTER - y * SCALE }
}
