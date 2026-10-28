import type { CardModel, StylePatch, StyleSpec } from '../app/object-cards'
import type { LineStyle, ObjectId } from '../geometry/types'

export interface PanelEntry {
  id: ObjectId
  color: string
  visible: boolean
  card: CardModel
  /** The net is playing. */
  animating?: boolean
  /** Text shown while the card is edited; null when the object cannot be edited. */
  editText: string | null
  /** Appearance settings; null when the object is not drawn. */
  style: StyleSpec | null
}

export interface ObjectPanelHandlers {
  select(id: ObjectId): void
  toggleVisibility(id: ObjectId): void
  remove(id: ObjectId): void
  /** Pointer or keyboard interaction with a slider begins one editable step. */
  sliderStart(): void
  sliderInput(id: ObjectId, values: number[]): void
  sliderCommit(): void
  /** New slider bounds typed on a parameter card. */
  parameterRange(id: ObjectId, min: number, max: number, step: number): void
  /** Start or stop opening and closing the net by itself. */
  toggleAnimation(id: ObjectId): void
  /** Apply an edited card; true when accepted, false to keep editing (an error was shown). */
  redefine(id: ObjectId, text: string): boolean
  /** An appearance change; changes until `styleCommit` are one undoable step. */
  styleInput(id: ObjectId, patch: StylePatch): void
  styleCommit(): void
}

interface CardView {
  root: HTMLDivElement
  input: HTMLInputElement
  output: HTMLOutputElement
  hide: HTMLButtonElement
  labels: HTMLLabelElement[]
  ranges: HTMLInputElement[]
  outputKey: string
  settings: HTMLDivElement
  bounds: HTMLInputElement[]
  play: HTMLButtonElement
  edit: HTMLButtonElement
  styleButton: HTMLButtonElement
  style: StyleView
  styleOpen: boolean
  /** Latest display text; restored when editing ends. */
  display: string
  editText: string | null
  editing: boolean
}

interface StyleView {
  root: HTMLDivElement
  color: HTMLInputElement
  size: HTMLInputElement
  sizeCaption: HTMLSpanElement
  lineStyle: HTMLSelectElement
  opacity: HTMLInputElement
  label: HTMLInputElement
  faces: HTMLInputElement
  edges: HTMLInputElement
}

const BOUND_FIELDS = [['min', 'En küçük'], ['max', 'En büyük'], ['step', 'Adım']] as const

/** Each option shows a sample of the stroke beside its name. */
const LINE_STYLES: readonly [LineStyle, string, string][] = [
  ['solid', 'Düz', '────────'], ['dashed', 'Kesikli', '– – – –'], ['dotted', 'Noktalı', '· · · · ·'],
]

const SLIDER_COUNT = 3

function element<Tag extends keyof HTMLElementTagNameMap>(tag: Tag, className = ''): HTMLElementTagNameMap[Tag] {
  const node = document.createElement(tag)
  if (className) node.className = className
  return node
}

function setIfChanged<Target, Key extends keyof Target>(target: Target, key: Key, value: Target[Key]): void {
  if (target[key] !== value) target[key] = value
}

/**
 * Cards are keyed by object ID and updated in place, newest first. Their element IDs
 * (`<id>-input`, `<id>-sliderA`, ...) are stable across undo/redo for tests and styles.
 * Same structure and API as drAW2D's panel; the appearance settings are the 3D ones.
 */
export class ObjectPanel {
  private readonly views = new Map<ObjectId, CardView>()

  constructor(private readonly container: HTMLElement, private readonly handlers: ObjectPanelHandlers) {}

  render(entries: readonly PanelEntry[], activeId: ObjectId | null): void {
    const wanted = new Set(entries.map(entry => entry.id))
    for (const [id, view] of this.views) {
      if (!wanted.has(id)) {
        view.root.remove()
        this.views.delete(id)
      }
    }
    entries.forEach((entry, index) => {
      const view = this.views.get(entry.id) ?? this.create(entry.id)
      this.update(view, entry, entry.id === activeId)
      if (this.container.children[index] !== view.root) this.container.insertBefore(view.root, this.container.children[index] ?? null)
    })
  }

  /** Bring the selected object's card into view (selection made in the scene). */
  reveal(id: ObjectId): void {
    this.views.get(id)?.root.scrollIntoView({ block: 'nearest' })
  }

  private create(id: ObjectId): CardView {
    const root = element('div')
    root.dataset.id = String(id)
    const block = element('div', 'expr-block')
    const input = element('input')
    input.id = `${id}-input`
    input.readOnly = true
    const output = element('output')
    output.id = `${id}-output`
    const hide = element('button', 'btn gizle')
    hide.type = 'button'
    hide.id = `${id}-visibility`
    const remove = element('button', 'btn sil')
    remove.type = 'button'
    remove.id = `${id}-remove`
    remove.title = 'Sil'
    const sliders = element('div', 'sliders')
    const labels: HTMLLabelElement[] = []
    const ranges: HTMLInputElement[] = []
    for (const suffix of ['A', 'B', 'C'].slice(0, SLIDER_COUNT)) {
      const label = element('label')
      label.id = `${id}-label${suffix}`
      label.htmlFor = `${id}-slider${suffix}`
      const range = element('input')
      range.type = 'range'
      range.id = `${id}-slider${suffix}`
      range.addEventListener('pointerdown', () => this.handlers.sliderStart())
      range.addEventListener('keydown', () => this.handlers.sliderStart())
      range.addEventListener('input', () => this.handlers.sliderInput(id, ranges.map(item => Number(item.value))))
      range.addEventListener('change', () => this.handlers.sliderCommit())
      labels.push(label)
      ranges.push(range)
      sliders.append(label, range)
    }
    // Solids with a net: play opens and closes it by itself.
    const play = element('button', 'btn parameter-play net-play')
    play.type = 'button'
    play.id = `${id}-play`
    play.hidden = true
    play.addEventListener('click', () => this.handlers.toggleAnimation(id))
    sliders.append(play)
    // Parameter cards: editable slider bounds, shown while selected.
    const settings = element('div', 'parameter-settings')
    settings.hidden = true
    const bounds = BOUND_FIELDS.map(([field, title]) => {
      const label = element('label', 'parameter-bound')
      const caption = element('span')
      caption.textContent = title
      const bound = element('input')
      bound.type = 'number'
      bound.id = `${id}-${field}`
      bound.addEventListener('change', () => {
        const [min, max, step] = bounds.map(item => Number(item.value))
        this.handlers.parameterRange(id, min!, max!, step!)
      })
      label.append(caption, bound)
      settings.append(label)
      return bound
    })

    const edit = element('button', 'btn duzenle')
    edit.type = 'button'
    edit.id = `${id}-edit`
    edit.title = 'Düzenle'
    edit.setAttribute('aria-label', 'Düzenle')

    const styleButton = element('button', 'btn ayarlar')
    styleButton.type = 'button'
    styleButton.id = `${id}-style`
    styleButton.title = 'Görünüm'
    styleButton.setAttribute('aria-label', 'Görünüm')
    styleButton.setAttribute('aria-pressed', 'false')
    styleButton.addEventListener('click', () => {
      view.styleOpen = !view.styleOpen
      this.handlers.select(id)
    })
    const style = this.createStyle(id)

    input.addEventListener('click', () => { if (!view.editing) this.handlers.select(id) })
    input.addEventListener('dblclick', () => this.startEdit(view))
    // A value card shows only its value until selected.
    output.addEventListener('click', () => this.handlers.select(id))
    output.addEventListener('dblclick', () => this.startEdit(view))
    // Keep the input focused when the button is pressed, so blur does not end the edit first.
    edit.addEventListener('mousedown', event => event.preventDefault())
    edit.addEventListener('click', () => {
      this.handlers.select(id)
      if (view.editing) this.endEdit(view)
      else this.startEdit(view)
    })
    input.addEventListener('keydown', event => {
      if (!view.editing) {
        if (event.key === 'Enter' || event.key === 'F2') this.startEdit(view)
        return
      }
      if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault()
        event.stopPropagation()
        if (this.handlers.redefine(id, input.value)) this.endEdit(view)
      } else if (event.key === 'Escape') {
        event.stopPropagation()
        this.endEdit(view)
      }
    })
    // A key of the on-screen keyboard takes focus for a moment and gives it back; that is not leaving.
    input.addEventListener('blur', event => {
      const next = event.relatedTarget
      if (view.editing && !(next instanceof Element && next.closest('#mathKeyboard'))) this.endEdit(view)
    })
    hide.addEventListener('click', () => this.handlers.toggleVisibility(id))
    remove.addEventListener('click', () => this.handlers.remove(id))
    block.append(input, output, styleButton, edit, hide, remove)
    root.append(block, sliders, settings, style.root, element('hr'))
    const view: CardView = {
      root, input, output, hide, labels, ranges, outputKey: '', settings, bounds, play, edit, styleButton, style,
      styleOpen: false, display: '', editText: null, editing: false,
    }
    this.views.set(id, view)
    return view
  }

  private createStyle(id: ObjectId): StyleView {
    const root = element('div', 'style-settings')
    root.id = `${id}-settings`
    root.hidden = true
    const field = (caption: string, control: HTMLElement) => {
      const wrapper = element('label', 'style-field')
      const text = element('span')
      text.textContent = caption
      wrapper.append(text, control)
      root.append(wrapper)
      return text
    }
    const input = (type: string, name: string) => {
      const control = element('input')
      control.type = type
      control.id = `${id}-${name}`
      return control
    }
    const color = input('color', 'color')
    color.addEventListener('input', () => this.handlers.styleInput(id, { color: color.value }))
    color.addEventListener('change', () => this.handlers.styleCommit())
    field('Renk', color)
    const size = input('range', 'size')
    size.step = '0.1'
    size.addEventListener('input', () => this.handlers.styleInput(id, { size: Number(size.value) }))
    size.addEventListener('change', () => this.handlers.styleCommit())
    const sizeCaption = field('Kalınlık', size)
    const lineStyle = element('select')
    lineStyle.id = `${id}-lineStyle`
    for (const [value, caption, sample] of LINE_STYLES) {
      const option = element('option')
      option.value = value
      option.textContent = `${caption} ${sample}`
      lineStyle.append(option)
    }
    lineStyle.addEventListener('change', () => {
      this.handlers.styleInput(id, { lineStyle: lineStyle.value as LineStyle })
      this.handlers.styleCommit()
    })
    field('Çizgi', lineStyle)
    const opacity = input('range', 'opacity')
    opacity.min = '0.05'
    opacity.max = '1'
    opacity.step = '0.05'
    opacity.addEventListener('input', () => this.handlers.styleInput(id, { opacity: Number(opacity.value) }))
    opacity.addEventListener('change', () => this.handlers.styleCommit())
    field('Saydamlık', opacity)
    const toggles = element('div', 'style-toggles')
    const toggle = (name: string, caption: string, patch: (checked: boolean) => StylePatch) => {
      const wrapper = element('label')
      const control = input('checkbox', name)
      control.addEventListener('change', () => {
        this.handlers.styleInput(id, patch(control.checked))
        this.handlers.styleCommit()
      })
      wrapper.append(control, caption)
      toggles.append(wrapper)
      return control
    }
    const label = toggle('label', 'Etiket', checked => ({ labelVisible: checked }))
    const faces = toggle('faces', 'Yüzler', checked => ({ faces: checked }))
    const edges = toggle('edges', 'Kenarlar', checked => ({ edges: checked }))
    root.append(toggles)
    return { root, color, size, sizeCaption, lineStyle, opacity, label, faces, edges }
  }

  private updateStyle(view: CardView, spec: StyleSpec | null, open: boolean): void {
    const { style } = view
    setIfChanged(view.styleButton, 'hidden', spec === null)
    view.styleButton.setAttribute('aria-pressed', String(open))
    setIfChanged(style.root, 'hidden', !open)
    if (!spec || !open) return
    setIfChanged(style.color, 'value', spec.color)
    setIfChanged(style.size.parentElement!, 'hidden', spec.size === null)
    if (spec.size) {
      setIfChanged(style.sizeCaption, 'textContent', spec.size.caption)
      setIfChanged(style.size, 'min', String(spec.size.min))
      setIfChanged(style.size, 'max', String(spec.size.max))
      setIfChanged(style.size, 'value', String(spec.size.value))
    }
    setIfChanged(style.lineStyle.parentElement!, 'hidden', spec.lineStyle === null)
    if (spec.lineStyle) setIfChanged(style.lineStyle, 'value', spec.lineStyle)
    setIfChanged(style.opacity.parentElement!, 'hidden', spec.opacity === null)
    if (spec.opacity !== null) setIfChanged(style.opacity, 'value', String(spec.opacity))
    setIfChanged(style.label, 'checked', spec.label)
    setIfChanged(style.faces.parentElement!, 'hidden', spec.faces === null)
    setIfChanged(style.faces, 'checked', spec.faces === true)
    setIfChanged(style.edges.parentElement!, 'hidden', spec.edges === null)
    setIfChanged(style.edges, 'checked', spec.edges === true)
  }

  private startEdit(view: CardView): void {
    if (view.editing || view.editText === null) return
    view.editing = true
    view.input.readOnly = false
    view.input.value = view.editText
    view.root.classList.add('is-editing')
    view.input.focus()
    view.input.select()
  }

  private endEdit(view: CardView): void {
    view.editing = false
    view.input.readOnly = true
    view.input.value = view.display
    view.root.classList.remove('is-editing')
  }

  private update(view: CardView, entry: PanelEntry, active: boolean): void {
    const { card } = entry
    view.display = card.input
    view.editText = entry.editText
    view.edit.hidden = entry.editText === null
    // The text being typed is left alone until the edit ends.
    if (!view.editing) setIfChanged(view.input, 'value', card.input)
    const outputKey = card.output.join('\n')
    if (view.outputKey !== outputKey) {
      view.output.replaceChildren(...card.output.flatMap((line, index) => index ? [element('br'), line] : [line]))
      view.outputKey = outputKey
    }
    // Nothing to show below the definition: the card is a single row.
    setIfChanged(view.output, 'hidden', card.output.length === 0)
    view.root.classList.toggle('value-first', card.valueFirst)
    view.root.classList.toggle('is-active', active)
    if (!active) view.styleOpen = false
    this.updateStyle(view, entry.style, view.styleOpen && active)
    view.hide.title = entry.visible ? 'Gizle' : 'Göster'
    view.hide.hidden = entry.style === null
    view.hide.style.background = entry.visible ? entry.color : 'transparent'
    // A parameter's slider is its main control and stays visible; others show when selected.
    const pinned = card.parameter !== undefined
    view.ranges.forEach((range, index) => {
      const spec = card.sliders[index]
      const label = view.labels[index]!
      const hidden = !spec || !(active || pinned)
      setIfChanged(range, 'hidden', hidden)
      setIfChanged(label, 'hidden', hidden || !spec?.label)
      if (!spec) return
      range.dataset.field = spec.field
      // Bounds before value, so the browser does not clamp the value to stale bounds.
      setIfChanged(range, 'min', String(spec.min))
      setIfChanged(range, 'max', String(spec.max))
      setIfChanged(range, 'step', String(spec.step))
      setIfChanged(range, 'value', String(spec.value))
      setIfChanged(label, 'textContent', spec.label)
    })
    setIfChanged(view.play, 'hidden', !card.playable || !active)
    if (card.playable) {
      const label = entry.animating ? 'Durdur' : 'Oynat'
      setIfChanged(view.play, 'title', label)
      setIfChanged(view.play, 'textContent', entry.animating ? '⏸' : '▶')
      view.play.setAttribute('aria-label', label)
    }
    const settings = card.parameter
    setIfChanged(view.settings, 'hidden', !settings || !active)
    if (settings) {
      view.bounds.forEach((bound, index) => {
        // Do not overwrite a bound while it is being typed.
        if (document.activeElement !== bound) setIfChanged(bound, 'value', String(settings[BOUND_FIELDS[index]![0]]))
      })
    }
  }
}
