import { isPoint, isPolyhedron, isUnfoldable, type GeometryObject, type ObjectId, type PointObject } from '../geometry/types'
import { clampSides, createContext, createPoint, vertexSlotsOf, type ConstructionContext } from './constructions'
import { collectDependents, collectOwned, planDeletion, resolveDocument, type ShapeMap } from './dependencies'
import type { GeometryDocument } from './geometry-document'

/** The object a click selects: helpers (a solid's base edge, a sphere's radius) select their owner. */
export function selectionTarget(document: GeometryDocument, id: ObjectId): GeometryObject | undefined {
  let object = document.get(id)
  while (object && !isPoint(object) && object.ownerId !== undefined) object = document.get(object.ownerId)
  return object
}

/** Helpers and a solid's derived points cannot be deleted on their own. */
export function canDelete(object: GeometryObject | undefined): boolean {
  if (!object || object.ownerId !== undefined) return false
  return !isPoint(object) || object.constraint === undefined || object.constraint.type === 'on' || object.constraint.type === 'construct'
}

export function deleteObject(document: GeometryDocument, id: ObjectId): boolean {
  if (!canDelete(document.get(id))) return false
  const plan = planDeletion(document.objects, [id])
  for (const releasedId of plan.release) delete document.get(releasedId)!.ownerId
  for (const removedId of plan.remove) document.remove(removedId)
  return plan.remove.length > 0
}

/** Hide an object with its helpers. */
export function hideObject(document: GeometryDocument, id: ObjectId): boolean {
  const target = document.get(id)
  if (!target || target.hidden) return false
  for (const objectId of [id, ...collectOwned(document.objects, [id])]) document.get(objectId)!.hidden = true
  return true
}

export function hasHidden(document: GeometryDocument): boolean {
  return document.objects.some(object => object.hidden)
}

export function showAll(document: GeometryDocument): boolean {
  let changed = false
  for (const object of document.objects) {
    if (!object.hidden) continue
    delete object.hidden
    changed = true
  }
  return changed
}

/**
 * Keep a solid's locked vertex points in step with its type and side count: missing ones
 * are added, unused extra ones removed. Extra vertices that other objects still use stay
 * (undefined, so hidden) and return when they exist again.
 */
export function syncVertexPoints(document: GeometryDocument, context: ConstructionContext, id: ObjectId): void {
  const solid = document.get(id)
  if (!isUnfoldable(solid)) return
  const wanted = vertexSlotsOf(solid)
  const existing = document.objects.filter((object): object is PointObject => isPoint(object)
    && object.constraint?.type === 'vertex' && object.constraint.ownerId === id)
  const key = (role: string, index: number) => `${role}:${index}`
  const wantedKeys = new Set(wanted.map(slot => key(slot.role, slot.index)))
  const existingKeys = new Set<string>()
  for (const point of existing) {
    const constraint = point.constraint as { role: string; index: number }
    const pointKey = key(constraint.role, constraint.index)
    existingKeys.add(pointKey)
    if (!wantedKeys.has(pointKey) && collectDependents(document.objects, [point.id]).size === 0) {
      document.remove(point.id)
      existingKeys.delete(pointKey)
    }
  }
  const anchor = document.get(solid.points[0])
  const position = isPoint(anchor) ? anchor.position : { x: 0, y: 0, z: 0 }
  for (const slot of wanted) {
    if (existingKeys.has(key(slot.role, slot.index))) continue
    document.append({ ...createPoint(context, position, { type: 'vertex', ownerId: id, ...slot }), ownerId: id })
  }
}

/**
 * Resolve the document, keeping every solid's vertex points in step with side counts that
 * parameters changed. The single entry point for "bring the document up to date".
 */
export function resolveAll(document: GeometryDocument): ShapeMap {
  let shapes = resolveDocument(document.objects)
  let synced = false
  for (const solid of document.objects.filter(isUnfoldable)) {
    const present = new Set(document.objects.flatMap(object => isPoint(object) && object.constraint?.type === 'vertex'
      && object.constraint.ownerId === solid.id ? [`${object.constraint.role}:${object.constraint.index}`] : []))
    const wanted = vertexSlotsOf(solid)
    // Extra vertices of a smaller count stay undefined until the count grows again.
    if (wanted.every(slot => present.has(`${slot.role}:${slot.index}`))) continue
    syncVertexPoints(document, createContext(document.objects, () => document.allocateId()), solid.id)
    synced = true
  }
  if (synced) shapes = resolveDocument(document.objects)
  return shapes
}

/** Change a prism's or pyramid's side count and its vertex points with it. */
export function setSideCount(
  document: GeometryDocument, context: ConstructionContext, id: ObjectId, sides: number,
): boolean {
  const solid = document.get(id)
  if (!isPolyhedron(solid)) return false
  const count = clampSides(sides)
  if (solid.sideCount === count) return false
  solid.sideCount = count
  syncVertexPoints(document, context, id)
  return true
}

/** The solid with a net the selection belongs to (a helper selects its owner). */
export function solidOf(document: GeometryDocument, id: ObjectId | null) {
  const object = id === null ? undefined : selectionTarget(document, id)
  return isUnfoldable(object) ? object : undefined
}
