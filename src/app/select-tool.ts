import type { ShapeMap } from '../document/dependencies'
import { selectionTarget } from '../document/editing'
import type { GeometryDocument } from '../document/geometry-document'
import { partsOf } from '../geometry/parts'
import { MIN_HEIGHT, isPoint, isSolid, pointKind, type ObjectId, type PointObject } from '../geometry/types'
import { UP, X_AXIS, Z_AXIS, add, closestOnLineToRay, sub, type Vec3 } from '../geometry/vec3'
import type { Projector, ScreenPoint } from './camera-state'
import { hitPart, hitTolerance, nearestPoint, planePoint, type PointerKind } from './hit-test'

/** A selected point can be grabbed from this far away (fingers cover it). */
export const SELECTED_POINT_GRAB_PX = 70
const MOVE_THRESHOLD_PX = 4
const DOUBLE_TAP_MS = 350

export interface SelectDependencies {
  document: GeometryDocument
  projector: Projector
  shapes(): ShapeMap
  refresh(): void
}

type DragMode = 'horizontal' | 'vertical' | 'on' | 'height'

interface Drag {
  pointId: ObjectId
  mode: DragMode
  start: ScreenPoint
  /** Horizontal drags keep the grab offset and the point's height. */
  offset: Vec3
  height: number
  moved: boolean
}

/**
 * The select tool: picks points before objects, drags points in the way their kind allows,
 * and leaves presses on objects and empty space to the camera.
 */
export class SelectController {
  /** The free point that moves vertically instead of horizontally (double tap toggles). */
  verticalPointId: ObjectId | null = null
  private drag: Drag | null = null
  private lastTap: { id: ObjectId; time: number } | null = null

  constructor(private deps: SelectDependencies) {}

  get dragging(): boolean { return this.drag !== null }

  private selectedPoint(): PointObject | null {
    const selected = this.deps.document.get(this.deps.document.activeId)
    return isPoint(selected) ? selected : null
  }

  /** True when the press is the tool's (a point); false leaves it to the camera. */
  pointerDown(spot: ScreenPoint, kind: PointerKind): boolean {
    const { document, projector } = this.deps
    const tolerance = hitTolerance(kind)
    let point = nearestPoint(document.objects, projector, spot, tolerance)
    const hit = point ? null : hitPart(document.objects, this.deps.shapes(), projector, spot, tolerance)
    if (!point && !hit) {
      const selected = this.selectedPoint()
      const screen = selected && pointKind(selected) !== 'vertex' ? projector.toScreen(selected.position) : null
      if (screen && Math.hypot(screen.x - spot.x, screen.y - spot.y) <= SELECTED_POINT_GRAB_PX) point = selected
    }
    if (!point) {
      document.activeId = hit ? selectionTarget(document, hit.ownerId)?.id ?? null : null
      this.verticalPointId = null
      this.deps.refresh()
      return false
    }
    if (document.activeId !== point.id) this.verticalPointId = null
    document.activeId = point.id
    const kindOfPoint = pointKind(point)
    if (kindOfPoint !== 'vertex') {
      const mode: DragMode = kindOfPoint === 'on' ? 'on' : kindOfPoint === 'height' ? 'height'
        : this.verticalPointId === point.id ? 'vertical' : 'horizontal'
      const ground = mode === 'horizontal' ? planePoint(projector, spot, point.position.y) : null
      document.beginEdit()
      this.drag = {
        pointId: point.id, mode, start: spot, moved: false, height: point.position.y,
        offset: ground ? sub(point.position, ground) : { x: 0, y: 0, z: 0 },
      }
    }
    this.deps.refresh()
    return true
  }

  pointerMove(spot: ScreenPoint): void {
    const drag = this.drag
    if (!drag) return
    if (!drag.moved && Math.hypot(spot.x - drag.start.x, spot.y - drag.start.y) <= MOVE_THRESHOLD_PX) return
    drag.moved = true
    const point = this.deps.document.get(drag.pointId)
    if (!isPoint(point)) return
    if (this.movePoint(point, drag, spot)) this.deps.refresh()
  }

  private movePoint(point: PointObject, drag: Drag, spot: ScreenPoint): boolean {
    const { projector } = this.deps
    const ray = projector.ray(spot)
    switch (drag.mode) {
      case 'horizontal': {
        const ground = planePoint(projector, spot, drag.height)
        if (!ground) return false
        point.position = { ...add(ground, drag.offset), y: drag.height }
        return true
      }
      case 'vertical': {
        const along = closestOnLineToRay(point.position, UP, ray)
        if (along === null) return false
        point.position = { ...point.position, y: point.position.y + along }
        return true
      }
      case 'on': {
        const constraint = point.constraint
        if (constraint?.type !== 'on') return false
        const shape = this.deps.shapes().get(constraint.ownerId)
        const params = shape ? partsOf(shape)[constraint.part]?.fromRay(ray) : null
        if (!params) return false
        constraint.params = params
        return true
      }
      case 'height': {
        const owner = point.constraint ? this.deps.document.get(point.constraint.ownerId) : undefined
        const shape = owner ? this.deps.shapes().get(owner.id) : undefined
        if (!isSolid(owner) || !shape || (shape.kind !== 'polyhedron' && shape.kind !== 'round')) return false
        const [base, axis] = shape.kind === 'polyhedron' ? [shape.heightStart, shape.normal] : [shape.baseCenter, shape.axis]
        const along = closestOnLineToRay(base, axis, ray)
        if (along === null) return false
        owner.height = Math.max(MIN_HEIGHT, along)
        return true
      }
    }
  }

  pointerUp(): void {
    const drag = this.drag
    if (!drag) return
    this.drag = null
    // A click without movement commits nothing and keeps the selection.
    this.deps.document.commitEdit()
    if (!drag.moved && drag.mode !== 'on' && drag.mode !== 'height') {
      const now = performance.now()
      if (this.lastTap?.id === drag.pointId && now - this.lastTap.time < DOUBLE_TAP_MS) {
        this.verticalPointId = this.verticalPointId === drag.pointId ? null : drag.pointId
        this.lastTap = null
      } else {
        this.lastTap = { id: drag.pointId, time: now }
      }
    }
    this.deps.refresh()
  }

  /** Escape or a second finger: put the dragged point back. */
  cancelDrag(): boolean {
    if (!this.drag) return false
    this.drag = null
    this.deps.document.cancelEdit()
    this.deps.refresh()
    return true
  }

  /** Directions the selected point can be dragged in, for the arrows. */
  arrows(): { origin: Vec3; directions: Vec3[] } | null {
    const point = this.selectedPoint()
    if (!point || point.hidden || point.geometryValid === false) return null
    const constraint = point.constraint
    if (!constraint) {
      return { origin: point.position, directions: this.verticalPointId === point.id ? [UP] : [X_AXIS, Z_AXIS] }
    }
    const shape = this.deps.shapes().get(constraint.ownerId)
    if (!shape) return null
    if (constraint.type === 'on') {
      const part = partsOf(shape)[constraint.part]
      return part ? { origin: point.position, directions: part.tangents(constraint.params) } : null
    }
    if (constraint.type === 'height') {
      if (shape.kind === 'polyhedron') return { origin: point.position, directions: [shape.normal] }
      if (shape.kind === 'round') return { origin: point.position, directions: [shape.axis] }
    }
    return null
  }
}
