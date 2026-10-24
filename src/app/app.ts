import * as THREE from 'three'
import { createContext } from '../document/constructions'
import { resolveDocument, type ShapeMap } from '../document/dependencies'
import {
  canDelete, deleteObject, hasHidden, hideObject, selectionTarget, setSideCount, showAll, solidOf,
} from '../document/editing'
import { GeometryDocument } from '../document/geometry-document'
import { maxUnfoldAngle } from '../geometry/solids'
import { isPoint, isPolyhedron, type GeometryObject, type ObjectId } from '../geometry/types'
import type { Vec3 } from '../geometry/vec3'
import { createEnvironment, NEXT_GROUND_MODE, type GroundMode } from '../rendering/environment'
import { createFrameRenderer } from '../rendering/frame-renderer'
import { LabelLayer } from '../rendering/labels'
import { MaterialCache } from '../rendering/materials'
import { createRenderer } from '../rendering/renderer'
import { SceneSync } from '../rendering/scene-sync'
import { createToolbar, type ToolbarApi } from '../ui/main-toolbar'
import { createObjectControls } from '../ui/object-controls'
import { createToast } from '../ui/toast'
import type { ToolAction } from '../ui/tool-registry'
import { CameraState, type ScreenPoint } from './camera-state'
import { hitTolerance, nearestPoint, type PointerKind } from './hit-test'
import { SelectController } from './select-tool'
import { ToolController } from './tools'

const GROUND_TOGGLE: Readonly<Record<GroundMode, { icon: string; title: string }>> = {
  showBoth: { icon: 'grid.svg', title: 'Düzlemi Gizle' },
  hidePlane: { icon: 'blank.svg', title: 'Izgarayı Gizle' },
  hideBoth: { icon: 'plane.svg', title: 'Düzlemi ve Izgarayı Göster' },
}

declare global {
  interface Window {
    /** Read-only test hook: the document and the world → page mapping. */
    drAW3DApp?: {
      objects(): GeometryObject[]
      selectedId(): ObjectId | null
      toPage(point: Vec3): { x: number; y: number } | null
      frames(): number
      groundMode(): GroundMode
    }
  }
}

function pointerKind(event: PointerEvent): PointerKind {
  return event.pointerType === 'touch' || event.pointerType === 'pen' ? event.pointerType : 'mouse'
}

function button(id: string): HTMLButtonElement {
  return document.getElementById(id) as HTMLButtonElement
}

export function startApp(): void {
  const canvas = document.getElementById('scene') as HTMLCanvasElement
  const viewport = document.getElementById('viewport')!
  const renderer = createRenderer(canvas)
  if (!renderer) return

  const scene = new THREE.Scene()
  const environment = createEnvironment(scene)
  const camera = new CameraState(canvas)
  const labels = new LabelLayer(document.getElementById('sceneLabels')!)
  const sync = new SceneSync(scene, new MaterialCache(), labels)
  const doc = new GeometryDocument()
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const showToast = createToast()
  let shapes: ShapeMap = new Map()
  let groundMode: GroundMode = 'showBoth'
  let frames = 0

  const frame = createFrameRenderer(() => {
    const moving = camera.update()
    sync.arrows.scaleFor(camera.camera)
    renderer.render(scene, camera.camera)
    labels.layout(point => camera.toScreen(point))
    frames++
    // Damping keeps the camera gliding after release; draw until it settles.
    if (moving) frame.request()
  })
  camera.controls.addEventListener('change', () => frame.request())

  const select = new SelectController({ document: doc, projector: camera, shapes: () => shapes, refresh })
  const tools = new ToolController({
    document: doc, projector: camera, shapes: () => shapes, refresh,
    selectPoint: id => { doc.activeId = id },
    finished: keepSelection => {
      if (!keepSelection) doc.activeId = null
      toolbar.select('select', { showToast: false })
    },
  })

  const objectControls = createObjectControls({
    onSides(value) {
      if (tools.action === 'prism' || tools.action === 'pyramid') {
        tools.sides = value
        refresh()
        return
      }
      const solid = solidOf(doc, doc.activeId)
      if (!isPolyhedron(solid)) return
      if (!doc.isEditing) doc.beginEdit()
      setSideCount(doc, createContext(doc.objects, () => doc.allocateId()), solid.id, value)
      refresh()
    },
    onUnfold(value) {
      const solid = solidOf(doc, doc.activeId)
      if (!solid) return
      if (!doc.isEditing) doc.beginEdit()
      solid.unfold = value
      refresh()
    },
    onCommit() {
      if (doc.commitEdit()) refresh()
    },
  })

  function controlsState() {
    if (tools.action === 'prism' || tools.action === 'pyramid') return { sides: tools.sides, unfold: null }
    if (tools.action !== 'select') return { sides: null, unfold: null }
    const solid = solidOf(doc, doc.activeId)
    const shape = solid ? shapes.get(solid.id) : undefined
    if (!solid || !shape || (shape.kind !== 'polyhedron' && shape.kind !== 'round') || solid.geometryValid === false) {
      return { sides: null, unfold: null }
    }
    return {
      sides: isPolyhedron(solid) ? solid.sideCount : null,
      unfold: { value: solid.unfold, max: maxUnfoldAngle(shape) },
    }
  }

  function updateActions(): void {
    const selected = doc.get(doc.activeId)
    const undo = button('undo')
    const redo = button('redo')
    undo.disabled = !doc.canUndo
    redo.disabled = !doc.canRedo
    const remove = button('delete')
    remove.disabled = !canDelete(selected)
    remove.title = remove.disabled
      ? selected ? 'Bu nokta bir cismin parçası; cismi seçip siliniz' : 'Silinecek nesne seçilmedi'
      : 'Sil'
    const hide = button('hide')
    hide.disabled = !selected || Boolean(selected.hidden)
    hide.title = hide.disabled ? 'Gizlenecek nesne seçilmedi' : 'Gizle'
    const show = button('showAll')
    show.disabled = !hasHidden(doc)
    show.title = show.disabled ? 'Gizli nesne yok' : 'Tümünü Göster'
    const toggle = GROUND_TOGGLE[groundMode]
    const ground = button('groundToggle')
    ground.title = toggle.title
    ground.setAttribute('aria-label', toggle.title)
    ;(ground.querySelector('img') as HTMLImageElement).src = `./img/${toggle.icon}`
  }

  function refreshPreview(): void {
    sync.setPreview(tools.preview())
    frame.request()
  }

  function refresh(): void {
    shapes = resolveDocument(doc.objects)
    sync.update({
      objects: doc.objects, shapes, selectedId: doc.activeId, coarse,
      arrows: tools.action === 'select' ? select.arrows() : null,
    })
    sync.setPreview(tools.preview())
    objectControls.show(controlsState())
    updateActions()
    frame.request()
  }

  /** Leave every gesture and half-finished construction before history or tool changes. */
  function settle(): void {
    select.cancelDrag()
    tools.cancel()
  }

  const toolbar: ToolbarApi = createToolbar({
    groups: document.getElementById('toolGroups')!,
    currentTool: button('currentTool'),
    panel: document.getElementById('toolsPanel')!,
    onChange(tool, announce) {
      select.cancelDrag()
      tools.setTool(tool.action as ToolAction)
      document.getElementById('toolsSheet')!.hidden = true
      if (tool.action !== 'select') doc.activeId = null
      if (announce) showToast(tool.label, tool.instruction)
      refresh()
    },
    onOpenTools() {
      const sheet = document.getElementById('toolsSheet')!
      sheet.hidden = !sheet.hidden
    },
  })

  function undo(): void {
    settle()
    if (doc.undo()) refresh()
  }
  function redo(): void {
    settle()
    if (doc.redo()) refresh()
  }
  function removeSelected(): void {
    const id = doc.activeId
    if (id === null || !deleteObject(doc, id)) return
    doc.activeId = null
    resolveDocument(doc.objects)
    doc.commit()
    refresh()
  }

  button('undo').addEventListener('click', undo)
  button('redo').addEventListener('click', redo)
  button('delete').addEventListener('click', removeSelected)
  button('hide').addEventListener('click', () => {
    const id = doc.activeId
    if (id === null || !hideObject(doc, id)) return
    doc.activeId = null
    doc.commit()
    refresh()
  })
  button('showAll').addEventListener('click', () => {
    if (!showAll(doc)) return
    doc.commit()
    refresh()
  })
  button('groundToggle').addEventListener('click', () => {
    groundMode = NEXT_GROUND_MODE[groundMode]
    environment.setGroundMode(groundMode)
    refresh()
  })
  button('standardView').addEventListener('click', () => {
    camera.standardView()
    frame.request()
  })

  // Pointer input. The camera (OrbitControls) listens on the same canvas; a capture listener
  // runs first and decides whether one finger or the left button may turn the camera.
  const pointers = new Set<number>()
  const local = (event: PointerEvent): ScreenPoint => {
    const rect = canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }
  const allowCamera = (allow: boolean) => {
    camera.controls.mouseButtons.LEFT = allow ? THREE.MOUSE.ROTATE : null
    camera.controls.touches.ONE = allow ? THREE.TOUCH.ROTATE : null
  }
  canvas.addEventListener('pointerdown', event => {
    document.getElementById('toolsSheet')!.hidden = true
    pointers.add(event.pointerId)
    if (pointers.size > 1) {
      // A second finger turns the gesture into a camera pinch.
      tools.abortGesture()
      select.cancelDrag()
      refreshPreview()
      return
    }
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const spot = local(event)
    const kind = pointerKind(event)
    if (tools.action !== 'select') {
      allowCamera(false)
      tools.pointerDown(spot, kind)
      refresh()
      return
    }
    allowCamera(!select.pointerDown(spot, kind))
  }, { capture: true })

  canvas.addEventListener('pointermove', event => {
    if (pointers.size > 1) return
    const spot = local(event)
    if (select.dragging) {
      select.pointerMove(spot)
      return
    }
    if (tools.action !== 'select') {
      tools.pointerMove(spot, pointerKind(event))
      refreshPreview()
      return
    }
    if (event.pointerType === 'mouse' && pointers.size === 0) {
      const hovered = nearestPoint(doc.objects, camera, spot, hitTolerance('mouse'))
      canvas.style.cursor = hovered ? 'pointer' : ''
    }
  })

  const release = (event: PointerEvent, cancelled: boolean) => {
    if (!pointers.delete(event.pointerId)) return
    if (pointers.size === 0) allowCamera(true)
    if (cancelled) {
      tools.abortGesture()
      select.cancelDrag()
      refreshPreview()
      return
    }
    if (select.dragging) select.pointerUp()
    else if (tools.action !== 'select') {
      tools.pointerUp(local(event), pointerKind(event))
      refresh()
    }
  }
  window.addEventListener('pointerup', event => release(event, false))
  window.addEventListener('pointercancel', event => release(event, true))
  canvas.addEventListener('pointerleave', () => {
    tools.leave()
    refreshPreview()
  })

  window.addEventListener('keydown', event => {
    const target = event.target as HTMLElement | null
    const typing = target?.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'range'
    if (typing) return
    const key = event.key.toLowerCase()
    if ((event.ctrlKey || event.metaKey) && key === 'z') {
      event.preventDefault()
      if (event.shiftKey) redo()
      else undo()
      return
    }
    if ((event.ctrlKey || event.metaKey) && key === 'y') {
      event.preventDefault()
      redo()
      return
    }
    if (event.key === 'Escape') {
      if (select.cancelDrag()) return
      tools.cancel()
      toolbar.select('select', { showToast: false })
      return
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && target?.tagName !== 'INPUT') {
      event.preventDefault()
      removeSelected()
    }
  })

  const resize = () => {
    const { width, height } = viewport.getBoundingClientRect()
    renderer.setSize(width, height, false)
    camera.resize(width, height)
    frame.request()
  }
  new ResizeObserver(resize).observe(viewport)
  resize()

  window.drAW3DApp = {
    objects: () => structuredClone(doc.objects as GeometryObject[]),
    selectedId: () => {
      const selected = doc.activeId === null ? undefined : doc.get(doc.activeId)
      return selected ? (isPoint(selected) ? selected.id : selectionTarget(doc, selected.id)?.id ?? null) : null
    },
    toPage: point => {
      const screen = camera.toScreen(point)
      if (!screen) return null
      const rect = canvas.getBoundingClientRect()
      return { x: rect.left + screen.x, y: rect.top + screen.y }
    },
    frames: () => frames,
    groundMode: () => groundMode,
  }
  refresh()
}
