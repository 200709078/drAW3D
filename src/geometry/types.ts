import type { Vec3 } from './vec3'

export type ObjectId = number
export type ObjectReference = ObjectId | null

export type LineStyle = 'solid' | 'dashed' | 'dotted'

/**
 * Every document object is plain, structured-cloneable data: history snapshots clone the
 * whole graph and references are object IDs. Optional fields are absent by default, so
 * reverting a setting restores the exact graph.
 */
export interface BaseObject<Type extends string> {
  id: ObjectId
  type: Type
  name: string
  color: string
  /** Hidden with "Gizle"; restored with "Tümünü Göster". */
  hidden?: true
  /**
   * A helper created by a construction (a solid's height point, its base edge, a sphere's
   * radius...). It is deleted and hidden with its owner and cannot be deleted alone.
   */
  ownerId?: ObjectId
  /** Dependent geometry became undefined; last values are kept and the object is not drawn. */
  geometryValid?: false
  // Appearance settings for the object cards (roadmap Y1).
  size?: number
  lineStyle?: LineStyle
  opacity?: number
  labelHidden?: true
}

/** A point that lies on a part (edge or face) of another object. */
export interface OnObjectConstraint {
  type: 'on'
  ownerId: ObjectId
  /** Index into the owner's parts (see geometry/parts.ts). */
  part: number
  /** Coordinates in the part's own parameter space. */
  params: number[]
}

/** A locked vertex of a solid (drawn gray): usable by other constructions, never dragged. */
export interface VertexConstraint {
  type: 'vertex'
  ownerId: ObjectId
  role: 'base' | 'top' | 'center' | 'topRim'
  index: number
}

/** The purple point of a solid; dragging it changes the solid's height. */
export interface HeightConstraint {
  type: 'height'
  ownerId: ObjectId
}

export type PointConstraint = OnObjectConstraint | VertexConstraint | HeightConstraint

export interface PointObject extends BaseObject<'point'> {
  position: Vec3
  constraint?: PointConstraint
}

export type LineKind = 'line' | 'segment' | 'ray'

export interface LineObject extends BaseObject<LineKind> {
  points: [ObjectId, ObjectId]
}

export interface PlaneObject extends BaseObject<'plane'> {
  points: [ObjectId, ObjectId, ObjectId]
}

export interface AngleObject extends BaseObject<'angle'> {
  /** The second point is the vertex. */
  points: [ObjectId, ObjectId, ObjectId]
}

export interface SphereObject extends BaseObject<'sphere'> {
  /** Center, then a point on the surface. */
  points: [ObjectId, ObjectId]
}

export type PolyhedronKind = 'prism' | 'pyramid'
export type RoundKind = 'cylinder' | 'cone'

export interface UnfoldableObject {
  height: number
  /** Opening angle in degrees; 0 is closed. Clamped to the solid's maximum. */
  unfold: number
}

export interface PolyhedronObject extends BaseObject<PolyhedronKind>, UnfoldableObject {
  /**
   * A and B are the first base edge; the free point C fixes the base plane and the side
   * of AB the base is not on.
   */
  points: [ObjectId, ObjectId, ObjectId]
  sideCount: number
}

export interface RoundObject extends BaseObject<RoundKind>, UnfoldableObject {
  /** Base center, then a point on the base circle. */
  points: [ObjectId, ObjectId]
}

export type SolidObject = PolyhedronObject | RoundObject

export type GeometryObject =
  | PointObject
  | LineObject
  | PlaneObject
  | AngleObject
  | SphereObject
  | PolyhedronObject
  | RoundObject

export type ObjectType = GeometryObject['type']

export const MIN_SIDES = 3
export const MAX_SIDES = 20
export const DEFAULT_SIDES = 4
/** Heights never collapse to zero, so a solid stays a solid. */
export const MIN_HEIGHT = 0.05

export function isPoint(object: GeometryObject | undefined): object is PointObject {
  return object?.type === 'point'
}

export function isPolyhedron(object: GeometryObject | undefined): object is PolyhedronObject {
  return object?.type === 'prism' || object?.type === 'pyramid'
}

export function isRound(object: GeometryObject | undefined): object is RoundObject {
  return object?.type === 'cylinder' || object?.type === 'cone'
}

export function isSolid(object: GeometryObject | undefined): object is SolidObject {
  return isPolyhedron(object) || isRound(object)
}

/** IDs this object reads its geometry from. */
export function references(object: GeometryObject): ObjectId[] {
  if (object.type !== 'point') return [...object.points]
  return object.constraint ? [object.constraint.ownerId] : []
}

export type PointKind = 'free' | 'on' | 'vertex' | 'height'

export function pointKind(point: PointObject): PointKind {
  return point.constraint?.type ?? 'free'
}
