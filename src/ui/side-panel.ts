const MIN_PANEL_WIDTH = 260
const MAX_PANEL_WIDTH = 700
const CANVAS_RESERVE = 90
const MIN_SHEET_HEIGHT = 120
const MAX_SHEET_RATIO = 0.85
/** A press that moves less than this is a tap on the handle. */
const TAP_DISTANCE = 8
/** Dragging the open sheet this far below its smallest height closes it. */
const CLOSE_DISTANCE = 40
/**
 * A closed sheet leaves its handle and tabs visible at the bottom (CSS `--sheet-peek`), so
 * the panel can be found and opened where it is; there is no arrow button on a phone.
 */
export const SHEET_PEEK = 58

/** Narrow screens show the panel as a bottom sheet instead of a right column. */
export const NARROW_LAYOUT_QUERY = '(max-width: 700px)'

export type PanelTab = 'algebra' | 'tools'

export interface SidePanel {
  readonly isHidden: boolean
  setHidden(hidden: boolean): void
  /** The bottom sheet's tab (narrow layout); the column always shows the objects. */
  showTab(tab: PanelTab): void
}

function required<Element extends HTMLElement>(id: string): Element {
  const element = document.getElementById(id)
  if (!element) throw new Error(`drAW3D arayüz öğesi bulunamadı: ${id}`)
  return element as Element
}

/**
 * The object panel, its collapse button (column layout), its tabs and its handle. On a
 * narrow screen the bottom sheet opens and closes by its own handle: a tap, a swipe up or a
 * tab opens it; a tap or a drag down closes it.
 */
export function createSidePanel(onToggle: () => void): SidePanel {
  const wrapper = required<HTMLElement>('rightWrapper')
  const toolbar = required<HTMLElement>('mainToolbar')
  const toggle = required<HTMLButtonElement>('btnCalc')
  const toggleIcon = document.getElementById('btnimgCalc')
  const narrow = window.matchMedia(NARROW_LAYOUT_QUERY)
  const tabs = { algebra: required<HTMLButtonElement>('tabAlgebra'), tools: required<HTMLButtonElement>('tabTools') }
  const pages = { algebra: required<HTMLElement>('scrollWrapper'), tools: required<HTMLElement>('toolsPanel') }

  // In the column layout the toolbar ends at the panel's left edge; over a bottom
  // sheet it spans the screen (CSS). Layout sizes (offsetWidth), not on-screen ones: a
  // zoomed page (smart boards) would scale an on-screen size twice.
  const alignToolbar = () => {
    if (narrow.matches) toolbar.style.right = ''
    else toolbar.style.right = wrapper.classList.contains('hide') ? '0px' : `${wrapper.offsetWidth}px`
  }

  const resizer = required<HTMLElement>('panelHandle')
  // A closed sheet keeps only its handle and tabs usable; the hidden pages take no focus.
  const updateSheet = () => {
    const closed = narrow.matches && wrapper.classList.contains('hide')
    pages.algebra.inert = closed
    pages.tools.inert = closed
    if (narrow.matches) {
      resizer.setAttribute('role', 'button')
      resizer.tabIndex = 0
      resizer.setAttribute('aria-expanded', String(!closed))
      resizer.setAttribute('aria-label', closed ? 'Paneli aç' : 'Paneli kapat')
      resizer.title = closed ? 'Paneli aç' : 'Paneli kapat (sürükleyerek boyutlandırılır)'
    } else {
      for (const name of ['role', 'aria-expanded', 'aria-label', 'title', 'tabindex']) resizer.removeAttribute(name)
    }
  }

  const panel: SidePanel = {
    get isHidden() { return wrapper.classList.contains('hide') },
    setHidden(hidden) {
      wrapper.classList.toggle('hide', hidden)
      toggleIcon?.classList.toggle('panel-hidden', hidden)
      toggle.title = hidden ? 'Paneli Göster' : 'Paneli Gizle'
      updateSheet()
      alignToolbar()
    },
    showTab(tab) {
      for (const name of ['algebra', 'tools'] as const) {
        tabs[name].setAttribute('aria-selected', String(name === tab))
        pages[name].hidden = name !== tab
      }
    },
  }
  const setOpen = (open: boolean) => {
    if (open === !panel.isHidden) return
    onToggle()
    panel.setHidden(!open)
  }
  // A tab of a closed sheet opens it on that tab.
  for (const name of ['algebra', 'tools'] as const) {
    tabs[name].addEventListener('click', () => {
      panel.showTab(name)
      if (narrow.matches) setOpen(true)
    })
  }

  toggle.addEventListener('click', () => setOpen(panel.isHidden))
  resizer.addEventListener('keydown', event => {
    if (!narrow.matches || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    setOpen(panel.isHidden)
  })

  // The handle resizes the column's width or the sheet's height, with mouse, pen or finger;
  // on the sheet a tap toggles it, a swipe up opens it and a drag far down closes it.
  resizer.addEventListener('pointerdown', down => {
    if (down.pointerType === 'mouse' && down.button !== 0) return
    down.preventDefault()
    const sheet = narrow.matches
    const closed = sheet && panel.isHidden
    const start = sheet ? down.clientY : down.clientX
    // Pointer positions are on-screen pixels; sizes are set in layout pixels.
    const zoom = wrapper.getBoundingClientRect().width / wrapper.offsetWidth || 1
    const startSize = sheet ? wrapper.offsetHeight : wrapper.offsetWidth
    let travel = 0
    let lastDelta = 0
    resizer.setPointerCapture(down.pointerId)
    // A closed sheet only opens; it is not resized while closed.
    if (!closed) {
      wrapper.style.transition = 'none'
      toolbar.style.transition = 'none'
    }
    const move = (event: PointerEvent) => {
      if (event.pointerId !== down.pointerId) return
      const delta = ((sheet ? event.clientY : event.clientX) - start) / zoom
      travel = Math.max(travel, Math.abs(delta))
      lastDelta = delta
      if (closed) return
      if (sheet) {
        const maxHeight = window.innerHeight / zoom * MAX_SHEET_RATIO
        wrapper.style.height = `${Math.max(MIN_SHEET_HEIGHT, Math.min(maxHeight, startSize - delta))}px`
      } else {
        const maxWidth = Math.min(MAX_PANEL_WIDTH, window.innerWidth / zoom - CANVAS_RESERVE)
        wrapper.style.width = `${Math.max(MIN_PANEL_WIDTH, Math.min(maxWidth, startSize - delta))}px`
      }
      alignToolbar()
    }
    const up = (event: PointerEvent) => {
      if (event.pointerId !== down.pointerId) return
      wrapper.style.transition = ''
      toolbar.style.transition = ''
      resizer.removeEventListener('pointermove', move)
      resizer.removeEventListener('pointerup', up)
      resizer.removeEventListener('pointercancel', up)
      if (!sheet || event.type === 'pointercancel') return
      const tapped = travel < TAP_DISTANCE
      if (closed) {
        // A tap or a swipe up opens; a swipe down on a closed sheet does nothing.
        if (tapped || lastDelta < 0) setOpen(true)
      } else if (tapped || startSize - lastDelta < MIN_SHEET_HEIGHT - CLOSE_DISTANCE) {
        // Dragged below the smallest size: close, and open again at the size it had.
        wrapper.style.height = tapped ? wrapper.style.height : `${startSize}px`
        setOpen(false)
      }
    }
    resizer.addEventListener('pointermove', move)
    resizer.addEventListener('pointerup', up)
    resizer.addEventListener('pointercancel', up)
  })

  // A size dragged in one layout does not apply to the other.
  narrow.addEventListener('change', () => {
    wrapper.style.width = ''
    wrapper.style.height = ''
    // The column has no tools tab: the toolbar shows the tools there.
    if (!narrow.matches) panel.showTab('algebra')
    updateSheet()
    alignToolbar()
  })
  new ResizeObserver(alignToolbar).observe(wrapper)
  wrapper.addEventListener('transitionend', alignToolbar)
  window.addEventListener('resize', alignToolbar)
  updateSheet()
  alignToolbar()
  return panel
}
