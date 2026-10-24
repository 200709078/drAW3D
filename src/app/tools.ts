import {
  POINTS_NEEDED, acceptsPoint, adoptCreatedPoints, buildConstruction, createContext, createPoint, type ConstructionKind,
} from '../document/constructions'
import { resolveDocument, type ShapeMap } from '../document/dependencies'
import type { GeometryDocument } from '../document/geometry-document'
import {
  angleShape, initialSidePoint, lineShape, planeShape, polyhedronShape, roundShape, sphereShape, type Shape,
} from '../geometry/solids'
import { DEFAULT_SIDES, isPoint, type ObjectId, type PointObject } from '../geometry/types'
import { distance, type Vec3 } from '../geometry/vec3'
import type { Preview } from '../rendering/scene-sync'
import type { ToolAction } from '../ui/tool-registry'
import type { Projector, ScreenPoint } from './camera-state'
import { hitPart, hitTolerance, nearestPoint, planePoint, type PartHit, type PointerKind } from './hit-test'

export type { ToolAction }

export interface ToolDependencies {
  document: GeometryDocument
  projector: Projector
  shapes(): ShapeMap
  /** Resolve the document and redraw. */
  refresh(): void
  /** A point was picked or created: show it selected. */
  selectPoint(id: ObjectId): void
  /** The tool's work is done: return to the select tool (keeping the selection if asked). */
  finished(keepSelection: boolean): void
}

type Pick =
  | { kind: 'existing'; point: PointObject }
  | { kind: 'on'; hit: PartHit }
  | { kind: 'ground'; position: Vec3 }

function pickPosition(pick: Pick): Vec3 {
  return pick.kind === 'existing' ? pick.point.position : pick.kind === 'on' ? pick.hit.position : pick.position
}

/**
 * Construction tools: picked points are staged (new ones as document drafts) and the final
 * object is built through `buildConstruction`, so validation and naming are shared. Mouse
 * and pen act on press; a touch aims (the preview follows the finger) and acts on release.
 */
export class ToolController {
  sides = DEFAULT_SIDES
  private current: ToolAction = 'select'
  private staged: ObjectId[] = []
  private created: ObjectId[] = []
  private hover: { spot: ScreenPoint; kind: PointerKind } | null = null
  private aiming: PointerKind | null = null

  constructor(private deps: ToolDependencies) {}

  get action(): ToolAction { return this.current }
  get stagedCount(): number { return this.staged.length }

  setTool(action: ToolAction): void {
    this.cancel()
    this.current = action
    this.hover = null
  }

  /** Escape: drop the half-finished construction and its new points. */
  cancel(): boolean {
    const hadWork = this.staged.length > 0 || this.aiming !== null
    this.deps.document.cancelDraft()
    this.staged = []
    this.created = []
    this.aiming = null
    return hadWork
  }

  pointerDown(spot: ScreenPoint, kind: PointerKind): void {
    this.hover = { spot, kind }
    if (kind === 'touch') {
      this.aiming = kind
      return
    }
    this.act(spot, kind)
  }

  pointerMove(spot: ScreenPoint, kind: PointerKind): void {
    // A touch shows a preview only while the finger is down.
    if (kind === 'touch' && this.aiming === null) return
    this.hover = { spot, kind }
  }

  pointerUp(spot: ScreenPoint, kind: PointerKind): void {
    if (this.aiming === null) return
    this.aiming = null
    this.hover = null
    this.act(spot, kind)
  }

  /** A second finger: the gesture is a camera move, not a click. */
  abortGesture(): void {
    this.aiming = null
    this.hover = null
  }

  leave(): void {
    if (this.aiming === null) this.hover = null
  }

  private pick(spot: ScreenPoint, kind: PointerKind): Pick | null {
    const { document, projector } = this.deps
    const tolerance = hitTolerance(kind)
    const point = nearestPoint(document.objects, projector, spot, tolerance)
    if (point) return { kind: 'existing', point }
    const hit = hitPart(document.objects, this.deps.shapes(), projector, spot, tolerance)
    if (hit) return { kind: 'on', hit }
    const position = planePoint(projector, spot)
    return position ? { kind: 'ground', position } : null
  }

  private newPoint(pick: Exclude<Pick, { kind: 'existing' }>): PointObject {
    const { document } = this.deps
    const context = createContext(document.objects, () => document.allocateId())
    if (pick.kind === 'ground') return createPoint(context, pick.position)
    const { ownerId, part, params, position } = pick.hit
    return createPoint(context, position, { type: 'on', ownerId, part, params })
  }

  private act(spot: ScreenPoint, kind: PointerKind): void {
    if (this.current === 'select') return
    const pick = this.pick(spot, kind)
    if (!pick) return
    const { document } = this.deps
    if (this.current === 'point') {
      if (pick.kind === 'existing') {
        this.deps.selectPoint(pick.point.id)
        this.deps.finished(true)
        return
      }
      document.append(this.newPoint(pick))
      resolveDocument(document.objects)
      document.commit()
      this.deps.refresh()
      return
    }
    const construction = this.current
    const previous = this.stagedPositions()
    if (!acceptsPoint(construction, previous, pickPosition(pick))) return
    let id: ObjectId
    if (pick.kind === 'existing') {
      id = pick.point.id
      this.deps.selectPoint(id)
    } else {
      const point = this.newPoint(pick)
      document.append(point)
      document.trackDraft(point.id)
      this.created.push(point.id)
      id = point.id
    }
    this.staged.push(id)
    if (this.staged.length < POINTS_NEEDED[construction]) {
      this.deps.refresh()
      return
    }
    this.build(construction)
  }

  private stagedPositions(): Vec3[] {
    return this.staged.map(id => {
      const point = this.deps.document.get(id)
      return isPoint(point) ? point.position : { x: NaN, y: NaN, z: NaN }
    })
  }

  private build(construction: ConstructionKind): void {
    const { document } = this.deps
    const points = this.staged.map(id => document.get(id)).filter(isPoint)
    const created = this.created.map(id => document.get(id)).filter(isPoint)
    const context = createContext(document.objects, () => document.allocateId())
    const objects = buildConstruction(context, construction, points, { sides: this.sides })
    adoptCreatedPoints(objects, created)
    document.finishDraft()
    document.append(...objects)
    resolveDocument(document.objects)
    document.commit()
    this.staged = []
    this.created = []
    this.deps.finished(false)
  }

  /** The cursor point and the object the next click would finish. */
  preview(): Preview | null {
    if (this.current === 'select' || !this.hover) return null
    const pick = this.pick(this.hover.spot, this.hover.kind)
    if (!pick) return null
    const cursor = pickPosition(pick)
    const shown = this.hover.kind === 'touch' || pick.kind !== 'existing' ? cursor : null
    if (this.current === 'point') return { cursor: shown, shape: null }
    return { cursor: shown, shape: previewShape(this.current, [...this.stagedPositions(), cursor], this.sides) }
  }
}

/** The shape a construction would have; with fewer points, the line drawn so far. */
export function previewShape(kind: ConstructionKind, points: readonly Vec3[], sides: number): Shape | null {
  const [a, b, c] = points
  if (!a || !b || distance(a, b) < 1e-9) return null
  if (POINTS_NEEDED[kind] === 3 && !c) return lineShape('segment', a, b)
  switch (kind) {
    case 'line':
    case 'segment':
    case 'ray':
      return lineShape(kind, a, b)
    case 'plane':
      return planeShape(a, b, c!)
    case 'angle':
      return angleShape(a, b, c!)
    case 'sphere':
      return sphereShape(a, b)
    case 'prism':
    case 'pyramid':
      return polyhedronShape(kind, a, b, initialSidePoint(a, b), sides, distance(a, b))
    case 'cylinder':
    case 'cone':
      return roundShape(kind, a, b, 2 * distance(a, b))
  }
}
