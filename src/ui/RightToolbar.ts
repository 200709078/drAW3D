import "./RightToolbar.css"

import accordionIcon from "../assets/acordeon.svg"
import gridIcon from "../assets/grid.svg"
import deleteIcon from "../assets/delete.svg"
import visibilityIcon from "../assets/visibility.svg"
import undoIcon from "../assets/undo.svg"
import redoIcon from "../assets/redo.svg"

export type RightToolbarActionName = "togglePlane"

export function createRightToolbar(
  onActionSelect: (actionName: RightToolbarActionName) => void
) {
  let isOpen = false

  const rightActionToolbar = document.createElement("div")
  rightActionToolbar.id = "rightActionToolbar"
  rightActionToolbar.className = "right-toolbar is-closed"

  rightActionToolbar.innerHTML = `
    <button
      id="rightToolbarAccordionButton"
      class="right-toolbar-accordion-button"
      type="button"
      title="Araçları göster"
      aria-expanded="false"
    >
      <img
        id="rightToolbarAccordionIcon"
        src="${accordionIcon}"
        alt="Araçları göster"
        class="right-toolbar-accordion-icon"
      />
    </button>

    <button
      id="toggleButton"
      class="right-toolbar-action"
      data-action="togglePlane"
      type="button"
      title="Düzlem Gizle"
    >
      <img id="planeToggleIcon" src="${gridIcon}" alt="Düzlem Gizle" class="toolbar-icon" />
    </button>

    <button id="undoButton" class="right-toolbar-action" type="button" title="Geri Al" disabled>
      <img src="${undoIcon}" alt="Geri Al" class="toolbar-icon" />
    </button>

    <button id="redoButton" class="right-toolbar-action" type="button" title="Yinele" disabled>
      <img src="${redoIcon}" alt="Yinele" class="toolbar-icon" />
    </button>

    <button id="deleteButton" class="right-toolbar-action" type="button" title="Sil" disabled>
      <img src="${deleteIcon}" alt="Sil" class="delete-icon" />
    </button>

    <button id="showButton" class="right-toolbar-action" type="button" title="Tümünü Göster" disabled>
      <img src="${visibilityIcon}" alt="Tümünü Göster" class="toolbar-icon" />
    </button>

    <button id="hideButton" class="right-toolbar-action" type="button" title="Gizle" disabled>
      <img src="${visibilityIcon}" alt="Gizle" class="toolbar-icon" />
    </button>
  `

  const accordionButton = rightActionToolbar.querySelector<HTMLButtonElement>(
    "#rightToolbarAccordionButton"
  )

  const setOpenState = (open: boolean) => {
    isOpen = open

    rightActionToolbar.classList.toggle("is-open", isOpen)
    rightActionToolbar.classList.toggle("is-closed", !isOpen)

    accordionButton?.setAttribute("aria-expanded", String(isOpen))
    accordionButton?.setAttribute(
      "title",
      isOpen ? "Araçları gizle" : "Araçları göster"
    )
    const accordionIconElement =
      rightActionToolbar.querySelector<HTMLImageElement>("#rightToolbarAccordionIcon")

    accordionIconElement?.setAttribute(
      "alt",
      isOpen ? "Araçları gizle" : "Araçları göster"
    )
  }

  accordionButton?.addEventListener("click", (event) => {
    event.preventDefault()
    event.stopPropagation()

    setOpenState(!isOpen)
  })

  const toggleButton = rightActionToolbar.querySelector<HTMLButtonElement>(
    'button[data-action="togglePlane"]'
  )

  toggleButton?.addEventListener("click", (event) => {
    event.preventDefault()
    event.stopPropagation()

    onActionSelect("togglePlane")
  })

  rightActionToolbar.addEventListener("pointerdown", (event) => {
    event.stopPropagation()
  })

  rightActionToolbar.addEventListener("mousedown", (event) => {
    event.stopPropagation()
  })

  rightActionToolbar.addEventListener("click", (event) => {
    event.stopPropagation()
  })

  document.body.appendChild(rightActionToolbar)

  setOpenState(false)

  return rightActionToolbar
}
