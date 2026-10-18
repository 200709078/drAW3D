//SU EKLENECEK...
import './style.css'
import * as THREE from 'three'
import { createScene } from './core/Scene'
import { createCamera } from './core/Camera'
import { createRenderer } from './core/Renderer'
import { createControls } from './core/Controls'
import { createLoop } from './core/Loop'
import { setupResize } from './core/Resize'
import { createLighting } from './engine/Lighting'
import { createPlane } from './engine/Plane'

import { ToolManager } from './tools/ToolManager'
import { createCloseToolbar, type CloseToolbarController, type CloseToolbarToolName } from './ui/CloseToolbar'
import { createRightToolbar } from './ui/RightToolbar'

import { PointTool } from './tools/PointTool'
import { LineSegmentTool } from './tools/LineSegmentTool'
import { LineTool } from './tools/LineTool'
import { RayTool } from './tools/RayTool'
import { PlaneTool } from './tools/PlaneTool'
import { AngleTool } from './tools/AngleTool'
import { SelectTool } from './tools/SelectTool'
import { SphereTool } from './tools/SphereTool'
import { PrismTool } from './tools/PrismTool'
import { PyramidTool } from './tools/PyramidTool'
import { CylinderTool } from './tools/CylinderTool'
import { ConeTool } from './tools/ConeTool'
import { createGrid } from './engine/Grid'
import { HistoryManager } from './history/HistoryManager'
import type { ToolCompleteOptions } from './tools/BaseTool'
import planeIcon from './assets/plane.svg'
import gridIcon from './assets/grid.svg'
import blankIcon from './assets/blank.svg'

let toastTimeoutId: number | undefined

const showToastMessage = (title: string, message: string) => {
  let toast = document.getElementById("toolToast")

  if (!toast) {
    toast = document.createElement("div")
    toast.id = "toolToast"
    toast.className = "tool-toast"
    toast.setAttribute("role", "status")
    toast.setAttribute("aria-live", "polite")
    document.body.appendChild(toast)
  }

  toast.innerHTML = `
    <strong class="tool-toast-title">${title}</strong>
    <span class="tool-toast-message">${message}</span>
  `
  toast.classList.add("is-visible")

  if (toastTimeoutId) {
    window.clearTimeout(toastTimeoutId)
  }

  toastTimeoutId = window.setTimeout(() => {
    toast?.classList.remove("is-visible")
  }, 2800)
}

type ToolToastMessage = {
  title: string
  message: string
}

const TOOL_TOAST_MESSAGES: Record<CloseToolbarToolName, ToolToastMessage> = {
  select: {
    title: "Seçim",
    message: "Bir nesneyi seç veya taşı",
  },
  point: {
    title: "Nokta",
    message: "Konum veya bir nesne seçin",
  },
  lineSegment: {
    title: "Doğru Parçası",
    message: "Farklı iki nokta seçin",
  },
  line: {
    title: "Doğru",
    message: "Farklı iki nokta seçin",
  },
  ray: {
    title: "Işın",
    message: "Farklı iki nokta seçin",
  },
  angle: {
    title: "Açı",
    message: "Farklı üç nokta seçin",
  },
  plane: {
    title: "Düzlem",
    message: "Doğrusal olmayan üç nokta seçin",
  },
  sphere: {
    title: "Küre",
    message: "Farklı iki nokta seçin",
  },
  prism: {
    title: "Prizma",
    message: "Farklı iki nokta seçin",
  },
  pyramid: {
    title: "Piramit",
    message: "Farklı iki nokta seçin",
  },
  cylinder: {
    title: "Silindir",
    message: "Farklı iki nokta seçin",
  },
  cone: {
    title: "Koni",
    message: "Farklı iki nokta seçin",
  },
}

const scene = createScene()
const camera = createCamera()
const renderer = createRenderer()

if (renderer) {
  createLighting(scene)

  const plane = createPlane(scene)
  const grid = createGrid(scene)

  const controls = createControls(camera, renderer)

  setupResize(camera, renderer)
  createLoop(renderer, scene, camera, controls)

  const toolManager = new ToolManager()

  const selectableObjects: THREE.Object3D[] = []
  const history = new HistoryManager(scene, selectableObjects)

  const selectTool = new SelectTool(scene, camera, controls)
  selectTool.setSelectableObjects(selectableObjects)
  selectTool.setHistoryManager(history)

  toolManager.setSelectTool(selectTool)
  toolManager.setControls(controls)

  const pointTool = new PointTool(scene, camera, selectableObjects)
  const lineSegmentTool = new LineSegmentTool(scene, camera, selectableObjects)
  const lineTool = new LineTool(scene, camera, selectableObjects)
  const rayTool = new RayTool(scene, camera, selectableObjects)
  const planeTool = new PlaneTool(scene, camera, selectableObjects)
  const angleTool = new AngleTool(scene, camera, selectableObjects)
  const sphereTool = new SphereTool(scene, camera, selectableObjects)
  const prismTool = new PrismTool(scene, camera, selectableObjects)
  const pyramidTool = new PyramidTool(scene, camera, selectableObjects)
  const cylinderTool = new CylinderTool(scene, camera, selectableObjects)
  const coneTool = new ConeTool(scene, camera, selectableObjects)

  const rightControls = document.getElementById("rightControls")

  const sideControl = document.getElementById("sideControl")
  const sideSlider = document.getElementById("sideSlider") as HTMLInputElement | null

  const unFoldControl = document.getElementById("unFoldControl")
  const unFoldSlider = document.getElementById("unFoldSlider") as HTMLInputElement | null
  const unFoldValue = document.getElementById("unFoldValue")
  type PlaneToggleMode = "showBoth" | "hidePlane" | "hideBoth"
  let planeToggleMode: PlaneToggleMode = "showBoth"

  const updatePlaneToggleIcon = () => {
    const icon = document.getElementById("planeToggleIcon") as HTMLImageElement | null
    const button = icon?.closest("button")

    if (!icon) return

    const states: Record<PlaneToggleMode, { icon: string, title: string }> = {
      showBoth: {
        icon: gridIcon,
        title: "Düzlem Gizle",
      },
      hidePlane: {
        icon: blankIcon,
        title: "Grid Gizle",
      },
      hideBoth: {
        icon: planeIcon,
        title: "Düzlem/Grid Göster",
      },
    }
    const state = states[planeToggleMode]

    icon.src = state.icon
    icon.alt = state.title
    button?.setAttribute("title", state.title)
  }

  const applyPlaneToggleMode = () => {
    if (planeToggleMode === "showBoth") {
      plane.visible = true
      grid.visible = true
    } else if (planeToggleMode === "hidePlane") {
      plane.visible = false
      grid.visible = true
    } else {
      plane.visible = false
      grid.visible = false
    }

    updatePlaneToggleIcon()
  }
  const updateLegacyPlaneToggleIcon = () => {
    const icon = document.getElementById("planeToggleIcon") as HTMLImageElement | null
    const button = icon?.closest("button")

    if (!icon) return

    const title = plane.visible ? "Grid Görünümü" : "Düzlem Görünümü"

    icon.src = plane.visible ? gridIcon : planeIcon
    icon.alt = title
    button?.setAttribute("title", title)
  }

  void updateLegacyPlaneToggleIcon

  const setSideControlActive = (active: boolean) => {
    if (sideControl) {
      sideControl.style.display = active ? "block" : "none"
      sideControl.classList.toggle("active", active)
      sideControl.classList.toggle("passive", !active)
    }

    if (sideSlider) {
      sideSlider.disabled = !active
    }
  }

  const setUnFoldControlActive = (active: boolean) => {
    if (unFoldControl) {
      unFoldControl.style.display = active ? "block" : "none"
      unFoldControl.classList.toggle("active", active)
      unFoldControl.classList.toggle("passive", !active)
    }

    if (unFoldSlider) {
      unFoldSlider.disabled = !active
    }
  }


  setSideControlActive(false)
  setUnFoldControlActive(false)
  rightControls?.style.removeProperty("display")

  unFoldSlider?.addEventListener("input", () => {
    if (unFoldValue && unFoldSlider) {
      unFoldValue.textContent = unFoldSlider.value
    }
  })

  let closeToolbar: CloseToolbarController | null = null
  const returnToSelectTool = (options?: ToolCompleteOptions) => {
    setSideControlActive(false)
    setUnFoldControlActive(false)

    if (options?.clearSelection !== false) {
      selectTool.clearSelection()
    }

    toolManager.setTool(selectTool)
    closeToolbar?.setActiveTool("select")

  }

  [
    pointTool,
    lineSegmentTool,
    lineTool,
    rayTool,
    planeTool,
    angleTool,
    sphereTool,
    prismTool,
    pyramidTool,
    cylinderTool,
    coneTool,
  ].forEach((tool) => {
    tool.setPointSelectHandler((point) => selectTool.selectPointWithoutHelpers(point))
    tool.setHistoryManager(history)
  });

  [
    lineSegmentTool,
    lineTool,
    rayTool,
    planeTool,
    angleTool,
    sphereTool,
    prismTool,
    pyramidTool,
    cylinderTool,
    coneTool,
  ].forEach((tool) => {
    tool.setCompleteHandler(returnToSelectTool)
  })

  toolManager.setTool(selectTool)

  const setActiveToolByName = (toolName: CloseToolbarToolName) => {
    if (toolName !== "select") {
      setUnFoldControlActive(false)
    }

    if (toolName === "select") {
      toolManager.setTool(selectTool)
    }

    if (toolName === "point") {
      toolManager.setTool(pointTool)
    }

    if (toolName === "lineSegment") {
      toolManager.setTool(lineSegmentTool)
    }

    if (toolName === "line") {
      toolManager.setTool(lineTool)
    }

    if (toolName === "ray") {
      toolManager.setTool(rayTool)
    }

    if (toolName === "plane") {
      toolManager.setTool(planeTool)
    }

    if (toolName === "angle") {
      toolManager.setTool(angleTool)
    }

    if (toolName === "sphere") {
      toolManager.setTool(sphereTool)
    }

    if (toolName === "prism") {
      toolManager.setTool(prismTool)
    }

    if (toolName === "pyramid") {
      toolManager.setTool(pyramidTool)
    }

    if (toolName === "cylinder") {
      toolManager.setTool(cylinderTool)
    }

    if (toolName === "cone") {
      toolManager.setTool(coneTool)
    }

    setSideControlActive(toolName === "prism" || toolName === "pyramid")

    const toastMessage = TOOL_TOAST_MESSAGES[toolName]
    showToastMessage(toastMessage.title, toastMessage.message)
  }

  closeToolbar = createCloseToolbar((toolName) => {
    setActiveToolByName(toolName)
  })

  createRightToolbar((actionName) => {
    if (actionName === "togglePlane") {
      planeToggleMode =
        planeToggleMode === "showBoth"
          ? "hidePlane"
          : planeToggleMode === "hidePlane"
            ? "hideBoth"
            : "showBoth"

      applyPlaneToggleMode()
    }
  })

  applyPlaneToggleMode()

  const undoButton = document.getElementById("undoButton") as HTMLButtonElement | null
  const redoButton = document.getElementById("redoButton") as HTMLButtonElement | null

  history.onChange(() => {
    if (undoButton) {
      undoButton.disabled = !history.canUndo
      undoButton.classList.toggle("active", history.canUndo)
    }

    if (redoButton) {
      redoButton.disabled = !history.canRedo
      redoButton.classList.toggle("active", history.canRedo)
    }
  })

  undoButton?.addEventListener("click", () => {
    selectTool.clearSelection()
    history.undo()
  })

  redoButton?.addEventListener("click", () => {
    selectTool.clearSelection()
    history.redo()
  })

  renderer.domElement.style.touchAction = "none"

  renderer.domElement.addEventListener("pointerdown", (event) => {
    const activeTool = toolManager.activeTool

    const shouldToolHandleFirst = activeTool === selectTool
      ? selectTool.shouldHandleBeforeOrbitControls(event)
      : activeTool !== null

    if (shouldToolHandleFirst) {
      toolManager.onPointerDown(event)
      event.preventDefault()
      event.stopImmediatePropagation()
    }
  }, { capture: true })

  renderer.domElement.addEventListener("pointerdown", (event) => {
    toolManager.onPointerDown(event)
  })

  renderer.domElement.addEventListener("pointermove", (event) => {
    toolManager.onPointerMove(event)
  })

  renderer.domElement.addEventListener("pointerup", (event) => {
    toolManager.onPointerUp(event)
  })

  renderer.domElement.addEventListener("pointercancel", (event) => {
    toolManager.onPointerCancel(event)
  })

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase()

    if ((event.ctrlKey || event.metaKey) && key === "z") {
      event.preventDefault()
      selectTool.clearSelection()

      if (event.shiftKey) {
        history.redo()
      } else {
        history.undo()
      }
      return
    }

    if ((event.ctrlKey || event.metaKey) && key === "y") {
      event.preventDefault()
      selectTool.clearSelection()
      history.redo()
      return
    }

    if (event.key === "Escape") {
      returnToSelectTool()
      return
    }

    toolManager.onKeyDown(event)
  })
}
