import type { Vec3 } from './vec3'

export type ObjectId = number
export type ObjectReference = ObjectId | null

export type LineStyle = 'solid' | 'dashed' | 'dotted'

/**
 * Number fields whose value comes from an expression over parameters (`Prizma(A,B,n)`).
 * The expression is evaluated on every refresh; the field holds its latest value.
 */
export type DefinedField = 'x' | 'y' | 'z' | 'radius' | 'sideCount' | 'height' | 'unfold' | 'value' | 'topRatio'
export type Definition = Partial<Record<DefinedField, string>>

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
  /** Expressions over parameters for some number fields. */
  definition?: Definition
  // Appearance settings from the object cards; absent means the default look.
  /** Point radius or line thickness as a factor of the default. */
  size?: number
  lineStyle?: LineStyle
  /** Face opacity of planes, spheres and solids (0–1). */
  opacity?: number
  /** Whether the name is drawn next to the object; absent follows the view's label mode. */
  labelVisible?: boolean
  /** Solids, spheres and planes: draw only the edges / only the faces. */
  facesHidden?: true
  edgesHidden?: true
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
  /** `corner`: any vertex of a regular polyhedron, by its index in the shape's vertices. */
  role: 'base' | 'top' | 'center' | 'topRim' | 'corner'
  index: number
}

/** The purple point of a solid (or of a sphere given by its radius); dragging it changes the size. */
export interface HeightConstraint {
  type: 'height'
  ownerId: ObjectId
}

/**
 * How a constructed point follows its sources: a midpoint, an intersection (the `index`th
 * point when there are two), the foot of a perpendicular; and for the hidden second points
 * of constructed lines and planes: a step along a line's direction or a plane's normal,
 * a step along one of two axes square to a line or in a plane, a point of two planes' line.
 */
export type ConstructRule = 'midpoint' | 'intersect' | 'project' | 'along' | 'basis' | 'planeMeet'

/** A point computed from other objects (drawn dark gray, never dragged). */
export interface ConstructConstraint {
  type: 'construct'
  rule: ConstructRule
  sources: ObjectId[]
  index?: number
}

export type PointConstraint = OnObjectConstraint | VertexConstraint | HeightConstraint | ConstructConstraint

export interface PointObject extends BaseObject<'point'> {
  position: Vec3
  constraint?: PointConstraint
}

export type LineKind = 'line' | 'segment' | 'ray'

/** A line or plane built from other objects; its second (and third) points are internal helpers. */
export interface Construction {
  kind: 'perpendicular' | 'parallel' | 'intersection'
  sources: ObjectId[]
}

export interface LineObject extends BaseObject<LineKind> {
  points: [ObjectId, ObjectId]
  construction?: Construction
}

export interface PlaneObject extends BaseObject<'plane'> {
  points: [ObjectId, ObjectId, ObjectId]
  construction?: Construction
}

export interface AngleObject extends BaseObject<'angle'> {
  /** The second point is the vertex. */
  points: [ObjectId, ObjectId, ObjectId]
}

export interface SphereObject extends BaseObject<'sphere'> {
  /** Center, then a point on the surface; or only the center with `radius`. */
  points: [ObjectId] | [ObjectId, ObjectId]
  radius?: number
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
  /** A pyramid cut parallel to its base (kesik piramit): top size over base size, 0–1. */
  topRatio?: number
}

export interface RoundObject extends BaseObject<RoundKind>, UnfoldableObject {
  /** Base center, then a point on the base circle. */
  points: [ObjectId, ObjectId]
  /** A cone cut parallel to its base (kesik koni): top radius over base radius, 0–1. */
  topRatio?: number
}

export type SolidObject = PolyhedronObject | RoundObject

export type RegularKind = 'tetrahedron' | 'cube' | 'octahedron' | 'dodecahedron' | 'icosahedron'

/** A regular polyhedron on the base edge AB, its base face on the side of AB away from C. */
export interface RegularObject extends BaseObject<'regular'> {
  points: [ObjectId, ObjectId, ObjectId]
  solid: RegularKind
  unfold: number
  /** The cube's net, one of the 11 (index 0–10). */
  net?: number
}

/** Where a plane cuts a solid (kesit): the section polygon. */
export interface SectionObject extends BaseObject<'section'> {
  /** The solid (or sphere), then the plane. */
  targets: [ObjectId, ObjectId]
}

/** `a=2`: a number with a slider, or an expression over other parameters (`definition.value`). */
export interface ParameterObject extends BaseObject<'parameter'> {
  value: number
  min: number
  max: number
  step: number
}

export type MeasureKind = 'length' | 'distance' | 'angle' | 'baseArea' | 'surfaceArea' | 'volume'

/** A measurement of other objects (`Uzaklık(A,p)`, `Hacim(prizma1)`); its value is computed. */
export interface MeasureObject extends BaseObject<'measure'> {
  measure: MeasureKind
  targets: ObjectId[]
}

export type GeometryObject =
  | PointObject
  | LineObject
  | PlaneObject
  | AngleObject
  | SphereObject
  | PolyhedronObject
  | RoundObject
  | ParameterObject
  | MeasureObject
  | RegularObject
  | SectionObject

/** Objects with a shape in the scene, built from points. */
export type FigureObject = Exclude<GeometryObject, PointObject | ParameterObject | MeasureObject | SectionObject>

/** Objects with a net that can be opened. */
export type UnfoldableSolid = SolidObject | RegularObject

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

export function isUnfoldable(object: GeometryObject | undefined): object is UnfoldableSolid {
  return isSolid(object) || object?.type === 'regular'
}

export function isFigure(object: GeometryObject | undefined): object is FigureObject {
  return object !== undefined && 'points' in object
}

/** IDs this object reads its geometry from (parameter names in definitions are separate). */
export function references(object: GeometryObject): ObjectId[] {
  if (object.type === 'point') {
    if (!object.constraint) return []
    return object.constraint.type === 'construct' ? [...object.constraint.sources] : [object.constraint.ownerId]
  }
  if (object.type === 'parameter') return []
  if (object.type === 'measure' || object.type === 'section') return [...object.targets]
  return [...object.points]
}

export type PointKind = 'free' | 'on' | 'vertex' | 'height' | 'derived'

export function pointKind(point: PointObject): PointKind {
  const type = point.constraint?.type
  return type === 'construct' ? 'derived' : type ?? 'free'
}

/** The hidden second points of constructed lines and planes: never drawn, picked or listed. */
export function isInternalPoint(object: GeometryObject | undefined): boolean {
  return object?.type === 'point' && object.constraint?.type === 'construct' && object.ownerId !== undefined
}
