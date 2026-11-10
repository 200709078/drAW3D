import {
  isToolAction, toolDefinition, visibleGroups, type ToolAction, type ToolDefinition, type ToolGroupId,
} from './tool-registry'

export interface ToolSelectOptions {
  /** Show the tool's instruction (default). */
  showToast?: boolean
}

export interface ToolbarApi {
  readonly active: ToolAction
  select(action: ToolAction, options?: ToolSelectOptions): void
}

export interface ToolbarOptions {
  /** Where the group buttons go (wide layout). */
  groups: HTMLElement
  /** Shows the active tool in the narrow layout and opens the tools tab. */
  currentTool: HTMLButtonElement
  /** The tools tab of the bottom sheet (narrow layout). */
  panel: HTMLElement
  onChange(tool: ToolDefinition, announce: boolean): void
  onOpenTools(): void
  /**
   * Rarely used action buttons, in the order they move into the ☰ menu when the bar is
   * too narrow. After them the tool groups move in, last first (wide layout only).
   */
  overflowActions?: HTMLButtonElement[]
}

declare global {
  interface Window {
    /** Test hook, mirroring the toolbar a user clicks. */
    drAW3DToolbar?: {
      getActiveTool(): { action: ToolAction }
      selectToolByAction(action: string, options?: ToolSelectOptions): void
    }
  }
}

function icon(tool: ToolDefinition, size: number): HTMLImageElement {
  const image = document.createElement('img')
  image.src = `./img/${tool.icon}`
  image.alt = ''
  image.width = size
  image.height = size
  image.draggable = false
  return image
}

/**
 * GeoGebra-style toolbar: one button per tool group showing the group's last used
 * tool; pressing it chooses that tool and opens the group's menu.
 */
export function createToolbar(options: ToolbarOptions): ToolbarApi {
  const groups = visibleGroups()
  const lastUsed = new Map<ToolGroupId, ToolAction>(groups.map(({ group, tools }) => [group.id, tools[0]!.action]))
  const faces = new Map<ToolGroupId, { button: HTMLButtonElement; image: HTMLImageElement }>()
  const menus = new Map<ToolGroupId, HTMLElement>()
  const items = new Map<ToolAction, HTMLButtonElement[]>()
  let active: ToolAction = 'select'

  const closeMenus = (except?: ToolGroupId) => {
    for (const [id, menu] of menus) {
      if (id === except) continue
      menu.hidden = true
      faces.get(id)?.button.setAttribute('aria-expanded', 'false')
    }
  }

  const remember = (action: ToolAction, button: HTMLButtonElement) => {
    const list = items.get(action) ?? []
    list.push(button)
    items.set(action, list)
  }

  for (const { group, tools } of groups) {
    const wrapper = document.createElement('div')
    wrapper.className = 'tool-group'
    const button = document.createElement('button')
    button.type = 'button'
    button.id = `toolgroup-${group.id}`
    button.className = 'tool-group-button'
    const image = icon(tools[0]!, 28)
    button.append(image)
    if (tools.length > 1) {
      button.classList.add('has-menu')
      button.setAttribute('aria-haspopup', 'menu')
      button.setAttribute('aria-expanded', 'false')
      const menu = document.createElement('div')
      menu.className = 'tool-menu'
      menu.id = `toolmenu-${group.id}`
      menu.setAttribute('role', 'menu')
      menu.setAttribute('aria-label', group.label)
      menu.hidden = true
      for (const tool of tools) {
        const item = document.createElement('button')
        item.type = 'button'
        item.id = `tool-${tool.action}`
        item.className = 'tool-menu-item'
        item.setAttribute('role', 'menuitemradio')
        const text = document.createElement('span')
        text.className = 'tool-menu-text'
        const name = document.createElement('strong')
        name.textContent = tool.label
        const hint = document.createElement('small')
        hint.textContent = tool.instruction
        text.append(name, hint)
        item.append(icon(tool, 24), text)
        item.addEventListener('click', () => {
          closeMenus()
          api.select(tool.action)
        })
        remember(tool.action, item)
        menu.append(item)
      }
      menus.set(group.id, menu)
      wrapper.append(button, menu)
    } else {
      wrapper.append(button)
    }
    button.addEventListener('click', () => {
      const menu = menus.get(group.id)
      const opening = menu?.hidden ?? false
      closeMenus(group.id)
      api.select(lastUsed.get(group.id)!)
      if (menu) {
        menu.hidden = !opening
        button.setAttribute('aria-expanded', String(opening))
      }
    })
    faces.set(group.id, { button, image })
    options.groups.append(wrapper)
  }

  // Narrow layout: all tools by group in the bottom sheet's tools tab.
  for (const { group, tools } of groups) {
    const section = document.createElement('section')
    section.className = 'tools-panel-group'
    const heading = document.createElement('h3')
    heading.textContent = group.label
    const grid = document.createElement('div')
    grid.className = 'tools-panel-grid'
    for (const tool of tools) {
      const item = document.createElement('button')
      item.type = 'button'
      item.id = `paneltool-${tool.action}`
      item.className = 'tools-panel-item'
      const label = document.createElement('span')
      label.textContent = tool.label
      item.append(icon(tool, 32), label)
      item.addEventListener('click', () => api.select(tool.action))
      remember(tool.action, item)
      grid.append(item)
    }
    section.append(heading, grid)
    options.panel.append(section)
  }

  const overflow = createOverflow(options, groups, faces, () => closeMenus(), action => api.select(action),
    id => lastUsed.get(id)!)

  const currentImage = icon(toolDefinition('select'), 28)
  options.currentTool.replaceChildren(currentImage)
  options.currentTool.addEventListener('click', () => options.onOpenTools())

  document.addEventListener('pointerdown', event => {
    if (!(event.target instanceof Element) || !event.target.closest('.tool-group')) closeMenus()
    if (!(event.target instanceof Element) || !event.target.closest('.more-menu-wrapper')) overflow.close()
  })
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeMenus()
      overflow.close()
    }
  })

  function render(): void {
    const tool = toolDefinition(active)
    for (const { group, tools } of groups) {
      const face = faces.get(group.id)!
      const shown = toolDefinition(lastUsed.get(group.id)!)
      face.image.src = `./img/${shown.icon}`
      face.button.title = `${group.label}: ${shown.label}`
      face.button.setAttribute('aria-label', face.button.title)
      face.button.classList.toggle('is-active', tools.some(item => item.action === active))
    }
    for (const [action, buttons] of items) {
      for (const button of buttons) {
        button.classList.toggle('is-active', action === active)
        button.setAttribute('aria-checked', String(action === active))
      }
    }
    overflow.markActive(active)
    currentImage.src = `./img/${tool.icon}`
    options.currentTool.title = `Araç: ${tool.label}`
    options.currentTool.setAttribute('aria-label', options.currentTool.title)
    options.groups.closest('[data-action]')?.setAttribute('data-action', active)
  }

  const api: ToolbarApi = {
    get active() { return active },
    select(action, selectOptions = {}) {
      const tool = toolDefinition(action)
      active = action
      lastUsed.set(tool.group, action)
      render()
      options.onChange(tool, selectOptions.showToast !== false)
    },
  }

  window.drAW3DToolbar = {
    getActiveTool: () => ({ action: active }),
    selectToolByAction(action, selectOptions) {
      if (isToolAction(action)) api.select(action, selectOptions)
    },
  }
  render()
  overflow.fit()
  return api
}

/** A button's name in the ☰ menu: `data-label` when its title explains a disabled state instead. */
const actionLabel = (action: HTMLButtonElement) => action.dataset.label ?? action.title

interface Overflow {
  /** Move as few items as needed into the ☰ menu so that the bar fits. */
  fit(): void
  close(): void
  /** The ☰ button is highlighted while the active tool sits in a moved group. */
  markActive(action: ToolAction): void
}

/**
 * The ☰ / ✕ menu (shared toolbar style of the app family): when the bar is too narrow, rarely used actions and then tool groups (last
 * first) move into it instead of overlapping. Everything stays in the bar when it fits.
 */
function createOverflow(
  options: ToolbarOptions,
  groups: ReturnType<typeof visibleGroups>,
  faces: Map<ToolGroupId, { button: HTMLButtonElement; image: HTMLImageElement }>,
  closeToolMenus: () => void,
  select: (action: ToolAction) => void,
  lastUsedOf: (id: ToolGroupId) => ToolAction,
): Overflow {
  const bar = options.groups.closest<HTMLElement>('.main-toolbar') ?? options.groups.parentElement!
  const actions = options.overflowActions ?? []
  const wrapper = document.createElement('div')
  wrapper.className = 'more-menu-wrapper'
  const button = document.createElement('button')
  button.type = 'button'
  button.id = 'moreMenuButton'
  button.className = 'toolbar-button'
  button.setAttribute('aria-haspopup', 'menu')
  const image = document.createElement('img')
  image.alt = ''
  image.width = 26
  image.height = 26
  button.append(image)
  const menu = document.createElement('div')
  menu.id = 'moreMenu'
  menu.className = 'tool-menu more-menu'
  menu.setAttribute('role', 'menu')
  menu.setAttribute('aria-label', 'Diğer')
  menu.hidden = true
  wrapper.append(button, menu)
  wrapper.hidden = true
  // The button sits at the right end of the moved actions (shared style: ☰ at the bar's right).
  const anchor = [...actions].sort((a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1).at(-1)
    ?? bar.lastElementChild
  anchor?.after(wrapper)

  const groupWrappers = new Map(groups.map(({ group }) => [group.id, faces.get(group.id)!.button.parentElement!]))
  const moved = { actions: [] as HTMLButtonElement[], groups: [] as ToolGroupId[] }
  const menuItems = new Map<ToolAction, HTMLButtonElement>()
  /** On/off actions in the menu, which show their state each time it opens. */
  const toggles = new Map<HTMLButtonElement, HTMLButtonElement>()
  /** Every moved action and its menu entry. */
  const entries = new Map<HTMLButtonElement, HTMLButtonElement>()
  /** Moved groups as accordion sections: a heading button and its tool list; one is open at a time. */
  const sections = new Map<ToolGroupId, { heading: HTMLButtonElement; image: HTMLImageElement; list: HTMLElement }>()
  const groupOf = new Map(groups.flatMap(({ group, tools }) => tools.map(tool => [tool.action, group.id] as const)))
  const openSection = (id: ToolGroupId | null) => {
    for (const [sectionId, { heading, list }] of sections) {
      const open = sectionId === id
      list.hidden = !open
      heading.setAttribute('aria-expanded', String(open))
    }
  }

  // Closed: ☰ "Diğer Araçlar"; open: ✕ "Menüyü Kapat" (as in awPDF and drAW).
  const setOpen = (open: boolean) => {
    menu.hidden = !open
    button.setAttribute('aria-expanded', String(open))
    button.title = open ? 'Menüyü Kapat' : 'Diğer Araçlar'
    button.setAttribute('aria-label', button.title)
    image.src = open ? './img/close.svg' : './img/menu.svg'
  }
  setOpen(false)
  button.addEventListener('click', () => {
    const opening = menu.hidden === true
    closeToolMenus()
    for (const [action, item] of toggles) item.setAttribute('aria-checked', action.getAttribute('aria-pressed')!)
    // A moved action that cannot run now (nothing selected, nothing to clear) is disabled in the menu too,
    // and its name follows the button (a toggle's title changes).
    for (const [action, item] of entries) {
      item.disabled = action.disabled
      item.querySelector('strong')!.textContent = actionLabel(action)
    }
    // The group of the active tool opens with the menu; otherwise every group starts closed.
    const activeGroup = groupOf.get(activeAction)
    openSection(activeGroup && sections.has(activeGroup) ? activeGroup : null)
    setOpen(opening)
  })

  const menuEntry = (img: HTMLImageElement | null, label: string, onClick: () => void) => {
    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'tool-menu-item'
    item.setAttribute('role', 'menuitem')
    const text = document.createElement('span')
    text.className = 'tool-menu-text'
    const name = document.createElement('strong')
    name.textContent = label
    text.append(name)
    if (img) {
      const copy = img.cloneNode() as HTMLImageElement
      copy.width = 24
      copy.height = 24
      item.append(copy)
    }
    item.append(text)
    item.addEventListener('click', () => {
      setOpen(false)
      onClick()
    })
    return item
  }

  const buildMenu = () => {
    menu.replaceChildren()
    menuItems.clear()
    toggles.clear()
    entries.clear()
    for (const action of moved.actions) {
      const item = menuEntry(action.querySelector('img'), actionLabel(action), () => action.click())
      entries.set(action, item)
      if (action.hasAttribute('aria-pressed')) {
        item.setAttribute('role', 'menuitemcheckbox')
        toggles.set(action, item)
      }
      menu.append(item)
    }
    sections.clear()
    for (const { group, tools } of groups) {
      if (!moved.groups.includes(group.id)) continue
      // Shared toolbar style: a group is a closed heading (icon of its last used tool and its
      // name) that opens in place; tools keep their names, since many look alike.
      const heading = document.createElement('button')
      heading.type = 'button'
      heading.id = `moregroup-${group.id}`
      heading.className = 'more-menu-group'
      heading.setAttribute('role', 'menuitem')
      heading.setAttribute('aria-expanded', 'false')
      const image = Object.assign(document.createElement('img'), { alt: '', width: 24, height: 24 })
      const label = document.createElement('span')
      label.textContent = group.label
      const caret = document.createElement('span')
      caret.className = 'more-menu-caret'
      caret.setAttribute('aria-hidden', 'true')
      heading.append(image, label, caret)
      const list = document.createElement('div')
      list.className = 'more-menu-group-items'
      list.id = `moregroupitems-${group.id}`
      list.setAttribute('role', 'group')
      list.setAttribute('aria-label', group.label)
      list.hidden = true
      heading.setAttribute('aria-controls', list.id)
      heading.addEventListener('click', () => openSection(list.hidden ? group.id : null))
      for (const tool of tools) {
        const item = menuEntry(null, tool.label, () => select(tool.action))
        item.prepend(Object.assign(document.createElement('img'), { src: `./img/${tool.icon}`, alt: '', width: 24, height: 24 }))
        item.setAttribute('role', 'menuitemradio')
        menuItems.set(tool.action, item)
        list.append(item)
      }
      sections.set(group.id, { heading, image, list })
      menu.append(heading, list)
    }
  }

  const fits = () => {
    const groupsShown = getComputedStyle(options.groups).display !== 'none'
    return bar.scrollWidth <= bar.clientWidth + 1 &&
      (!groupsShown || options.groups.scrollWidth <= options.groups.clientWidth + 1)
  }

  let activeAction: ToolAction = 'select'
  const markActive = (action: ToolAction) => {
    activeAction = action
    button.classList.toggle('is-active', menuItems.has(action))
    // A heading shows its group's last used tool and is marked while the active tool is inside.
    for (const [id, { heading, image }] of sections) {
      const shown = toolDefinition(lastUsedOf(id))
      image.src = `./img/${shown.icon}`
      heading.classList.toggle('is-active', groupOf.get(action) === id)
    }
    for (const [tool, item] of menuItems) {
      item.classList.toggle('is-active', tool === action)
      item.setAttribute('aria-checked', String(tool === action))
    }
  }

  const fit = () => {
    for (const action of moved.actions) action.hidden = false
    for (const id of moved.groups) groupWrappers.get(id)!.hidden = false
    moved.actions = []
    moved.groups = []
    wrapper.hidden = true
    if (!fits()) {
      wrapper.hidden = false
      setOpen(false)
      const groupsShown = getComputedStyle(options.groups).display !== 'none'
      // The first group (Taşı) always stays; groups leave from the end.
      const candidates: (() => void)[] = [
        ...actions.map(action => () => { action.hidden = true; moved.actions.push(action) }),
        ...(groupsShown ? groups.slice(1).reverse().map(({ group }) => () => {
          groupWrappers.get(group.id)!.hidden = true
          moved.groups.push(group.id)
        }) : []),
      ]
      for (const move of candidates) {
        if (fits()) break
        move()
      }
    } else {
      setOpen(false)
    }
    buildMenu()
    markActive(activeAction)
  }

  let frame = 0
  new ResizeObserver(() => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(fit)
  }).observe(bar)

  return { fit, close: () => setOpen(false), markActive }
}
