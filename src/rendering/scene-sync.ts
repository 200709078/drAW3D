import * as THREE from 'three'
import { formatNumber } from '../commands/describe'
import { measureOf, type ShapeMap } from '../document/dependencies'
import { circlePoint, type Shape } from '../geometry/solids'
import { isInternalPoint, isPoint, type GeometryObject, type ObjectId } from '../geometry/types'
import { UP, add, addScaled, centroid, scale, toDegrees, type Vec3 } from '../geometry/vec3'
import { ArrowView } from './arrows'
import type { Viewer } from '../geometry/visibility'
import type { LabelLayer } from './labels'
import { labelShown, type ViewOptions } from './view-options'
import type { MaterialCache } from './materials'
import {
  AngleView, MeasureView, PlaneView, PointView, PolyhedronView, RoundView, SELECTED_COLOR, SectionView, SphereView, TubeView,
  type ViewStyle,
} from './views'

export const POINT_RADIUS = 0.2
export const COARSE_POINT_RADIUS = 0.3
export const PREVIEW_COLOR = '#ff0000'
export const PREVIEW_SOLID_COLOR = '#d2a679'

export interface SceneState {
  objects: readonly GeometryObject[]
  shapes: ShapeMap
  /** The selected object; helpers it owns are highlighted with it. */
  selectedId: ObjectId | null
  /** Larger points for touch screens. */
  coarse: boolean
  /** Size factor of the screen (`DisplayProfile.sceneScale`): points and thick lines. */
  scale: number
  /** The selected point's drag directions. */
  arrows: { origin: Vec3; directions: Vec3[] } | null
  view: ViewOptions
}

/** What a construction tool shows before its last click. */
export interface Preview {
  /** Where the next point would go (mouse and pen only). */
  cursor: Vec3 | null
  /** The object as it would be built with the cursor as the last point. */
  shape: Shape | null
}

type View = PointView | TubeView | PlaneView | AngleView | SphereView | PolyhedronView | RoundView | MeasureView | SectionView

function createShapeView(materials: MaterialCache, shape: Shape): View {
  switch (shape.kind) {
    case 'line': return new TubeView(materials)
    case 'plane': return new PlaneView(materials)
    case 'angle': return new AngleView(materials)
    case 'sphere': return new SphereView(materials)
    case 'polyhedron': return new PolyhedronView(materials)
    case 'round': return new RoundView(materials, shape.solid)
    case 'section': return new SectionView(materials)
  }
}

/** Objects without a picture (parameters) have no view. */
function createObjectView(materials: MaterialCache, object: GeometryObject): View | null {
  switch (object.type) {
    case 'point': return new PointView(materials)
    case 'line':
    case 'segment':
    case 'ray': return new TubeView(materials)
    case 'plane': return new PlaneView(materials)
    case 'angle': return new AngleView(materials)
    case 'sphere': return new SphereView(materials)
    case 'prism':
    case 'pyramid': return new PolyhedronView(materials)
    case 'cylinder':
    case 'cone': return new RoundView(materials, object.type)
    case 'regular': return new PolyhedronView(materials)
    case 'section': return new SectionView(materials)
    case 'measure': return new MeasureView(materials)
    case 'parameter': return null
  }
}

function drawShape(view: View, shape: Shape, style: ViewStyle, unfold: number): void {
  switch (shape.kind) {
    case 'line':
      (view as TubeView).update(shape.start, shape.end, style)
      return
    case 'plane':
      (view as PlaneView).update(shape, style)
      return
    case 'angle':
      (view as AngleView).update(shape, style)
      return
    case 'sphere':
      (view as SphereView).update(shape, style)
      return
    case 'polyhedron':
      (view as PolyhedronView).update(shape, style, unfold)
      return
    case 'round':
      (view as RoundView).update(shape, style, unfold)
      return
    case 'section':
      (view as SectionView).update(shape, style)
  }
}

/** Angle text, as on the card: whole degrees. */
export function angleText(radians: number): string {
  return `${Math.round(toDegrees(radians))}°`
}

/** Where an object's name is written. */
function labelAnchor(shape: Shape): Vec3 {
  switch (shape.kind) {
    case 'line': return scale(add(shape.a, shape.b), 0.5)
    case 'plane': return addScaled(shape.center, shape.u, shape.size / 2 - 1)
    case 'angle': return shape.vertex
    case 'sphere': return addScaled(shape.center, UP, shape.radius * 1.1)
    case 'polyhedron': return addScaled(centroid(shape.vertices), shape.normal, shape.height * 0.6)
    case 'round': return addScaled(shape.baseCenter, shape.axis, shape.height * 1.1)
    case 'section': return shape.center
  }
}

/**
 * Keeps the Three.js scene in step with the document: one view per object ID, created on
 * first sight, updated in place and disposed when the object leaves the document.
 */
export class SceneSync {
  private views = new Map<ObjectId, { type: string; view: View | null }>()
  private group = new THREE.Group()
  private preview = new THREE.Group()
  private previewView: { kind: string; view: View } | null = null
  private cursor: THREE.Mesh
  private hiddenEdges = true
  private viewer: Viewer | null = null
  private scale = 1
  readonly arrows: ArrowView

  constructor(scene: THREE.Scene, private materials: MaterialCache, private labels: LabelLayer) {
    this.cursor = new THREE.Mesh(new THREE.SphereGeometry(POINT_RADIUS, 16, 12), materials.overlay(PREVIEW_COLOR))
    this.cursor.visible = false
    this.arrows = new ArrowView(materials)
    this.preview.add(this.cursor)
    scene.add(this.group, this.preview, this.arrows.root)
  }

  update(state: SceneState): void {
    this.scale = state.scale
    this.cursor.scale.setScalar(state.scale)
    if (this.hiddenEdges !== state.view.hiddenEdges) {
      this.hiddenEdges = state.view.hiddenEdges
      this.setViewer(this.viewer)
    }
    const seen = new Set<ObjectId>()
    const labels = new Set<string>()
    const byId = new Map(state.objects.map(object => [object.id, object]))
    const label = (key: string, text: string, color: string, anchor: Vec3) => {
      labels.add(key)
      this.labels.set(key, text, color, anchor)
    }
    const isSelected = (object: GeometryObject): boolean => {
      if (state.selectedId === null) return false
      let current: GeometryObject | undefined = object
      while (current) {
        if (current.id === state.selectedId) return true
        // Points stand on their own; only non-point helpers share the owner's highlight.
        if (isPoint(current) || current.ownerId === undefined) return false
        current = byId.get(current.ownerId)
      }
      return false
    }
    for (const object of state.objects) {
      seen.add(object.id)
      let entry = this.views.get(object.id)
      if (entry && entry.type !== object.type) {
        this.disposeView(object.id)
        entry = undefined
      }
      if (!entry) {
        const view = createObjectView(this.materials, object)
        entry = { type: object.type, view }
        this.views.set(object.id, entry)
        if (view) this.group.add(view.root)
      }
      const view = entry.view
      if (!view) continue
      const shape = state.shapes.get(object.id)
      const drawable = (isPoint(object) && !isInternalPoint(object)) || object.type === 'measure' || shape !== undefined
      const visible = !object.hidden && object.geometryValid !== false && drawable
      view.root.visible = visible
      if (!visible) continue
      const selected = isSelected(object)
      const color = selected ? SELECTED_COLOR : object.color
      if (isPoint(object)) {
        const base = state.coarse ? COARSE_POINT_RADIUS : POINT_RADIUS
        const radius = (object.constraint?.type === 'on' ? base * 1.1 : base) * (object.size ?? 1) * state.scale
        ;(view as PointView).update(object.position, color, radius)
        if (labelShown(object, state.view.labels)) {
          const { x, y, z } = object.position
          const text = state.view.coordinates
            ? `${object.name}(${formatNumber(x)}, ${formatNumber(y)}, ${formatNumber(z)})` : object.name
          label(`name:${object.id}`, text, color, addScaled(object.position, UP, radius + 0.35))
        }
        continue
      }
      if (object.type === 'measure') {
        const outcome = measureOf(object, state.objects, state.shapes)
        const result = outcome.ok ? outcome.result : null
        ;(view as MeasureView).update(result?.from, result?.to, { color: object.color, selected })
        if (result) {
          const unit = result.unit === 'angle' ? '°' : ''
          label(`measure:${object.id}`, `${object.name} = ${formatNumber(result.value)}${unit}`, color, result.anchor)
        }
        continue
      }
      // A helper segment is an edge of its owner (a solid's base edge, a radius) and looks like one.
      const owner = object.ownerId === undefined ? undefined : byId.get(object.ownerId)
      if (owner && owner.edgesHidden && !selected) {
        view.root.visible = false
        continue
      }
      const look = owner ?? object
      const style: ViewStyle = {
        color: object.color, selected,
        ...(look.size !== undefined && !owner ? { size: look.size } : {}),
        ...(look.lineStyle !== undefined ? { lineStyle: look.lineStyle } : {}),
        ...(object.opacity !== undefined ? { opacity: object.opacity } : {}),
        faces: !object.facesHidden,
        edges: !object.edgesHidden,
        scale: state.scale,
      }
      const unfold = 'unfold' in object ? object.unfold : 0
      drawShape(view, shape!, style, unfold)
      if (shape!.kind === 'angle') {
        const text = labelShown(object, state.view.labels) ? `${object.name} = ${angleText(shape!.radians)}` : angleText(shape!.radians)
        label(`angle:${object.id}`, text, color,
          circlePoint(shape!.vertex, shape!.u, shape!.v, shape!.arcRadius + 0.7, shape!.radians / 2))
      } else if (labelShown(object, state.view.labels)) {
        label(`name:${object.id}`, object.name, color, labelAnchor(shape!))
      }
      if (this.hiddenEdges && 'setViewer' in view) view.setViewer(this.viewer)
    }
    for (const id of [...this.views.keys()]) {
      if (!seen.has(id)) this.disposeView(id)
    }
    this.labels.retain(labels)
    if (state.arrows) this.arrows.update(state.arrows.origin, state.arrows.directions, SELECTED_COLOR)
    else this.arrows.update(null, [], SELECTED_COLOR)
  }

  /** Where the viewer is now; solids split their edges into seen and hidden ones. */
  setViewer(viewer: Viewer | null): void {
    this.viewer = viewer
    const shown = this.hiddenEdges ? viewer : null
    for (const { view } of this.views.values()) {
      if (view && 'setViewer' in view) view.setViewer(shown)
    }
  }

  setPreview(preview: Preview | null): void {
    this.cursor.visible = Boolean(preview?.cursor)
    if (preview?.cursor) this.cursor.position.set(preview.cursor.x, preview.cursor.y, preview.cursor.z)
    const shape = preview?.shape ?? null
    if (!shape) {
      if (this.previewView) this.previewView.view.root.visible = false
      return
    }
    const kind = shape.kind === 'round' ? shape.solid : shape.kind
    if (this.previewView?.kind !== kind) {
      if (this.previewView) {
        this.preview.remove(this.previewView.view.root)
        this.previewView.view.dispose()
      }
      this.previewView = { kind, view: createShapeView(this.materials, shape) }
      this.preview.add(this.previewView.view.root)
    }
    this.previewView.view.root.visible = true
    const solid = shape.kind === 'polyhedron' || shape.kind === 'round' || shape.kind === 'sphere' || shape.kind === 'plane'
    drawShape(this.previewView.view, shape, { color: solid ? PREVIEW_SOLID_COLOR : PREVIEW_COLOR, selected: false, scale: this.scale }, 0)
  }

  private disposeView(id: ObjectId): void {
    const entry = this.views.get(id)
    if (!entry) return
    if (entry.view) {
      this.group.remove(entry.view.root)
      entry.view.dispose()
    }
    this.views.delete(id)
  }
}
