import { arePointsCollinear, initialSidePoint } from '../geometry/solids'
import {
  DEFAULT_SIDES, MAX_SIDES, MIN_SIDES, pointKind,
  type GeometryObject, type LineKind, type ObjectId, type PointConstraint, type PointObject,
  type PolyhedronKind, type PolyhedronObject, type RegularKind, type RegularObject, type RoundKind, type RoundObject,
  type SphereObject, type UnfoldableSolid, type VertexConstraint,
} from '../geometry/types'
import { SAME_POINT, UP, addScaled, distance, type Vec3 } from '../geometry/vec3'
import { POINT_COLORS, randomColor } from './colors'
import { createObjectName, type NameGroup } from './names'

/** IDs, names and colors for a batch of new objects; nothing is reserved until appended. */
export interface ConstructionContext {
  allocateId(): ObjectId
  name(group: NameGroup): string
  /** Mark a name as taken (a name typed by the user). */
  reserve(name: string): void
  color(): string
}

export function createContext(
  objects: readonly GeometryObject[], allocateId: () => ObjectId, color: () => string = randomColor,
): ConstructionContext {
  const names = new Set(objects.map(object => object.name))
  return {
    allocateId,
    name(group) {
      const name = createObjectName(group, names)
      names.add(name)
      return name
    },
    reserve(name) {
      names.add(name)
    },
    color,
  }
}

export function createPoint(context: ConstructionContext, position: Vec3, constraint?: PointConstraint): PointObject {
  const point: PointObject = {
    id: context.allocateId(), type: 'point', name: context.name('point'), color: '', position,
  }
  if (constraint) point.constraint = constraint
  point.color = POINT_COLORS[pointKind(point)]
  return point
}

/** What a construction tool builds, and how many points it needs. */
export type ConstructionKind = LineKind | 'plane' | 'angle' | 'sphere' | PolyhedronKind | RoundKind
  | 'frustum' | 'frustumCone' | RegularKind

export const POINTS_NEEDED: Readonly<Record<ConstructionKind, number>> = {
  line: 2, segment: 2, ray: 2, plane: 3, angle: 3, sphere: 2, prism: 2, pyramid: 2, cylinder: 2, cone: 2,
  frustum: 2, frustumCone: 2, tetrahedron: 2, cube: 2, octahedron: 2, dodecahedron: 2, icosahedron: 2,
}

export const REGULAR_KINDS: readonly RegularKind[] = ['tetrahedron', 'cube', 'octahedron', 'dodecahedron', 'icosahedron']
export const REGULAR_VERTEX_COUNT: Readonly<Record<RegularKind, number>> = {
  tetrahedron: 4, cube: 8, octahedron: 6, dodecahedron: 20, icosahedron: 12,
}
/** A new cut pyramid or cone: the top is half the base. */
export const DEFAULT_TOP_RATIO = 0.5

export function isRegularKind(kind: string): kind is RegularKind {
  return (REGULAR_KINDS as readonly string[]).includes(kind)
}

/** Whether `next` may be the following point after `previous` (distinct, and not collinear for a plane). */
export function acceptsPoint(kind: ConstructionKind, previous: readonly Vec3[], next: Vec3): boolean {
  if (previous.some(point => distance(point, next) < SAME_POINT)) return false
  if (kind === 'plane' && previous.length === 2) return !arePointsCollinear(previous[0]!, previous[1]!, next)
  return true
}

export function clampSides(sides: number): number {
  return Math.min(MAX_SIDES, Math.max(MIN_SIDES, Math.round(Number.isFinite(sides) ? sides : DEFAULT_SIDES)))
}

type Slot = Omit<VertexConstraint, 'type' | 'ownerId'>

/** Locked vertex points a solid shows: the corners that are not A, B or the height point. */
export function vertexSlots(type: PolyhedronKind | RoundKind, sides: number, cut = false): Slot[] {
  if (type === 'cylinder') return [{ role: 'topRim', index: 0 }]
  if (type === 'cone') return cut ? [{ role: 'topRim', index: 0 }] : []
  const slots: Slot[] = []
  for (let index = 2; index < sides; index++) slots.push({ role: 'base', index })
  if (type === 'prism') {
    for (let index = 1; index < sides; index++) slots.push({ role: 'top', index })
  } else {
    // A cut pyramid shows its whole top; its height point is the top's center.
    if (cut) for (let index = 0; index < sides; index++) slots.push({ role: 'top', index })
    slots.push({ role: 'center', index: 0 })
  }
  return slots
}

/** The vertex slots of any solid. */
export function vertexSlotsOf(solid: UnfoldableSolid): Slot[] {
  if (solid.type === 'regular') {
    return Array.from({ length: REGULAR_VERTEX_COUNT[solid.solid] - 2 }, (_, index): Slot => ({ role: 'corner', index: index + 2 }))
  }
  const cut = solid.topRatio !== undefined && solid.topRatio > 0 && solid.topRatio < 1
  return vertexSlots(solid.type, solid.type === 'prism' || solid.type === 'pyramid' ? solid.sideCount : 0, cut)
}

function helperSegment(
  context: ConstructionContext, ownerId: ObjectId, a: ObjectId, b: ObjectId, color: string, group: 'edge' | 'radius',
): GeometryObject {
  return { id: context.allocateId(), type: 'segment', name: context.name(group), color, points: [a, b], ownerId }
}

/**
 * Objects for a finished construction from its picked points. `created` are the points the
 * tool made on the way; a solid adopts them as its own helpers. Positions of the derived
 * helper points are placeholders until the document is resolved.
 */
export function buildConstruction(
  context: ConstructionContext,
  kind: ConstructionKind,
  points: readonly PointObject[],
  options: { sides?: number; height?: number; topRatio?: number } = {},
): GeometryObject[] {
  const ids = points.map(point => point.id)
  const color = context.color()
  switch (kind) {
    case 'line':
    case 'segment':
    case 'ray':
      return [{ id: context.allocateId(), type: kind, name: context.name(kind), color, points: [ids[0]!, ids[1]!] }]
    case 'plane':
    case 'angle':
      return [{ id: context.allocateId(), type: kind, name: context.name(kind), color, points: [ids[0]!, ids[1]!, ids[2]!] }]
    case 'sphere': {
      const id = context.allocateId()
      return [
        { id, type: 'sphere', name: context.name('sphere'), color, points: [ids[0]!, ids[1]!] },
        helperSegment(context, id, ids[0]!, ids[1]!, color, 'radius'),
      ]
    }
    case 'prism':
    case 'pyramid':
    case 'frustum': {
      const [a, b] = points as [PointObject, PointObject]
      const id = context.allocateId()
      const side = createPoint(context, initialSidePoint(a.position, b.position))
      side.ownerId = id
      const sideCount = clampSides(options.sides ?? DEFAULT_SIDES)
      const solid: PolyhedronObject = {
        id, type: kind === 'frustum' ? 'pyramid' : kind, name: context.name(kind), color, points: [a.id, b.id, side.id], sideCount,
        height: options.height ?? distance(a.position, b.position), unfold: 0,
      }
      if (kind === 'frustum') solid.topRatio = options.topRatio ?? DEFAULT_TOP_RATIO
      return [side, solid, ...solidHelpers(context, solid, a, color)]
    }
    case 'cylinder':
    case 'cone':
    case 'frustumCone': {
      const [center, rim] = points as [PointObject, PointObject]
      const solid: RoundObject = {
        id: context.allocateId(), type: kind === 'frustumCone' ? 'cone' : kind, name: context.name(kind), color,
        points: [center.id, rim.id], height: options.height ?? 2 * distance(center.position, rim.position), unfold: 0,
      }
      if (kind === 'frustumCone') solid.topRatio = options.topRatio ?? DEFAULT_TOP_RATIO
      return [solid, ...solidHelpers(context, solid, center, color)]
    }
    default: {
      // The regular polyhedra.
      const [a, b] = points as [PointObject, PointObject]
      const id = context.allocateId()
      const side = createPoint(context, initialSidePoint(a.position, b.position))
      side.ownerId = id
      const solid: RegularObject = {
        id, type: 'regular', solid: kind, name: context.name(kind), color, points: [a.id, b.id, side.id], unfold: 0,
      }
      const helpers: GeometryObject[] = [helperSegment(context, id, a.id, b.id, color, 'edge')]
      for (const slot of vertexSlotsOf(solid)) {
        helpers.push({ ...createPoint(context, a.position, { type: 'vertex', ownerId: id, ...slot }), ownerId: id })
      }
      return [side, solid, ...helpers]
    }
  }
}

function solidHelpers(
  context: ConstructionContext, solid: PolyhedronObject | RoundObject, first: PointObject, color: string,
): GeometryObject[] {
  const [a, b] = solid.points
  const helpers: GeometryObject[] = [
    helperSegment(context, solid.id, a, b, color, solid.type === 'prism' || solid.type === 'pyramid' ? 'edge' : 'radius'),
    { ...createPoint(context, first.position, { type: 'height', ownerId: solid.id }), ownerId: solid.id },
  ]
  for (const slot of vertexSlotsOf(solid)) {
    helpers.push({ ...createPoint(context, first.position, { type: 'vertex', ownerId: solid.id, ...slot }), ownerId: solid.id })
  }
  return helpers
}

/** A sphere given by its center and radius, with a size handle on top and a radius segment. */
export function buildSphereWithRadius(context: ConstructionContext, center: PointObject, radius: number): GeometryObject[] {
  const color = context.color()
  const sphere: SphereObject = {
    id: context.allocateId(), type: 'sphere', name: context.name('sphere'), color, points: [center.id], radius,
  }
  const handle: PointObject = {
    ...createPoint(context, addScaled(center.position, UP, radius), { type: 'height', ownerId: sphere.id }), ownerId: sphere.id,
  }
  return [sphere, handle, helperSegment(context, sphere.id, center.id, handle.id, color, 'radius')]
}

/** A solid or sphere adopts the free points its tool created, so they go away with it. */
export function adoptCreatedPoints(objects: readonly GeometryObject[], created: readonly PointObject[]): void {
  const solid = objects.find(object => object.type === 'prism' || object.type === 'pyramid'
    || object.type === 'cylinder' || object.type === 'cone' || object.type === 'sphere' || object.type === 'regular')
  if (!solid) return
  for (const point of created) {
    if (point.constraint === undefined) point.ownerId = solid.id
  }
}
