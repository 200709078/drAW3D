import * as THREE from 'three'
import { createContext } from '../document/constructions'
import { releaseField, setParameterRange } from '../document/definitions'
import { collectOwned, type ShapeMap } from '../document/dependencies'
import {
  canDelete, deleteObject, hasHidden, hideObject, resolveAll, selectionTarget, setSideCount, showAll, solidOf,
} from '../document/editing'
import {
  DEFAULT_FILE_NAME, FILE_EXTENSION, parseDocument, serializeDocument, type DocumentFile,
} from '../document/file-format'
import { GeometryDocument } from '../document/geometry-document'
import { redefineObject } from '../document/redefine'
import { submitCommand } from '../document/submit'
import { flatNet } from '../geometry/net-sheet'
import { maxUnfoldAngle } from '../geometry/unfold'
import { isPoint, isPolyhedron, isUnfoldable, type GeometryObject, type ObjectId } from '../geometry/types'
import type { Vec3 } from '../geometry/vec3'
import { DISPLAY_NAMES, detectDisplay, displayProfile, type DeviceInfo, type DisplayProfile } from '../rendering/display'
import { createEnvironment, NEXT_GROUND_MODE, type GroundMode } from '../rendering/environment'
import { createFrameRenderer } from '../rendering/frame-renderer'
import { LabelLayer } from '../rendering/labels'
import { netSvg, printPage } from '../rendering/net-svg'
import { MaterialCache } from '../rendering/materials'
import { createRenderer } from '../rendering/renderer'
import { SceneSync } from '../rendering/scene-sync'
import type { ViewOptions } from '../rendering/view-options'
import { bindCommandInput } from '../ui/command-input'
import { bindCommandTemplates } from '../ui/command-templates'
import { createFileMenu } from '../ui/file-menu'
import { createHelpPopup } from '../ui/help-popup'
import { createToolbar, type ToolbarApi } from '../ui/main-toolbar'
import { createMathKeyboard } from '../ui/math-keyboard'
import { createObjectControls } from '../ui/object-controls'
import { ObjectPanel, type PanelEntry } from '../ui/object-panel'
import { createSidePanel, NARROW_LAYOUT_QUERY } from '../ui/side-panel'
import { createToast } from '../ui/toast'
import { createViewMenu, loadViewOptions } from '../ui/view-menu'
import type { ToolAction } from '../ui/tool-registry'
import { CameraState, type ScreenPoint } from './camera-state'
import { hitTolerance, nearestPoint, type PointerKind } from './hit-test'
import {
  canSavePdf, exportFile, openDocumentFile, printHtml, readHandedFile, saveDocumentFile, savePdf,
  type FileTarget, type OpenedFile,
} from './files'
import { bindAndroid } from './native'
import { applyStyle, describeCard, editText, styleSpec, type CardContext } from './object-cards'
import { SelectController } from './select-tool'
import { ToolController } from './tools'

const AUTOSAVE_KEY = 'drAW3D.autosave'
const BOARD_HINT_KEY = 'drAW3D.boardHint'
const AUTOSAVE_DELAY = 1000

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
      view(): ViewOptions & { cameraOrthographic: boolean }
      fileName(): string | null
      display(): DisplayProfile
    }
  }
}

function pointerKind(event: PointerEvent): PointerKind {
  return event.pointerType === 'touch' || event.pointerType === 'pen' ? event.pointerType : 'mouse'
}

function deviceInfo(): DeviceInfo {
  const { width, height } = window.screen
  return {
    coarse: window.matchMedia('(pointer: coarse)').matches,
    shortSide: Math.min(width, height), longSide: Math.max(width, height),
    devicePixelRatio: window.devicePixelRatio,
  }
}

function button(id: string): HTMLButtonElement {
  return document.getElementById(id) as HTMLButtonElement
}

export function startApp(): void {
  const canvas = document.getElementById('scene') as HTMLCanvasElement
  const viewport = document.getElementById('viewport')!
  const toolbarElement = document.getElementById('mainToolbar')!
  const renderer = createRenderer(canvas)
  if (!renderer) return

  const scene = new THREE.Scene()
  const labels = new LabelLayer(document.getElementById('sceneLabels')!)
  const axisLabels = new LabelLayer(document.getElementById('sceneLabels')!)
  const environment = createEnvironment(scene, axisLabels)
  const camera = new CameraState(canvas)
  let viewOptions: ViewOptions = loadViewOptions()
  camera.setOrthographic(viewOptions.orthographic)
  environment.setAxes(viewOptions.axes)
  const materials = new MaterialCache()
  const sync = new SceneSync(scene, materials, labels)
  const doc = new GeometryDocument()
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const narrow = window.matchMedia(NARROW_LAYOUT_QUERY)
  const showToast = createToast()
  let shapes: ShapeMap = new Map()
  let groundMode: GroundMode = 'showBoth'
  let frames = 0
  let profile = displayProfile(viewOptions.display, deviceInfo())

  /**
   * Apply the screen's profile (roadmap Y10): sharpness, shadows, edge width and the size of
   * the interface. The interface grows with CSS zoom on the page; positions on the canvas
   * stay in on-screen pixels, labels are placed in the page's layout pixels.
   */
  function applyDisplay(): void {
    profile = displayProfile(viewOptions.display, deviceInfo())
    document.documentElement.style.zoom = profile.uiScale === 1 ? '' : String(profile.uiScale)
    document.documentElement.dataset.display = profile.kind
    renderer!.setPixelRatio(profile.pixelRatio)
    materials.setLineWidth(profile.edgeWidth / profile.pixelRatio)
    environment.setShadowSize(profile.shadowMapSize)
  }
  applyDisplay()
  const toLabel = (point: Vec3) => {
    const screen = camera.toScreen(point)
    return screen && { x: screen.x / profile.uiScale, y: screen.y / profile.uiScale }
  }
  const tolerance = (kind: PointerKind) => hitTolerance(kind) * profile.uiScale

  const frame = createFrameRenderer(() => {
    const moving = camera.update()
    sync.arrows.scaleFor(point => camera.pixelSize(point), profile.sceneScale)
    sync.setViewer(camera.eye())
    renderer.render(scene, camera.camera)
    labels.layout(toLabel)
    axisLabels.layout(toLabel)
    frames++
    // Damping keeps the camera gliding after release; draw until it settles.
    if (moving) frame.request()
  })
  camera.controls.addEventListener('change', () => frame.request())

  const select = new SelectController({ document: doc, projector: camera, shapes: () => shapes, refresh, tolerance })
  const tools = new ToolController({
    document: doc, projector: camera, shapes: () => shapes, refresh, tolerance,
    selectPoint: id => { doc.activeId = id },
    finished: keepSelection => {
      if (!keepSelection) doc.activeId = null
      toolbar.select('select', { showToast: false })
    },
    report: message => showToast('Araç', message),
  })

  const context = (): CardContext => ({ objects: doc.objects, shapes })

  /** Edits from sliders and settings are one history step, committed on release. */
  function beginEdit(): void {
    if (!doc.isEditing) doc.beginEdit()
  }

  function commitEdit(): void {
    if (!doc.isEditing) return
    shapes = resolveAll(doc)
    doc.commitEdit()
  }

  function commit(): void {
    shapes = resolveAll(doc)
    doc.commit()
  }

  function setSides(id: ObjectId, value: number): void {
    const solid = doc.get(id)
    if (!isPolyhedron(solid)) return
    beginEdit()
    releaseField(solid, 'sideCount')
    setSideCount(doc, createContext(doc.objects, () => doc.allocateId()), id, value)
  }

  function setTopRatio(id: ObjectId, value: number): void {
    const solid = doc.get(id)
    if ((solid?.type !== 'pyramid' && solid?.type !== 'cone') || solid.topRatio === undefined) return
    beginEdit()
    releaseField(solid, 'topRatio')
    solid.topRatio = Math.min(0.95, Math.max(0.05, value))
  }

  function setNet(id: ObjectId, value: number): void {
    const solid = doc.get(id)
    if (solid?.type !== 'regular' || solid.solid !== 'cube') return
    beginEdit()
    solid.net = Math.min(10, Math.max(0, Math.round(value) - 1))
  }

  // --- Playing a net: it opens (or closes) by itself, one history step ---------------
  const UNFOLD_SPEED = 60
  const animations = new Map<ObjectId, 1 | -1>()
  let animationFrame: number | null = null
  let lastFrameTime: number | null = null

  function toggleAnimation(id: ObjectId): void {
    if (animations.has(id)) {
      stopAnimation(id)
      return
    }
    const solid = doc.get(id)
    const shape = solid ? shapes.get(id) : undefined
    if (!isUnfoldable(solid) || !shape || (shape.kind !== 'polyhedron' && shape.kind !== 'round')) return
    beginEdit()
    animations.set(id, solid.unfold >= maxUnfoldAngle(shape) - 1e-6 ? -1 : 1)
    if (animationFrame === null) animationFrame = requestAnimationFrame(animate)
    refresh()
  }

  function stopAnimation(id: ObjectId): void {
    if (!animations.delete(id)) return
    if (animations.size === 0) commitEdit()
    refresh()
  }

  function animate(time: number): void {
    animationFrame = null
    const elapsed = lastFrameTime === null ? 0 : Math.min(100, time - lastFrameTime) / 1000
    lastFrameTime = time
    for (const [id, direction] of [...animations]) {
      const solid = doc.get(id)
      const shape = solid ? shapes.get(id) : undefined
      if (!isUnfoldable(solid) || !shape || (shape.kind !== 'polyhedron' && shape.kind !== 'round')) {
        animations.delete(id)
        continue
      }
      const max = maxUnfoldAngle(shape)
      releaseField(solid, 'unfold')
      solid.unfold = Math.min(max, Math.max(0, solid.unfold + direction * UNFOLD_SPEED * elapsed))
      if ((direction > 0 && solid.unfold >= max) || (direction < 0 && solid.unfold <= 0)) animations.delete(id)
    }
    if (animations.size === 0) {
      lastFrameTime = null
      commitEdit()
    } else {
      animationFrame = requestAnimationFrame(animate)
    }
    refresh()
  }

  function setUnfold(id: ObjectId, value: number): void {
    const solid = doc.get(id)
    if (!isUnfoldable(solid)) return
    beginEdit()
    releaseField(solid, 'unfold')
    solid.unfold = value
  }

  const objectControls = createObjectControls({
    onSides(value) {
      if (tools.action === 'prism' || tools.action === 'pyramid') {
        tools.sides = value
        refresh()
        return
      }
      const solid = solidOf(doc, doc.activeId)
      if (solid) setSides(solid.id, value)
      refresh()
    },
    onUnfold(value) {
      const solid = solidOf(doc, doc.activeId)
      if (solid) setUnfold(solid.id, value)
      refresh()
    },
    onCommit() {
      commitEdit()
      refresh()
    },
    onPlay() {
      const solid = solidOf(doc, doc.activeId)
      if (solid) toggleAnimation(solid.id)
    },
  })

  /**
   * The floating sliders: the side count of the next prism while its tool is active, and
   * the selected solid's sliders while the panel (where its card has them) is hidden.
   */
  function controlsState() {
    if (tools.action === 'prism' || tools.action === 'pyramid') return { sides: tools.sides, unfold: null }
    if (tools.action !== 'select' || !sidePanel.isHidden) return { sides: null, unfold: null }
    const solid = solidOf(doc, doc.activeId)
    const shape = solid ? shapes.get(solid.id) : undefined
    if (!solid || !shape || (shape.kind !== 'polyhedron' && shape.kind !== 'round') || solid.geometryValid === false) {
      return { sides: null, unfold: null }
    }
    return {
      sides: isPolyhedron(solid) ? solid.sideCount : null,
      unfold: { value: solid.unfold, max: maxUnfoldAngle(shape) },
      playing: animations.has(solid.id),
    }
  }

  function updateActions(): void {
    const selected = doc.get(doc.activeId)
    button('undo').disabled = !doc.canUndo
    button('redo').disabled = !doc.canRedo
    const remove = button('delete')
    remove.disabled = !canDelete(selected)
    remove.title = remove.disabled
      ? selected ? 'Bu nokta bir cismin parçası; cismi seçip siliniz' : 'Silinecek nesne seçilmedi'
      : 'Sil'
    const hide = button('hide')
    hide.disabled = !selected || Boolean(selected.hidden) || selected.type === 'parameter'
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

  /** The card that shows the selection: a helper's owner, or the object itself. */
  function activeCardId(): ObjectId | null {
    const selected = doc.get(doc.activeId)
    if (!selected) return null
    let current: GeometryObject | undefined = selected
    while (current && current.ownerId !== undefined) current = doc.get(current.ownerId)
    return current?.id ?? null
  }

  function panelEntries(): PanelEntry[] {
    const cards = context()
    return doc.objects.filter(object => object.ownerId === undefined).reverse().map(object => ({
      id: object.id, color: object.color, visible: !object.hidden,
      card: describeCard(object, cards), editText: editText(object, cards), style: styleSpec(object, viewOptions.labels),
      animating: animations.has(object.id),
    }))
  }

  function refreshPreview(): void {
    sync.setPreview(tools.preview())
    frame.request()
  }

  function refresh(): void {
    shapes = resolveAll(doc)
    sync.update({
      objects: doc.objects, shapes, selectedId: doc.activeId, coarse, scale: profile.sceneScale,
      arrows: tools.action === 'select' ? select.arrows() : null, view: viewOptions,
    })
    sync.setPreview(tools.preview())
    panel.render(panelEntries(), activeCardId())
    objectControls.show(controlsState())
    updateActions()
    frame.request()
    scheduleAutosave()
  }

  /** Leave every gesture and half-finished construction before history or tool changes. */
  function settle(): void {
    animations.clear()
    select.cancelDrag()
    tools.cancel()
    commitEdit()
  }

  function selectObject(id: ObjectId): void {
    settle()
    if (tools.action !== 'select') toolbar.select('select', { showToast: false })
    doc.activeId = id
    refresh()
  }

  const panel = new ObjectPanel(document.getElementById('objectsContainer')!, {
    select: selectObject,
    toggleVisibility(id) {
      settle()
      const object = doc.get(id)
      if (!object) return
      if (object.hidden) {
        for (const objectId of [id, ...collectOwned(doc.objects, [id])]) delete doc.get(objectId)!.hidden
      } else {
        hideObject(doc, id)
      }
      commit()
      refresh()
    },
    remove(id) {
      settle()
      if (!deleteObject(doc, id)) {
        showToast('Sil', 'Bu nesne tek başına silinemez.')
        return
      }
      if (doc.activeId === id) doc.activeId = null
      commit()
      refresh()
    },
    sliderStart: beginEdit,
    sliderInput(id, values) {
      const object = doc.get(id)
      if (!object) return
      const { sliders } = describeCard(object, context())
      sliders.forEach((spec, index) => {
        const value = values[index]
        if (value === undefined || !Number.isFinite(value) || value === spec.value) return
        if (spec.field === 'sideCount') setSides(id, value)
        else if (spec.field === 'unfold') setUnfold(id, value)
        else if (spec.field === 'topRatio') setTopRatio(id, value)
        else if (spec.field === 'net') setNet(id, value)
        else if (object.type === 'parameter' && !object.definition) {
          beginEdit()
          object.value = value
        }
      })
      refresh()
    },
    sliderCommit() {
      commitEdit()
      refresh()
    },
    toggleAnimation,
    parameterRange(id, min, max, step) {
      const parameter = doc.get(id)
      if (parameter?.type !== 'parameter') return
      settle()
      const result = setParameterRange(parameter, min, max, step)
      if (result.ok) commit()
      else showToast('Kaydırıcı', result.error)
      refresh()
    },
    redefine(id, text) {
      const target = doc.get(id)
      if (!target) return true
      settle()
      const result = redefineObject(doc, shapes, target, text)
      if (!result.ok) {
        showToast('Düzenle', result.error)
        return false
      }
      doc.activeId = id
      commit()
      refresh()
      return true
    },
    styleInput(id, patch) {
      const object = doc.get(id)
      if (!object) return
      beginEdit()
      if (applyStyle(object, patch, viewOptions.labels)) refresh()
    },
    styleCommit() {
      commitEdit()
      refresh()
    },
  })

  function submit(source: string): void {
    settle()
    if (tools.action !== 'select') toolbar.select('select', { showToast: false })
    const result = submitCommand(doc, source)
    if (!result.ok) {
      showToast('Giriş', result.error)
      return
    }
    refresh()
    panel.reveal(result.activeId)
  }

  // --- Documents: .drw3 files, the autosave and exports ------------------------------
  let fileName: string | null = null
  let fileTarget: FileTarget | null = null
  let autosaveTimer: number | null = null
  let autosaved = ''

  function documentText(): string {
    const objects = doc.objects.filter(object => !doc.isDraft(object.id)) as GeometryObject[]
    return serializeDocument({ objects, camera: camera.pose() })
  }

  function autosave(): void {
    if (autosaveTimer !== null) window.clearTimeout(autosaveTimer)
    autosaveTimer = null
    const text = documentText()
    if (text === autosaved) return
    try {
      localStorage.setItem(AUTOSAVE_KEY, text)
      autosaved = text
    } catch {
      // Storage full or refused (private window): the work is kept only in this page.
    }
  }

  function scheduleAutosave(): void {
    if (autosaveTimer === null) autosaveTimer = window.setTimeout(autosave, AUTOSAVE_DELAY)
  }
  window.addEventListener('pagehide', autosave)
  // Phones close background apps without pagehide; save when the page is left.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') autosave()
  })

  /** Replace the document with a file's objects, as one undoable step; false if they do not resolve. */
  function loadDocument(file: DocumentFile): boolean {
    settle()
    const previous = structuredClone(doc.objects as GeometryObject[])
    try {
      doc.clear()
      doc.append(...file.objects)
      commit()
    } catch {
      doc.clear()
      doc.append(...previous)
      refresh()
      return false
    }
    if (tools.action !== 'select') toolbar.select('select', { showToast: false })
    if (file.camera) camera.setPose(file.camera)
    refresh()
    return true
  }

  function newDocument(): void {
    settle()
    const changed = doc.clear()
    commit()
    fileName = null
    fileTarget = null
    camera.setView('standard')
    if (tools.action !== 'select') toolbar.select('select', { showToast: false })
    refresh()
    if (changed) showToast('Yeni', 'Yeni belge açıldı. Önceki çizim Geri Al ile geri gelir.')
  }

  async function openFile(): Promise<void> {
    settle()
    let opened
    try {
      opened = await openDocumentFile()
    } catch {
      showToast('Aç', 'Dosya açılamadı.')
      return
    }
    if (opened) showOpened(opened)
  }

  /** A .drw3 file tapped in another app (Android), at start or while running. */
  async function openHandedFile(uri: string): Promise<void> {
    settle()
    try {
      showOpened(await readHandedFile(uri))
    } catch {
      showToast('Aç', 'Dosya açılamadı.')
    }
  }

  /** Put an opened file's document in place (one undoable step) and say so. */
  function showOpened(opened: OpenedFile): void {
    const parsed = parseDocument(opened.text)
    if (!parsed.ok) {
      showToast('Aç', parsed.error)
      return
    }
    if (!loadDocument(parsed)) {
      showToast('Aç', 'Belgedeki geometri çözülemedi.')
      return
    }
    fileName = opened.name
    fileTarget = opened.target
    showToast('Aç', `${opened.name} açıldı.`)
  }

  async function saveFile(saveAs: boolean): Promise<void> {
    settle()
    refresh()
    try {
      const saved = await saveDocumentFile(documentText(), fileName ?? DEFAULT_FILE_NAME, fileTarget, saveAs)
      if (!saved) return
      fileName = saved.name
      fileTarget = saved.target
      showToast('Kaydet', `${saved.name} kaydedildi.`)
    } catch {
      showToast('Kaydet', 'Dosya kaydedilemedi.')
    }
  }

  /** Base for export names: the open file's name, otherwise the app's. */
  const exportBase = () => fileName?.replace(new RegExp(`\\${FILE_EXTENSION}$`, 'i'), '') ?? 'drAW3D'

  /** The scene as drawn now, with its HTML labels painted on top. */
  const exportImage = async (): Promise<void> => {
    renderer.render(scene, camera.camera)
    const image = document.createElement('canvas')
    image.width = canvas.width
    image.height = canvas.height
    const painter = image.getContext('2d')!
    // A WebGL canvas keeps its picture until the frame is shown, so it is copied right away.
    painter.drawImage(canvas, 0, 0)
    const area = canvas.getBoundingClientRect()
    const ratio = canvas.width / Math.max(area.width, 1)
    painter.textAlign = 'center'
    painter.textBaseline = 'middle'
    painter.lineJoin = 'round'
    for (const element of document.querySelectorAll<HTMLElement>('#sceneLabels > *')) {
      const text = element.textContent
      if (!text || element.hidden || element.getClientRects().length === 0) continue
      const box = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      painter.font = `${style.fontWeight} ${parseFloat(style.fontSize) * profile.uiScale * ratio}px ${style.fontFamily}`
      const x = (box.left + box.width / 2 - area.left) * ratio
      const y = (box.top + box.height / 2 - area.top) * ratio
      painter.lineWidth = 3 * profile.uiScale * ratio
      painter.strokeStyle = '#ffffff'
      painter.strokeText(text, x, y)
      painter.fillStyle = style.color
      painter.fillText(text, x, y)
    }
    const blob = await new Promise<Blob | null>(resolve => image.toBlob(resolve, 'image/png'))
    if (!blob) {
      showToast('Dışa Aktar', 'Görüntü oluşturulamadı.')
      return
    }
    try {
      const saved = await exportFile(blob, `${exportBase()}.png`, 'png')
      if (saved) showToast('Dışa Aktar', `${saved} kaydedildi.`)
    } catch {
      showToast('Dışa Aktar', 'Görüntü kaydedilemedi.')
    }
  }

  /** The selected solid's net on an A4 page at full scale; null after telling why not. */
  function netPage(tabs: boolean): { svg: string; title: string; name: string } | null {
    const solid = solidOf(doc, doc.activeId)
    const shape = solid ? shapes.get(solid.id) : undefined
    if (!solid || !shape || (shape.kind !== 'polyhedron' && shape.kind !== 'round')) {
      const sphere = doc.get(doc.activeId)?.type === 'sphere'
      showToast('Açınım', sphere ? 'Kürenin düzlem açınımı yoktur.' : 'Önce açınımı çıkarılacak cismi seçiniz.')
      return null
    }
    if (solid.geometryValid === false) {
      showToast('Açınım', `${solid.name} şu an tanımsız.`)
      return null
    }
    const title = `${solid.name} açınımı`
    return { svg: netSvg(flatNet(shape, tabs), { title, color: solid.color }), title, name: `${solid.name}-açınım` }
  }

  createFileMenu(button('fileMenuButton'), {
    onNew: newDocument,
    onOpen: () => void openFile(),
    onSave: saveAs => void saveFile(saveAs),
    onExportImage: () => void exportImage(),
    async onNetSvg(tabs) {
      const page = netPage(tabs)
      if (!page) return
      try {
        const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${page.svg}`], { type: 'image/svg+xml' })
        const saved = await exportFile(blob, `${page.name}.svg`, 'svg')
        if (saved) showToast('Açınım', `${saved} kaydedildi.`)
      } catch {
        showToast('Açınım', 'SVG kaydedilemedi.')
      }
    },
    onNetPrint(tabs) {
      const page = netPage(tabs)
      if (page) printHtml(printPage(page.svg, page.title), page.name)
    },
    ...(canSavePdf() ? {
      async onNetPdf(tabs: boolean) {
        const page = netPage(tabs)
        if (!page) return
        try {
          const saved = await savePdf(printPage(page.svg, page.title), `${page.name}.pdf`)
          if (saved) showToast('Açınım', `${saved} kaydedildi.`)
        } catch {
          showToast('Açınım', 'PDF kaydedilemedi.')
        }
      },
    } : {}),
  })

  const toolbar: ToolbarApi = createToolbar({
    groups: document.getElementById('toolGroups')!,
    currentTool: button('currentTool'),
    panel: document.getElementById('toolsPanel')!,
    onChange(tool, announce) {
      select.cancelDrag()
      commitEdit()
      tools.setTool(tool.action as ToolAction)
      if (tool.action !== 'select') doc.activeId = null
      // On a phone the sheet would cover the scene the tool is used on.
      if (narrow.matches && tool.action !== 'select') sidePanel.setHidden(true)
      if (announce) showToast(tool.label, tool.instruction)
      refresh()
    },
    onOpenTools() {
      if (sidePanel.isHidden) sidePanel.setHidden(false)
      sidePanel.showTab('tools')
    },
  })

  const sidePanel = createSidePanel(() => {
    settle()
    // The panel's new state is applied after this callback.
    window.setTimeout(refresh)
  })

  const commandInput = document.getElementById('giris') as HTMLInputElement
  const help = createHelpPopup({
    input: commandInput,
    onExample(command) {
      if (sidePanel.isHidden) sidePanel.setHidden(false)
      sidePanel.showTab('algebra')
      commandInput.value = command
      commandInput.focus()
    },
  })
  button('helpMenuButton').addEventListener('click', () => help.open())
  const mathKeyboard = createMathKeyboard(commandInput, document.getElementById('rightWrapper')!, button('keyboardToggle'))
  // Template suggestions handle their keys before the input submits.
  const templates = bindCommandTemplates(commandInput)
  bindCommandInput(commandInput, submit, () => {
    const placeholder = templates.selectUnfilled()
    if (placeholder) showToast('Giriş', `Şablondaki ${placeholder} alanını doldurun.`)
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
    commit()
    refresh()
  }

  button('undo').addEventListener('click', undo)
  button('redo').addEventListener('click', redo)
  button('delete').addEventListener('click', removeSelected)
  button('hide').addEventListener('click', () => {
    const id = doc.activeId
    if (id === null || !hideObject(doc, id)) return
    doc.activeId = null
    commit()
    refresh()
  })
  button('showAll').addEventListener('click', () => {
    if (!showAll(doc)) return
    commit()
    refresh()
  })
  button('groundToggle').addEventListener('click', () => {
    groundMode = NEXT_GROUND_MODE[groundMode]
    environment.setGroundMode(groundMode)
    refresh()
  })
  button('standardView').addEventListener('click', () => {
    camera.setView('standard')
    frame.request()
  })
  createViewMenu(button('viewMenuButton'), viewOptions, {
    onDirection(direction) {
      camera.setView(direction)
      frame.request()
    },
    onChange(next) {
      const display = next.display !== viewOptions.display
      viewOptions = next
      camera.setOrthographic(next.orthographic)
      environment.setAxes(next.axes)
      if (display) {
        applyDisplay()
        resize()
      }
      refresh()
    },
  }, DISPLAY_NAMES[detectDisplay(deviceInfo()).kind])

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
    pointers.add(event.pointerId)
    commitEdit()
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
    const before = doc.activeId
    allowCamera(!select.pointerDown(spot, kind))
    const card = activeCardId()
    if (card !== null && doc.activeId !== before) panel.reveal(card)
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
      const hovered = nearestPoint(doc.objects, camera, spot, tolerance('mouse'))
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
    const key = event.key.toLowerCase()
    // File shortcuts work everywhere, also while typing in the command input.
    if ((event.ctrlKey || event.metaKey) && !event.altKey && (key === 's' || key === 'o')) {
      event.preventDefault()
      if (key === 's') void saveFile(event.shiftKey)
      else if (!event.shiftKey) void openFile()
      return
    }
    const typing = (target?.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'range')
      || target?.tagName === 'SELECT' || target?.isContentEditable
    if (typing) return
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

  // The scene ends where the panel column starts; over a bottom sheet it keeps the full width.
  const alignViewport = () => {
    viewport.style.right = narrow.matches ? '0px' : toolbarElement.style.right || '0px'
  }
  new MutationObserver(alignViewport).observe(toolbarElement, { attributes: true, attributeFilter: ['style'] })
  narrow.addEventListener('change', alignViewport)

  const resize = () => {
    const { width, height } = viewport.getBoundingClientRect()
    renderer.setSize(width, height, false)
    camera.resize(width, height)
    frame.request()
  }
  new ResizeObserver(resize).observe(viewport)
  // Phones start with the whole scene visible; the panel opens from the toolbar.
  if (narrow.matches) sidePanel.setHidden(true)
  alignViewport()
  resize()
  // The standard view's distance depends on the screen's shape, known only now.
  camera.setView('standard')

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
    view: () => ({ ...viewOptions, cameraOrthographic: camera.isOrthographic }),
    fileName: () => fileName,
    display: () => ({ ...profile }),
  }
  restoreAutosave()
  refresh()
  suggestBoard()
  bindAndroid({ back: closeSomething, pause: autosave, openFile: uri => void openHandedFile(uri) })

  /** Android's back button: close one open thing, innermost first. */
  function closeSomething(): boolean {
    if (document.querySelector('#mainToolbar [aria-expanded="true"]')) {
      // Every toolbar menu closes on Escape.
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      return true
    }
    if (document.getElementById('help-popup')?.style.display === 'flex') {
      help.close()
      return true
    }
    if (mathKeyboard.isOpen) {
      mathKeyboard.setOpen(false)
      return true
    }
    if (select.cancelDrag() || tools.action !== 'select') {
      tools.cancel()
      toolbar.select('select', { showToast: false })
      return true
    }
    if (narrow.matches && !sidePanel.isHidden) {
      sidePanel.setHidden(true)
      refresh()
      return true
    }
    return false
  }

  /** A large touch screen may be a smart board; say once where its setting is. */
  function suggestBoard(): void {
    if (viewOptions.display !== 'auto' || !detectDisplay(deviceInfo()).boardLikely) return
    try {
      if (localStorage.getItem(BOARD_HINT_KEY)) return
      localStorage.setItem(BOARD_HINT_KEY, '1')
    } catch {
      return
    }
    showToast('Ekran', 'Akıllı tahtada daha büyük düğmeler ve kalın çizgiler için: Görünüm → Ekran türü → Akıllı tahta.')
  }

  /** Reopen the last work of this browser; its history starts here. */
  function restoreAutosave(): void {
    let text: string | null = null
    try {
      text = localStorage.getItem(AUTOSAVE_KEY)
    } catch {
      return
    }
    const parsed = text ? parseDocument(text) : null
    if (!parsed?.ok || parsed.objects.length === 0) return
    try {
      doc.reset(parsed.objects)
      shapes = resolveAll(doc)
    } catch {
      doc.reset([])
      return
    }
    autosaved = text!
    if (parsed.camera) camera.setPose(parsed.camera)
    showToast('Otomatik Kayıt', 'Son çalışmanız geri yüklendi. Boş bir belge için Dosya → Yeni.')
  }
}
