import { derivedPosition, type DerivedSource } from '../geometry/derived'
import { measure, type MeasureOutcome, type MeasureTarget } from '../geometry/measures'
import { nearestPart, partsOf } from '../geometry/parts'
import { regularShape } from '../geometry/polyhedra'
import { sectionOf } from '../geometry/section'
import {
  angleShape, lineShape, planeShape, polyhedronShape, roundShape, sphereShape, type Shape,
} from '../geometry/solids'
import { maxUnfoldAngle } from '../geometry/unfold'
import {
  isFigure, isPoint, isUnfoldable, references, type FigureObject, type GeometryObject, type MeasureObject, type ObjectId,
  type PointConstraint,
} from '../geometry/types'
import { UP, addScaled, isFiniteVec, type Vec3 } from '../geometry/vec3'
import { definitionNames, evaluateDefinitions } from './definitions'

export type ShapeMap = ReadonlyMap<ObjectId, Shape>

/** Shape of a figure from its points' positions; null when degenerate. */
export function shapeOf(object: FigureObject, position: (id: ObjectId) => Vec3 | null): Shape | null {
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
      if (object.radius !== undefined) return object.radius > 0 ? { kind: 'sphere', center: a!, radius: object.radius } : null
      return b ? sphereShape(a!, b) : null
    case 'prism':
    case 'pyramid':
      return polyhedronShape(object.type, a!, b!, c!, object.sideCount, object.height, object.topRatio)
    case 'cylinder':
    case 'cone':
      return roundShape(object.type, a!, b!, object.height, object.topRatio)
    case 'regular': {
      const shape = regularShape(object.solid, a!, b!, c!)
      if (shape && object.solid === 'cube') shape.net = object.net ?? 0
      return shape
    }
  }
}

/** Position of a solid's helper point; null when the solid has no such vertex now. */
export function helperPosition(shape: Shape, constraint: PointConstraint): Vec3 | null {
  if (constraint.type === 'on' || constraint.type === 'construct') return null
  // A sphere given by its radius has its size handle at the top.
  if (shape.kind === 'sphere') return constraint.type === 'height' ? addScaled(shape.center, UP, shape.radius) : null
  if (shape.kind === 'polyhedron') {
    if (constraint.type === 'height') return shape.heightEnd
    if (constraint.role === 'corner') return shape.vertices[constraint.index] ?? null
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

/** What a measure reads: points by position, other objects by shape. */
export function measureTargets(object: MeasureObject, objects: readonly GeometryObject[], shapes: ShapeMap): MeasureTarget[] | null {
  const targets: MeasureTarget[] = []
  for (const id of object.targets) {
    const target = objects.find(candidate => candidate.id === id)
    if (!target || target.geometryValid === false) return null
    if (isPoint(target)) targets.push({ kind: 'point', position: target.position })
    else {
      const shape = shapes.get(id)
      if (!shape) return null
      targets.push(shape)
    }
  }
  return targets
}

export function measureOf(object: MeasureObject, objects: readonly GeometryObject[], shapes: ShapeMap): MeasureOutcome {
  const targets = measureTargets(object, objects, shapes)
  return targets ? measure(object.measure, targets) : { ok: false, error: 'Ölçülen nesne tanımsız.' }
}

/**
 * Evaluate definitions, then recompute every dependent position and shape in document
 * order (creation order is topological). Objects whose geometry becomes undefined keep
 * their last values and are marked invalid until it is defined again. Mutates the models.
 */
export function resolveDocument(objects: readonly GeometryObject[]): ShapeMap {
  const failed = evaluateDefinitions(objects)
  const byId = new Map(objects.map(object => [object.id, object]))
  const shapes = new Map<ObjectId, Shape>()
  const position = (id: ObjectId): Vec3 | null => {
    const point = byId.get(id)
    return isPoint(point) && point.geometryValid !== false ? point.position : null
  }
  for (const object of objects) {
    if (object.type === 'parameter') {
      setValid(object, !failed.has(object.id))
      continue
    }
    if (object.type === 'measure') {
      setValid(object, measureOf(object, objects, shapes).ok)
      continue
    }
    if (object.type === 'section') {
      const [solid, plane] = object.targets.map(id => shapes.get(id))
      const section = solid && plane?.kind === 'plane' && (solid.kind === 'polyhedron' || solid.kind === 'round' || solid.kind === 'sphere')
        ? sectionOf(solid, plane) : null
      setValid(object, section !== null)
      if (section) shapes.set(object.id, section)
      continue
    }
    if (isFigure(object)) {
      const shape = failed.has(object.id) ? null : shapeOf(object, position)
      setValid(object, shape !== null)
      if (!shape) continue
      shapes.set(object.id, shape)
      if (isUnfoldable(object) && (shape.kind === 'polyhedron' || shape.kind === 'round')) {
        object.unfold = Math.min(object.unfold, maxUnfoldAngle(shape))
      }
      continue
    }
    const constraint = object.constraint
    if (!constraint) {
      setValid(object, !failed.has(object.id) && isFiniteVec(object.position))
      continue
    }
    let next: Vec3 | null = null
    if (constraint.type === 'construct') {
      // Points by position (when defined), other objects by shape (only defined ones have one).
      const sources = constraint.sources.map((id): DerivedSource | null => {
        const source = byId.get(id)
        if (!isPoint(source)) return shapes.get(id) ?? null
        return source.geometryValid === false ? null : { kind: 'point', position: source.position }
      })
      next = sources.every(source => source !== null) ? derivedPosition(constraint.rule, sources as DerivedSource[], constraint.index) : null
      if (next && isFiniteVec(next)) {
        object.position = next
        setValid(object, true)
      } else {
        setValid(object, false)
      }
      continue
    }
    const shape = shapes.get(constraint.ownerId)
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

/** IDs an object depends on: the objects it is built from and the parameters its definition names. */
export function dependencyIds(object: GeometryObject, objects: readonly GeometryObject[]): ObjectId[] {
  const ids = references(object)
  const names = definitionNames(object)
  if (names.size) {
    for (const candidate of objects) if (candidate.type === 'parameter' && names.has(candidate.name)) ids.push(candidate.id)
  }
  return ids
}

/**
 * Document order with every object after what it depends on, keeping the current order
 * where possible. Needed after a redefinition makes an object use a later one.
 */
export function dependencyOrder(objects: readonly GeometryObject[]): GeometryObject[] {
  const byId = new Map(objects.map(object => [object.id, object]))
  const placed = new Set<ObjectId>()
  const visiting = new Set<ObjectId>()
  const ordered: GeometryObject[] = []
  const place = (object: GeometryObject) => {
    if (placed.has(object.id) || visiting.has(object.id)) return
    visiting.add(object.id)
    for (const id of dependencyIds(object, objects)) {
      const dependency = byId.get(id)
      if (dependency) place(dependency)
    }
    visiting.delete(object.id)
    placed.add(object.id)
    ordered.push(object)
  }
  for (const object of objects) place(object)
  return ordered
}

/** Objects built on any of `ids` (geometry or parameter names), transitively, not including `ids`. */
export function collectDependents(objects: readonly GeometryObject[], ids: Iterable<ObjectId>): Set<ObjectId> {
  const removed = new Set(ids)
  const dependents = new Set<ObjectId>()
  let changed = true
  while (changed) {
    changed = false
    for (const object of objects) {
      if (removed.has(object.id)) continue
      if (dependencyIds(object, objects).some(id => removed.has(id))) {
        removed.add(object.id)
        dependents.add(object.id)
        changed = true
      }
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
    for (const id of dependencyIds(object, objects)) usersOf.set(id, [...usersOf.get(id) ?? [], object.id])
  }
  let changed = true
  while (changed) {
    changed = false
    for (const object of objects) {
      if (removed.has(object.id)) continue
      const owned = object.ownerId !== undefined && removed.has(object.ownerId)
      const dependent = dependencyIds(object, objects).some(id => removed.has(id))
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
