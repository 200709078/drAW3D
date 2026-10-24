import * as THREE from 'three'
import type { ShapeMap } from '../document/dependencies'
import { circlePoint, type Shape } from '../geometry/solids'
import { isPoint, type GeometryObject, type ObjectId } from '../geometry/types'
import { toDegrees, type Vec3 } from '../geometry/vec3'
import { ArrowView } from './arrows'
import type { LabelLayer } from './labels'
import type { MaterialCache } from './materials'
import {
  AngleView, PlaneView, PointView, PolyhedronView, RoundView, SELECTED_COLOR, SphereView, TubeView,
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
  /** The selected point's drag directions. */
  arrows: { origin: Vec3; directions: Vec3[] } | null
}

/** What a construction tool shows before its last click. */
export interface Preview {
  /** Where the next point would go (mouse and pen only). */
  cursor: Vec3 | null
  /** The object as it would be built with the cursor as the last point. */
  shape: Shape | null
}

type View = PointView | TubeView | PlaneView | AngleView | SphereView | PolyhedronView | RoundView

function createView(materials: MaterialCache, object: GeometryObject | Shape): View {
  if ('kind' in object) {
    switch (object.kind) {
      case 'line': return new TubeView(materials)
      case 'plane': return new PlaneView(materials)
      case 'angle': return new AngleView(materials)
      case 'sphere': return new SphereView(materials)
      case 'polyhedron': return new PolyhedronView(materials)
      case 'round': return new RoundView(materials, object.solid)
    }
  }
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
  }
}

/** Angle text, as on the card: whole degrees. */
export function angleText(radians: number): string {
  return `${Math.round(toDegrees(radians))}°`
}

/**
 * Keeps the Three.js scene in step with the document: one view per object ID, created on
 * first sight, updated in place and disposed when the object leaves the document.
 */
export class SceneSync {
  private views = new Map<ObjectId, { type: string; view: View }>()
  private group = new THREE.Group()
  private preview = new THREE.Group()
  private previewView: { kind: string; view: View } | null = null
  private cursor: THREE.Mesh
  readonly arrows: ArrowView

  constructor(scene: THREE.Scene, private materials: MaterialCache, private labels: LabelLayer) {
    this.cursor = new THREE.Mesh(new THREE.SphereGeometry(POINT_RADIUS, 16, 12), materials.overlay(PREVIEW_COLOR))
    this.cursor.visible = false
    this.arrows = new ArrowView(materials)
    this.preview.add(this.cursor)
    scene.add(this.group, this.preview, this.arrows.root)
  }

  update(state: SceneState): void {
    const seen = new Set<ObjectId>()
    const labels = new Set<string>()
    const byId = new Map(state.objects.map(object => [object.id, object]))
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
        entry = { type: object.type, view: createView(this.materials, object) }
        this.views.set(object.id, entry)
        this.group.add(entry.view.root)
      }
      const shape = state.shapes.get(object.id)
      const visible = !object.hidden && object.geometryValid !== false && (isPoint(object) || shape !== undefined)
      entry.view.root.visible = visible
      if (!visible) continue
      const selected = isSelected(object)
      if (isPoint(object)) {
        const base = state.coarse ? COARSE_POINT_RADIUS : POINT_RADIUS
        const radius = object.constraint?.type === 'on' ? base * 1.1 : base
        ;(entry.view as PointView).update(object.position, selected ? SELECTED_COLOR : object.color, radius)
        continue
      }
      const unfold = 'unfold' in object ? object.unfold : 0
      drawShape(entry.view, shape!, { color: object.color, selected }, unfold)
      if (shape!.kind === 'angle') {
        const key = `angle:${object.id}`
        labels.add(key)
        this.labels.set(key, angleText(shape!.radians), selected ? SELECTED_COLOR : object.color,
          circlePoint(shape!.vertex, shape!.u, shape!.v, shape!.arcRadius + 0.7, shape!.radians / 2))
      }
    }
    for (const id of [...this.views.keys()]) {
      if (!seen.has(id)) this.disposeView(id)
    }
    this.labels.retain(labels)
    if (state.arrows) this.arrows.update(state.arrows.origin, state.arrows.directions, SELECTED_COLOR)
    else this.arrows.update(null, [], SELECTED_COLOR)
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
      this.previewView = { kind, view: createView(this.materials, shape) }
      this.preview.add(this.previewView.view.root)
    }
    this.previewView.view.root.visible = true
    const solid = shape.kind === 'polyhedron' || shape.kind === 'round' || shape.kind === 'sphere' || shape.kind === 'plane'
    drawShape(this.previewView.view, shape, { color: solid ? PREVIEW_SOLID_COLOR : PREVIEW_COLOR, selected: false }, 0)
  }

  private disposeView(id: ObjectId): void {
    const entry = this.views.get(id)
    if (!entry) return
    this.group.remove(entry.view.root)
    entry.view.dispose()
    this.views.delete(id)
  }
}

