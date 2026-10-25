import { isInternalPoint, type GeometryObject } from '../geometry/types'
import type { DisplayMode } from './display'

/** Which objects show their name when they have no label setting of their own. */
export type LabelMode = 'none' | 'points' | 'all'

/** How the scene is shown; view state, not part of the document or its history. */
export interface ViewOptions {
  orthographic: boolean
  axes: boolean
  labels: LabelMode
  /** Point labels include the coordinates: A(1, 2, 0). */
  coordinates: boolean
  /** Edges of solids hidden behind faces are drawn dashed, as in textbooks. */
  hiddenEdges: boolean
  /** The kind of screen: sharpness, shadows, sizes of the interface and the scene. */
  display: DisplayMode
}

export const DEFAULT_VIEW_OPTIONS: Readonly<ViewOptions> = {
  orthographic: false, axes: false, labels: 'points', coordinates: false, hiddenEdges: true, display: 'auto',
}

/** Whether an object's name is drawn: its own setting, else the label mode. */
export function labelShown(object: GeometryObject, mode: LabelMode): boolean {
  if (object.labelVisible !== undefined) return object.labelVisible
  if (mode === 'none' || object.type === 'parameter' || object.type === 'measure') return false
  if (object.type === 'point') return !isInternalPoint(object)
  // A solid's base edge or a sphere's radius is part of its owner, not a separate object.
  return mode === 'all' && object.ownerId === undefined
}
