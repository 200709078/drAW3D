import type { ViewDirection } from '../app/camera-state'
import { DEFAULT_VIEW_OPTIONS, type LabelMode, type ViewOptions } from '../rendering/view-options'

const STORAGE_KEY = 'drAW3D.view'

const DIRECTIONS: readonly [ViewDirection, string][] = [
  ['standard', 'Standart'], ['front', 'Önden'], ['top', 'Üstten'], ['side', 'Yandan'], ['isometric', 'İzometrik'],
]

const LABEL_MODES: readonly [LabelMode, string][] = [
  ['none', 'Hiçbiri'], ['points', 'Yalnız noktalar'], ['all', 'Tüm nesneler'],
]

/** The last view settings of this browser; defaults when storage is unavailable. */
export function loadViewOptions(): ViewOptions {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<ViewOptions>
    const options = { ...DEFAULT_VIEW_OPTIONS }
    for (const key of Object.keys(options) as (keyof ViewOptions)[]) {
      if (typeof stored[key] === typeof options[key]) (options as Record<string, unknown>)[key] = stored[key]
    }
    if (!LABEL_MODES.some(([mode]) => mode === options.labels)) options.labels = DEFAULT_VIEW_OPTIONS.labels
    return options
  } catch {
    return { ...DEFAULT_VIEW_OPTIONS }
  }
}

function saveViewOptions(options: ViewOptions): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(options))
  } catch {
    // Private windows may refuse storage; the settings then last for this visit.
  }
}

export interface ViewMenuHandlers {
  onDirection(direction: ViewDirection): void
  onChange(options: ViewOptions): void
}

/**
 * A toolbar button's drop-down: opens on click, closes on a press outside or Escape.
 * Returns the menu element and a function that opens or closes it.
 */
export function attachMenu(button: HTMLButtonElement, id: string, label: string): { menu: HTMLElement; setOpen(open: boolean): void } {
  const wrapper = document.createElement('div')
  wrapper.className = 'view-menu-wrapper'
  wrapper.id = `${id}Wrapper`
  button.replaceWith(wrapper)
  wrapper.append(button)
  const menu = document.createElement('div')
  menu.id = id
  menu.className = 'view-menu'
  menu.setAttribute('role', 'menu')
  menu.setAttribute('aria-label', label)
  menu.hidden = true
  button.setAttribute('aria-haspopup', 'menu')
  button.setAttribute('aria-expanded', 'false')
  wrapper.append(menu)
  const setOpen = (open: boolean) => {
    menu.hidden = !open
    button.setAttribute('aria-expanded', String(open))
  }
  button.addEventListener('click', () => setOpen(menu.hidden !== false))
  document.addEventListener('pointerdown', event => {
    if (!(event.target instanceof Node) || !wrapper.contains(event.target)) setOpen(false)
  })
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') setOpen(false)
  })
  return { menu, setOpen }
}

/** The toolbar's view menu: camera directions and how the scene is drawn. */
export function createViewMenu(button: HTMLButtonElement, initial: ViewOptions, handlers: ViewMenuHandlers): void {
  const options = { ...initial }
  const { menu } = attachMenu(button, 'viewMenu', 'Görünüm')

  const heading = (text: string) => {
    const title = document.createElement('h3')
    title.textContent = text
    menu.append(title)
  }
  heading('Kamera')
  const directions = document.createElement('div')
  directions.className = 'view-directions'
  for (const [direction, caption] of DIRECTIONS) {
    const item = document.createElement('button')
    item.type = 'button'
    item.id = `view-${direction}`
    item.textContent = caption
    item.addEventListener('click', () => handlers.onDirection(direction))
    directions.append(item)
  }
  menu.append(directions)

  const changed = () => {
    saveViewOptions(options)
    handlers.onChange({ ...options })
  }
  const checkbox = (id: string, caption: string, key: 'orthographic' | 'axes' | 'coordinates' | 'hiddenEdges') => {
    const label = document.createElement('label')
    label.className = 'view-option'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.id = id
    input.checked = options[key]
    input.addEventListener('change', () => {
      options[key] = input.checked
      changed()
    })
    label.append(input, caption)
    menu.append(label)
  }
  checkbox('viewOrthographic', 'Ortografik (dik izdüşüm)', 'orthographic')
  heading('Çizim')
  checkbox('viewAxes', 'Eksenler', 'axes')
  checkbox('viewHiddenEdges', 'Gizli kenarlar kesikli', 'hiddenEdges')
  const labels = document.createElement('label')
  labels.className = 'view-option view-select'
  const select = document.createElement('select')
  select.id = 'viewLabels'
  for (const [mode, caption] of LABEL_MODES) {
    const option = document.createElement('option')
    option.value = mode
    option.textContent = caption
    select.append(option)
  }
  select.value = options.labels
  select.addEventListener('change', () => {
    options.labels = select.value as LabelMode
    changed()
  })
  labels.append('Etiketler', select)
  menu.append(labels)
  checkbox('viewCoordinates', 'Nokta koordinatları', 'coordinates')
}
