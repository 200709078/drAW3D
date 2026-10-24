import { arePointsCollinear, initialSidePoint } from '../geometry/solids'
import {
  DEFAULT_SIDES, MAX_SIDES, MIN_SIDES, pointKind,
  type GeometryObject, type LineKind, type ObjectId, type ObjectType, type PointConstraint, type PointObject,
  type PolyhedronKind, type PolyhedronObject, type RoundKind, type RoundObject, type VertexConstraint,
} from '../geometry/types'
import { SAME_POINT, distance, type Vec3 } from '../geometry/vec3'
import { POINT_COLORS, randomColor } from './colors'
import { createObjectName } from './names'

/** IDs, names and colors for a batch of new objects; nothing is reserved until appended. */
export interface ConstructionContext {
  allocateId(): ObjectId
  name(type: ObjectType): string
  color(): string
}

export function createContext(
  objects: readonly GeometryObject[], allocateId: () => ObjectId, color: () => string = randomColor,
): ConstructionContext {
  const names = new Set(objects.map(object => object.name))
  return {
    allocateId,
    name(type) {
      const name = createObjectName(type, names)
      names.add(name)
      return name
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

export const POINTS_NEEDED: Readonly<Record<ConstructionKind, number>> = {
  line: 2, segment: 2, ray: 2, plane: 3, angle: 3, sphere: 2, prism: 2, pyramid: 2, cylinder: 2, cone: 2,
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

/** Locked vertex points a solid shows: the corners that are not A, B or the height point. */
export function vertexSlots(type: PolyhedronKind | RoundKind, sides: number): Omit<VertexConstraint, 'type' | 'ownerId'>[] {
  if (type === 'cylinder') return [{ role: 'topRim', index: 0 }]
  if (type === 'cone') return []
  const slots: Omit<VertexConstraint, 'type' | 'ownerId'>[] = []
  for (let index = 2; index < sides; index++) slots.push({ role: 'base', index })
  if (type === 'prism') {
    for (let index = 1; index < sides; index++) slots.push({ role: 'top', index })
  } else {
    slots.push({ role: 'center', index: 0 })
  }
  return slots
}

function helperSegment(context: ConstructionContext, ownerId: ObjectId, a: ObjectId, b: ObjectId, color: string): GeometryObject {
  return { id: context.allocateId(), type: 'segment', name: context.name('segment'), color, points: [a, b], ownerId }
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
  options: { sides?: number } = {},
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
        helperSegment(context, id, ids[0]!, ids[1]!, color),
      ]
    }
    case 'prism':
    case 'pyramid': {
      const [a, b] = points as [PointObject, PointObject]
      const id = context.allocateId()
      const side = createPoint(context, initialSidePoint(a.position, b.position))
      side.ownerId = id
      const sideCount = clampSides(options.sides ?? DEFAULT_SIDES)
      const solid: PolyhedronObject = {
        id, type: kind, name: context.name(kind), color, points: [a.id, b.id, side.id], sideCount,
        height: distance(a.position, b.position), unfold: 0,
      }
      return [side, solid, ...solidHelpers(context, solid, a, color)]
    }
    case 'cylinder':
    case 'cone': {
      const [center, rim] = points as [PointObject, PointObject]
      const solid: RoundObject = {
        id: context.allocateId(), type: kind, name: context.name(kind), color, points: [center.id, rim.id],
        height: 2 * distance(center.position, rim.position), unfold: 0,
      }
      return [solid, ...solidHelpers(context, solid, center, color)]
    }
  }
}

function solidHelpers(
  context: ConstructionContext, solid: PolyhedronObject | RoundObject, first: PointObject, color: string,
): GeometryObject[] {
  const [a, b] = solid.points
  const helpers: GeometryObject[] = [
    helperSegment(context, solid.id, a, b, color),
    { ...createPoint(context, first.position, { type: 'height', ownerId: solid.id }), ownerId: solid.id },
  ]
  const sides = solid.type === 'prism' || solid.type === 'pyramid' ? solid.sideCount : 0
  for (const slot of vertexSlots(solid.type, sides)) {
    helpers.push({ ...createPoint(context, first.position, { type: 'vertex', ownerId: solid.id, ...slot }), ownerId: solid.id })
  }
  return helpers
}

/** A solid or sphere adopts the free points its tool created, so they go away with it. */
export function adoptCreatedPoints(objects: readonly GeometryObject[], created: readonly PointObject[]): void {
  const solid = objects.find(object => object.type === 'prism' || object.type === 'pyramid'
    || object.type === 'cylinder' || object.type === 'cone' || object.type === 'sphere')
  if (!solid) return
  for (const point of created) {
    if (point.constraint === undefined) point.ownerId = solid.id
  }
}
