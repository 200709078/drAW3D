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

  const currentImage = icon(toolDefinition('select'), 28)
  options.currentTool.replaceChildren(currentImage)
  options.currentTool.addEventListener('click', () => options.onOpenTools())

  document.addEventListener('pointerdown', event => {
    if (!(event.target instanceof Element) || !event.target.closest('.tool-group')) closeMenus()
  })
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeMenus()
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
  return api
}
