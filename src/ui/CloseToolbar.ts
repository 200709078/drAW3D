import "./CloseToolbar.css"

import handIcon from "../assets/hand.svg"
import pointIcon from "../assets/point.svg"
import lineIcon from "../assets/line.svg"
import lineSegmentIcon from "../assets/linesegment.svg"
import rayIcon from "../assets/ray.svg"
import angleIcon from "../assets/angle.svg"
import planeIcon from "../assets/plane.svg"
import prismIcon from "../assets/prism.svg"
import pyramidIcon from "../assets/pyramid.svg"
import sphereIcon from "../assets/sphere.svg"
import cylinderIcon from "../assets/cylinder.svg"
import coneIcon from "../assets/cone.svg"

export type CloseToolbarToolName =
  | "select"
  | "point"
  | "line"
  | "lineSegment"
  | "ray"
  | "angle"
  | "plane"
  | "sphere"
  | "prism"
  | "pyramid"
  | "cylinder"
  | "cone"

type ToolDefinition = {
  name: CloseToolbarToolName
  title: string
  icon: string
  alt: string
}

export type CloseToolbarController = {
  element: HTMLDivElement
  open: () => void
  close: () => void
  toggle: () => void
  setActiveTool: (toolName: CloseToolbarToolName) => void
  getActiveTool: () => CloseToolbarToolName
}

const TOOL_DEFINITIONS: ToolDefinition[] = [
  { name: "select", title: "Seçme/Taşıma", icon: handIcon, alt: "Seçme/Taşıma" },
  { name: "point", title: "Nokta", icon: pointIcon, alt: "Nokta" },
  { name: "line", title: "Doğru", icon: lineIcon, alt: "Doğru" },
  { name: "lineSegment", title: "Doğru Parçası", icon: lineSegmentIcon, alt: "Doğru Parçası" },
  { name: "ray", title: "Işın", icon: rayIcon, alt: "Işın" },
  { name: "angle", title: "Açı", icon: angleIcon, alt: "Açı" },
  { name: "plane", title: "Düzlem", icon: planeIcon, alt: "Düzlem" },
  { name: "sphere", title: "Küre", icon: sphereIcon, alt: "Küre" },
  { name: "prism", title: "Prizma", icon: prismIcon, alt: "Prizma" },
  { name: "pyramid", title: "Piramit", icon: pyramidIcon, alt: "Piramit" },
  { name: "cylinder", title: "Silindir", icon: cylinderIcon, alt: "Silindir" },
  { name: "cone", title: "Koni", icon: coneIcon, alt: "Koni" },
]

export function createCloseToolbar(
  onToolSelect: (toolName: CloseToolbarToolName) => void
): CloseToolbarController {
  const toolbar = document.createElement("div")
  toolbar.id = "closeToolbar"
  toolbar.className = "close-toolbar is-closed"

  let isOpen = false
  let toolbarOrder = TOOL_DEFINITIONS.map((tool) => tool.name)

  const buttons = new Map<CloseToolbarToolName, HTMLButtonElement>()

  const stopToolbarEvent = (event: Event) => {
    event.stopPropagation()
  }

  const setOpenState = (open: boolean) => {
    isOpen = open
    toolbar.classList.toggle("is-open", isOpen)
    toolbar.classList.toggle("is-closed", !isOpen)
    toolbar.setAttribute("aria-expanded", String(isOpen))
  }

  const swapWithFirst = (toolName: CloseToolbarToolName) => {
    const selectedIndex = toolbarOrder.indexOf(toolName)

    if (selectedIndex <= 0) return

    const firstTool = toolbarOrder[0]
    toolbarOrder[0] = toolName
    toolbarOrder[selectedIndex] = firstTool
  }

  const renderToolbarOrder = () => {
    toolbarOrder.forEach((toolName, index) => {
      const button = buttons.get(toolName)
      if (!button) return

      button.classList.toggle("is-primary", index === 0)
      button.classList.toggle("active", index === 0)
      button.style.setProperty("--tool-index", index.toString())
      toolbar.appendChild(button)
    })
  }

  const setActiveTool = (toolName: CloseToolbarToolName) => {
    swapWithFirst(toolName)
    renderToolbarOrder()
    setOpenState(false)
  }

  const handleButtonClick = (button: HTMLButtonElement) => {
    const toolName = button.dataset.tool as CloseToolbarToolName | undefined
    if (!toolName) return

    const isPrimaryButton = toolbarOrder[0] === toolName

    if (isPrimaryButton) {
      setOpenState(!isOpen)
      button.blur()
      return
    }

    setActiveTool(toolName)
    button.blur()
    onToolSelect(toolName)
  }

  TOOL_DEFINITIONS.forEach((tool) => {
    const button = document.createElement("button")
    button.type = "button"
    button.dataset.tool = tool.name
    button.title = tool.title
    button.className = "close-toolbar-button"
    button.setAttribute("aria-label", tool.title)

    const icon = document.createElement("img")
    icon.src = tool.icon
    icon.alt = tool.alt
    icon.className = "toolbar-icon"

    button.appendChild(icon)

    button.addEventListener("click", (event) => {
      event.preventDefault()
      event.stopPropagation()
      handleButtonClick(button)
    })

    buttons.set(tool.name, button)
  })

  toolbar.addEventListener("pointerdown", stopToolbarEvent)
  toolbar.addEventListener("mousedown", stopToolbarEvent)
  toolbar.addEventListener("click", stopToolbarEvent)

  document.addEventListener("pointerdown", () => {
    if (isOpen) {
      setOpenState(false)
    }
  })

  renderToolbarOrder()
  setOpenState(false)
  document.body.appendChild(toolbar)

  return {
    element: toolbar,
    open: () => setOpenState(true),
    close: () => setOpenState(false),
    toggle: () => setOpenState(!isOpen),
    setActiveTool,
    getActiveTool: () => toolbarOrder[0],
  }
}
