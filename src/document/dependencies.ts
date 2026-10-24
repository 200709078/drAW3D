import { nearestPart, partsOf } from '../geometry/parts'
import {
  angleShape, lineShape, maxUnfoldAngle, planeShape, polyhedronShape, roundShape, sphereShape, type Shape,
} from '../geometry/solids'
import {
  isPoint, isSolid, references, type GeometryObject, type ObjectId, type PointConstraint, type PointObject,
} from '../geometry/types'
import { isFiniteVec, type Vec3 } from '../geometry/vec3'

export type ShapeMap = ReadonlyMap<ObjectId, Shape>

/** Shape of a non-point object from its points' positions; null when degenerate. */
export function shapeOf(object: Exclude<GeometryObject, PointObject>, position: (id: ObjectId) => Vec3 | null): Shape | null {
  const points = object.points.map(position)
  if (points.some(point => point === null)) return null
  const [a, b, c] = points as Vec3[]
  switch (object.type) {
    case 'line':
    case 'segment':
    case 'ray':
      return lineShape(object.type, a!, b!)
    case 'plane':
      return planeShape(a!, b!, c!)
    case 'angle':
      return angleShape(a!, b!, c!)
    case 'sphere':
      return sphereShape(a!, b!)
    case 'prism':
    case 'pyramid':
      return polyhedronShape(object.type, a!, b!, c!, object.sideCount, object.height)
    case 'cylinder':
    case 'cone':
      return roundShape(object.type, a!, b!, object.height)
  }
}

/** Position of a solid's helper point; null when the solid has no such vertex now. */
export function helperPosition(shape: Shape, constraint: PointConstraint): Vec3 | null {
  if (constraint.type === 'on') return null
  if (shape.kind === 'polyhedron') {
    if (constraint.type === 'height') return shape.heightEnd
    if (constraint.role === 'base') return shape.base[constraint.index] ?? null
    if (constraint.role === 'top') return shape.top[constraint.index] ?? null
    if (constraint.role === 'center') return shape.baseCenter
    return null
  }
  if (shape.kind === 'round') {
    if (constraint.type === 'height') return shape.top
    return constraint.role === 'topRim' ? shape.topRim : null
  }
  return null
}

function setValid(object: GeometryObject, valid: boolean): void {
  if (valid) delete object.geometryValid
  else object.geometryValid = false
}

/**
 * Recompute every dependent position and shape in document order (creation order is
 * topological). Objects whose geometry becomes undefined keep their last values and are
 * marked invalid until it is defined again. Mutates the models in place.
 */
export function resolveDocument(objects: readonly GeometryObject[]): ShapeMap {
  const byId = new Map(objects.map(object => [object.id, object]))
  const shapes = new Map<ObjectId, Shape>()
  const position = (id: ObjectId): Vec3 | null => {
    const point = byId.get(id)
    return isPoint(point) && point.geometryValid !== false ? point.position : null
  }
  for (const object of objects) {
    if (!isPoint(object)) {
      const shape = shapeOf(object, position)
      setValid(object, shape !== null)
      if (!shape) continue
      shapes.set(object.id, shape)
      if (isSolid(object) && (shape.kind === 'polyhedron' || shape.kind === 'round')) {
        object.unfold = Math.min(object.unfold, maxUnfoldAngle(shape))
      }
      continue
    }
    const constraint = object.constraint
    if (!constraint) {
      setValid(object, isFiniteVec(object.position))
      continue
    }
    const shape = shapes.get(constraint.ownerId)
    let next: Vec3 | null = null
    if (shape && constraint.type === 'on') {
      const parts = partsOf(shape)
      let part = parts[constraint.part]
      if (!part) {
        // The owner lost this part (fewer sides): move to the nearest remaining one.
        const nearest = nearestPart(parts, object.position)
        if (nearest) {
          constraint.part = nearest.part
          constraint.params = nearest.params
          part = parts[nearest.part]
        }
      }
      next = part ? part.position(constraint.params) : null
    } else if (shape) {
      next = helperPosition(shape, constraint)
    }
    if (next && isFiniteVec(next)) {
      object.position = next
      setValid(object, true)
    } else {
      setValid(object, false)
    }
  }
  return shapes
}

/** Objects that read their geometry from any of `ids`, transitively (not including `ids`). */
export function collectDependents(objects: readonly GeometryObject[], ids: Iterable<ObjectId>): Set<ObjectId> {
  const removed = new Set(ids)
  const dependents = new Set<ObjectId>()
  for (const object of objects) {
    if (removed.has(object.id)) continue
    if (references(object).some(id => removed.has(id))) {
      removed.add(object.id)
      dependents.add(object.id)
    }
  }
  return dependents
}

/** Helpers owned by any of `ids`, transitively. */
export function collectOwned(objects: readonly GeometryObject[], ids: Iterable<ObjectId>): Set<ObjectId> {
  const owners = new Set(ids)
  const owned = new Set<ObjectId>()
  let changed = true
  while (changed) {
    changed = false
    for (const object of objects) {
      if (object.ownerId !== undefined && owners.has(object.ownerId) && !owners.has(object.id)) {
        owners.add(object.id)
        owned.add(object.id)
        changed = true
      }
    }
  }
  return owned
}

/** Free points a construction created for itself; they survive the owner if still used. */
function isSoftHelper(object: GeometryObject): boolean {
  return isPoint(object) && object.constraint === undefined
}

export interface DeletionPlan {
  /** Every object to remove, in document order. */
  remove: ObjectId[]
  /** Owned points that other objects still use: they stay as ordinary points. */
  release: ObjectId[]
}

/**
 * Deleting an object deletes its helpers and everything built on it. A point the
 * construction created for itself (a prism's A and B) is kept if something else uses it.
 */
export function planDeletion(objects: readonly GeometryObject[], ids: Iterable<ObjectId>): DeletionPlan {
  const removed = new Set(ids)
  const usersOf = new Map<ObjectId, ObjectId[]>()
  for (const object of objects) {
    for (const id of references(object)) usersOf.set(id, [...usersOf.get(id) ?? [], object.id])
  }
  let changed = true
  while (changed) {
    changed = false
    for (const object of objects) {
      if (removed.has(object.id)) continue
      const owned = object.ownerId !== undefined && removed.has(object.ownerId)
      const dependent = references(object).some(id => removed.has(id))
      const remove = dependent || (owned && (!isSoftHelper(object)
        || (usersOf.get(object.id) ?? []).every(user => removed.has(user))))
      if (remove) {
        removed.add(object.id)
        changed = true
      }
    }
  }
  return {
    remove: objects.filter(object => removed.has(object.id)).map(object => object.id),
    release: objects.filter(object => !removed.has(object.id) && object.ownerId !== undefined
      && removed.has(object.ownerId)).map(object => object.id),
  }
}
