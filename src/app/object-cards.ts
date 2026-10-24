import { definitionText, editLine, exactNumber, formatNumber } from '../commands/describe'
import { measureOf, type ShapeMap } from '../document/dependencies'
import type { MeasureUnit } from '../geometry/measures'
import { polygonArea, solidVolume, surfaceArea } from '../geometry/solids'
import { maxUnfoldAngle } from '../geometry/unfold'
import {
  MAX_SIDES, MIN_SIDES, isPoint, type GeometryObject, type LineStyle, type ObjectId,
} from '../geometry/types'
import { cross, dot, sub, toDegrees } from '../geometry/vec3'
import { DEFAULT_VIEW_OPTIONS, labelShown, type LabelMode } from '../rendering/view-options'

/** Which number a card slider changes. */
export type SliderField = 'sideCount' | 'unfold' | 'value' | 'topRatio' | 'net'

export interface SliderSpec {
  field: SliderField
  min: number
  max: number
  step: number
  value: number
  label: string
}

/** A parameter's slider bounds, editable on its card. */
export interface ParameterSettings {
  min: number
  max: number
  step: number
}

export interface CardModel {
  /** The definition: what was typed, with names for the objects it uses. */
  input: string
  /** Each entry is one value line. */
  output: string[]
  /**
   * The value lines are the card's main line and the definition is shown under them only
   * while the card is selected. Otherwise the definition leads and the values follow.
   */
  valueFirst: boolean
  sliders: SliderSpec[]
  /** Present on a slider parameter: its slider stays visible and its bounds are editable. */
  parameter?: ParameterSettings
  /** The net can be played (opened and closed by itself). */
  playable?: boolean
}

/** Appearance settings a card offers; a null field is not offered for the object. */
export interface StyleSpec {
  color: string
  /** Point radius or line thickness as a factor of the default. */
  size: { value: number; min: number; max: number; caption: string } | null
  lineStyle: LineStyle | null
  /** Face opacity, 0–1. */
  opacity: number | null
  /** Whether the name is drawn in the scene. */
  label: boolean
  /** Faces and edges drawn; null when the object does not have both. */
  faces: boolean | null
  edges: boolean | null
}

/** A change made with the appearance settings. */
export interface StylePatch {
  color?: string
  size?: number
  lineStyle?: LineStyle
  opacity?: number
  labelVisible?: boolean
  faces?: boolean
  edges?: boolean
}

export interface CardContext {
  objects: readonly GeometryObject[]
  shapes: ShapeMap
}

export const DEFAULT_FACE_OPACITY = 0.55
export const DEFAULT_PLANE_OPACITY = 0.28

const UNIT_SUFFIX: Readonly<Record<MeasureUnit, string>> = { length: '', angle: '°', area: '', volume: '' }

function nameOf(objects: readonly GeometryObject[], id: ObjectId): string {
  return objects.find(object => object.id === id)?.name ?? '?'
}

/** `2x + 3y − z = 4` from three points, with small whole coefficients when the points allow. */
function planeEquation(a: { x: number; y: number; z: number }, b: typeof a, c: typeof a): string {
  let normal = cross(sub(b, a), sub(c, a))
  const largest = Math.max(Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z))
  if (largest < 1e-12) return '∅'
  // Divide by the smallest nonzero component so axis-aligned planes read y = 2.
  const smallest = Math.min(...[normal.x, normal.y, normal.z].map(Math.abs).filter(value => value > largest * 1e-9))
  normal = { x: normal.x / smallest, y: normal.y / smallest, z: normal.z / smallest }
  const first = [normal.x, normal.y, normal.z].find(value => Math.abs(value) > 1e-9)!
  if (first < 0) normal = { x: -normal.x, y: -normal.y, z: -normal.z }
  const d = dot(normal, a)
  let text = ''
  for (const [value, axis] of [[normal.x, 'x'], [normal.y, 'y'], [normal.z, 'z']] as const) {
    if (Math.abs(value) < 1e-9) continue
    const magnitude = Math.abs(value)
    const coefficient = Math.abs(magnitude - 1) < 1e-9 ? '' : formatNumber(magnitude)
    text += text ? (value < 0 ? ' − ' : ' + ') : value < 0 ? '−' : ''
    text += coefficient + axis
  }
  return `${text} = ${formatNumber(Math.abs(d) < 1e-9 ? 0 : d)}`
}

function valueLines(object: GeometryObject, context: CardContext): string[] {
  const shape = context.shapes.get(object.id)
  if (object.geometryValid === false && object.type !== 'parameter') return ['∅']
  switch (object.type) {
    case 'point':
      return object.constraint?.type === 'on' ? [`${nameOf(context.objects, object.constraint.ownerId)} üzerinde`] : []
    case 'segment':
      return shape?.kind === 'line' ? [`Uzunluk = ${formatNumber(Math.hypot(shape.b.x - shape.a.x, shape.b.y - shape.a.y, shape.b.z - shape.a.z))}`] : []
    case 'plane': {
      const points = object.points.map(id => context.objects.find(candidate => candidate.id === id))
      if (!points.every(isPoint)) return []
      const [a, b, c] = points.map(point => point.position)
      return [planeEquation(a!, b!, c!)]
    }
    case 'angle':
      return shape?.kind === 'angle' ? [`${object.name} = ${formatNumber(toDegrees(shape.radians))}°`] : []
    case 'sphere':
      if (shape?.kind !== 'sphere') return []
      return [`r = ${formatNumber(shape.radius)}`, `Yüzey alanı = ${formatNumber(4 * Math.PI * shape.radius ** 2)}`,
        `Hacim = ${formatNumber(4 / 3 * Math.PI * shape.radius ** 3)}`]
    case 'section':
      return shape?.kind === 'section' ? [`Alan = ${formatNumber(shape.area)}`] : []
    case 'prism':
    case 'pyramid':
    case 'regular':
      if (shape?.kind !== 'polyhedron') return []
      return [`Taban alanı = ${formatNumber(polygonArea(shape.base))}`, `Yüzey alanı = ${formatNumber(surfaceArea(shape))}`,
        `Hacim = ${formatNumber(solidVolume(shape))}`]
    case 'cylinder':
    case 'cone':
      if (shape?.kind !== 'round') return []
      return [shape.topRadius > 0 && shape.solid === 'cone'
        ? `r = ${formatNumber(shape.radius)}, r' = ${formatNumber(shape.topRadius)}, h = ${formatNumber(shape.height)}`
        : `r = ${formatNumber(shape.radius)}, h = ${formatNumber(shape.height)}`,
        `Yüzey alanı = ${formatNumber(surfaceArea(shape))}`, `Hacim = ${formatNumber(solidVolume(shape))}`]
    case 'measure': {
      const outcome = measureOf(object, context.objects, context.shapes)
      if (!outcome.ok) return ['∅']
      return [`${object.name} = ${formatNumber(outcome.result.value)}${UNIT_SUFFIX[outcome.result.unit]}`]
    }
    case 'parameter':
      return object.geometryValid === false ? ['∅'] : object.definition ? [`${object.name} = ${formatNumber(object.value)}`] : []
    default:
      return []
  }
}

export function describeCard(object: GeometryObject, context: CardContext): CardModel {
  const definition = definitionText(object, context.objects)
  const derived = isPoint(object) && object.constraint?.type === 'construct'
  const coordinates = isPoint(object)
    ? `${object.name} = (${(['x', 'y', 'z'] as const).map(axis => formatNumber(object.position[axis])).join(', ')})` : ''
  const input = derived ? `${object.name}: ${definition}` : isPoint(object) ? coordinates
    : object.type === 'parameter' && !object.definition ? `${object.name} = ${exactNumber(object.value)}`
      : `${object.name}: ${definition ?? object.type}`
  const sliders: SliderSpec[] = []
  const shape = context.shapes.get(object.id)
  if ((object.type === 'prism' || object.type === 'pyramid') && shape) {
    sliders.push({ field: 'sideCount', min: MIN_SIDES, max: MAX_SIDES, step: 1, value: object.sideCount, label: 'Kenar' })
  }
  if ((shape?.kind === 'polyhedron' || shape?.kind === 'round') && 'unfold' in object) {
    sliders.push({ field: 'unfold', min: 0, max: Math.ceil(maxUnfoldAngle(shape) - 1e-9), step: 1, value: Math.round(object.unfold), label: 'Açınım' })
  }
  if ((object.type === 'pyramid' || object.type === 'cone') && object.topRatio !== undefined && shape) {
    sliders.push({ field: 'topRatio', min: 0.05, max: 0.95, step: 0.05, value: object.topRatio, label: 'Oran' })
  }
  if (object.type === 'regular' && object.solid === 'cube' && shape) {
    sliders.push({ field: 'net', min: 1, max: 11, step: 1, value: (object.net ?? 0) + 1, label: 'Biçim' })
  }
  const card: CardModel = {
    input,
    output: derived ? (object.geometryValid === false ? ['∅'] : [coordinates]) : valueLines(object, context),
    valueFirst: derived || object.type === 'angle' || object.type === 'measure' || (object.type === 'parameter' && Boolean(object.definition)),
    sliders,
  }
  if (sliders.some(slider => slider.field === 'unfold')) card.playable = true
  if (object.type === 'parameter' && !object.definition) {
    card.sliders = [{ field: 'value', min: object.min, max: object.max, step: object.step, value: object.value, label: '' }]
    card.parameter = { min: object.min, max: object.max, step: object.step }
  }
  return card
}

/** Text shown while the card is edited; null when the object cannot be edited. */
export function editText(object: GeometryObject, context: CardContext): string | null {
  return editLine(object, context.objects)
}

/** Appearance settings by object type; the label box shows whether the name is drawn now. */
export function styleSpec(object: GeometryObject, labels: LabelMode = DEFAULT_VIEW_OPTIONS.labels): StyleSpec | null {
  if (object.type === 'parameter') return null
  const label = labelShown(object, labels)
  const size = (caption: string, min = 0.5, max = 3) => ({ value: object.size ?? 1, min, max, caption })
  switch (object.type) {
    case 'point':
      return { color: object.color, size: size('Boyut'), lineStyle: null, opacity: null, label, faces: null, edges: null }
    case 'line':
    case 'segment':
    case 'ray':
      return { color: object.color, size: size('Kalınlık'), lineStyle: object.lineStyle ?? 'solid', opacity: null, label, faces: null, edges: null }
    case 'angle':
      return { color: object.color, size: size('Kalınlık'), lineStyle: null, opacity: null, label, faces: null, edges: null }
    case 'measure':
      return { color: object.color, size: null, lineStyle: null, opacity: null, label: true, faces: null, edges: null }
    case 'section':
      return { color: object.color, size: null, lineStyle: object.lineStyle ?? 'solid', opacity: object.opacity ?? 0.6, label, faces: !object.facesHidden, edges: null }
    case 'plane':
      return {
        color: object.color, size: null, lineStyle: null, opacity: object.opacity ?? DEFAULT_PLANE_OPACITY, label,
        faces: !object.facesHidden, edges: !object.edgesHidden,
      }
    case 'sphere':
      return { color: object.color, size: null, lineStyle: null, opacity: object.opacity ?? DEFAULT_FACE_OPACITY, label, faces: null, edges: null }
    default:
      return {
        color: object.color, size: null, lineStyle: object.lineStyle ?? 'solid', opacity: object.opacity ?? DEFAULT_FACE_OPACITY, label,
        faces: !object.facesHidden, edges: !object.edgesHidden,
      }
  }
}

/**
 * Apply a style change; defaults are stored as absent fields. A label setting equal to what
 * the label mode would show is no setting at all. Returns whether anything changed.
 */
export function applyStyle(object: GeometryObject, patch: StylePatch, labels: LabelMode = DEFAULT_VIEW_OPTIONS.labels): boolean {
  const before = JSON.stringify(object)
  const record = object as unknown as Record<string, unknown>
  const set = (key: string, value: unknown, fallback: unknown) => {
    if (value === fallback) delete record[key]
    else record[key] = value
  }
  if (patch.color !== undefined) object.color = patch.color
  if (patch.size !== undefined) set('size', Number(patch.size.toFixed(2)), 1)
  if (patch.lineStyle !== undefined) set('lineStyle', patch.lineStyle, 'solid')
  if (patch.opacity !== undefined) {
    set('opacity', Number(patch.opacity.toFixed(2)), object.type === 'plane' ? DEFAULT_PLANE_OPACITY : object.type === 'section' ? 0.6 : DEFAULT_FACE_OPACITY)
  }
  if (patch.labelVisible !== undefined) {
    const { labelVisible: _own, ...rest } = object
    set('labelVisible', patch.labelVisible, labelShown(rest as GeometryObject, labels))
  }
  if (patch.faces !== undefined) set('facesHidden', patch.faces ? undefined : true, undefined)
  if (patch.edges !== undefined) set('edgesHidden', patch.edges ? undefined : true, undefined)
  return JSON.stringify(object) !== before
}
