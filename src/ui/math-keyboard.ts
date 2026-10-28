import { LANGUAGE, PLACEHOLDER } from '../commands/language'

/** Text inserted at the cursor; `caret` counts back from its end, e.g. inside `sin()`. */
interface TextKey {
  label: string
  text: string
  caret?: number
  title?: string
  wide?: boolean
  /** A letter, written as a capital while Shift is on. */
  letter?: boolean
}

/** Capitals: pressed once for the next letter, twice to keep them, a third time to stop. */
interface ShiftKey {
  label: string
  shift: true
  title: string
  wide?: boolean
}

/** Keys that act like the physical key of the same name on the command input. */
interface ActionKey {
  label: string
  key: 'Backspace' | 'ArrowLeft' | 'ArrowRight' | 'Tab' | 'Enter'
  title: string
  wide?: boolean
}

type Key = TextKey | ActionKey | ShiftKey

interface KeyboardTab {
  id: string
  label: string
  rows: Key[][]
}

const call = (name: string, label = name): TextKey => ({ label, text: `${name}()`, caret: 1 })
const text = (label: string, value = label, title?: string): TextKey => ({ label, text: value, ...(title ? { title } : {}) })

const ACTIONS: ActionKey[] = [
  { label: '⌫', key: 'Backspace', title: 'Sil' },
  { label: '←', key: 'ArrowLeft', title: 'Sola' },
  { label: '→', key: 'ArrowRight', title: 'Sağa' },
  { label: '⇥', key: 'Tab', title: 'Sonraki alan' },
  { label: '⏎', key: 'Enter', title: 'Gönder', wide: true },
]

const SHIFT: ShiftKey = { label: '⇧', shift: true, title: 'Büyük/Küçük harf' }

// Turkish Q layout; Shift starts the last row as on a physical keyboard.
const LETTERS: Key[][] = ['qwertyuıopğü', 'asdfghjklşi', 'zxcvbnmöç'].map((row, index) => [
  ...(index === 2 ? [SHIFT] : []),
  ...[...row].map(letter => ({ ...text(letter), letter: true })),
])

type ShiftState = 'off' | 'once' | 'locked'

const TABS: KeyboardTab[] = [
  {
    id: 'numbers', label: '123', rows: [
      // '(' pairs like the physical key does on the command input.
      [text('7'), text('8'), text('9'), text('÷', '/', 'Bölme'), { label: '(', text: '()', caret: 1 }, text(')'), text('x²', '^2', 'Kare')],
      [text('4'), text('5'), text('6'), text('×', '*', 'Çarpma'), text('xʸ', '^', 'Üs'), text('A'), text('B')],
      [text('1'), text('2'), text('3'), text('−', '-', 'Çıkarma'), { label: '√', text: 'sqrt()', caret: 1, title: 'Karekök' },
        text('π', 'pi', 'Pi'), text('C')],
      [text('0'), text('.'), text(','), text('+'), text('='), text('e', 'e', 'Euler sayısı'), text('a')],
      ACTIONS,
    ],
  },
  {
    id: 'functions', label: 'f(x)', rows: [
      [call('sin'), call('cos'), call('tan'), call('cot'), { label: 'log', text: 'log(,)', caret: 2, title: 'log(taban, değer)' },
        { label: 'ln', text: 'log(e,)', caret: 1, title: 'Doğal logaritma' }],
      [call('asin'), call('acos'), call('atan'), call('exp'), { label: '|x|', text: 'abs()', caret: 1, title: 'Mutlak değer' },
        { label: 'ⁿ√', text: 'nthRoot(,)', caret: 2, title: 'n. dereceden kök' }],
      [call('min'), call('max'), call('round'), call('sign'), call('floor', '⌊x⌋'), call('ceil', '⌈x⌉')],
      ACTIONS,
    ],
  },
  { id: 'letters', label: 'abc', rows: [...LETTERS, [text('_'), text(':'), ...ACTIONS]] },
  {
    id: 'commands', label: 'Komutlar',
    // The full template tells signatures of the same command apart (Çember has three).
    rows: [[...new Map(LANGUAGE.filter(entry => entry.command).map(entry =>
      [entry.syntax, { label: entry.syntax.replace(/[<>]/g, ''), text: entry.syntax, title: entry.syntax } satisfies TextKey])).values()]],
  },
]

export interface MathKeyboard {
  readonly isOpen: boolean
  /** The field the keys type into: the command input unless another field took focus. */
  readonly target: HTMLInputElement
  setOpen(open: boolean): void
  /** Back to the command input and the side panel, e.g. when the help popup closes. */
  release(): void
}

/** Text fields the keyboard serves: plain inputs, not checkboxes, sliders, colors or files. */
const TYPEABLE = new Set(['text', 'search', 'number'])

function typeable(element: EventTarget | null): element is HTMLInputElement {
  return element instanceof HTMLInputElement && TYPEABLE.has(element.type) && !element.readOnly && !element.disabled
}

/**
 * A touch screen, also one whose primary pointer is a mouse: smart boards often report their
 * touch frame as a secondary pointer, and some only as touch points.
 */
function touchScreen(): boolean {
  return window.matchMedia('(any-pointer: coarse)').matches || navigator.maxTouchPoints > 0
}

/**
 * The app's own on-screen keyboard, used instead of the system one (which a full-screen window
 * hides on Pardus boards). It serves whichever text field has focus — the command input, a card
 * being edited, a question dialog, the help search — and moves into a modal dialog or the help
 * popup while one of their fields is in use, since those cover the side panel. It inserts at the
 * cursor (replacing a selected template placeholder), and its action keys send the same key
 * events as a physical keyboard, so suggestions, placeholders and submitting behave identically.
 */
export function createMathKeyboard(commandInput: HTMLInputElement, panel: HTMLElement, toggle: HTMLButtonElement): MathKeyboard {
  let input = commandInput
  let host = panel
  /** The field where the user last closed the keyboard; touch focus there does not reopen it. */
  let closedOn: HTMLInputElement | null = null
  const keyboard = document.createElement('div')
  keyboard.id = 'mathKeyboard'
  keyboard.className = 'math-keyboard'
  keyboard.setAttribute('role', 'group')
  keyboard.setAttribute('aria-label', 'Matematik klavyesi')
  keyboard.hidden = true

  const tabBar = document.createElement('div')
  tabBar.className = 'math-keyboard-tabs'
  tabBar.setAttribute('role', 'tablist')
  const pages = new Map<string, HTMLElement>()
  const tabs = new Map<string, HTMLButtonElement>()
  const letters: { button: HTMLButtonElement; key: TextKey }[] = []
  const shiftButtons: HTMLButtonElement[] = []
  let shift: ShiftState = 'off'

  /** Letter keys show what they write: capitals in Turkish (i → İ, ı → I) while Shift is on. */
  const setShift = (state: ShiftState) => {
    shift = state
    for (const { button, key } of letters) {
      const label = state === 'off' ? key.label : key.label.toLocaleUpperCase('tr-TR')
      button.textContent = label
      button.title = label
      button.setAttribute('aria-label', label)
    }
    for (const button of shiftButtons) {
      button.classList.toggle('is-active', state !== 'off')
      button.classList.toggle('is-locked', state === 'locked')
      button.setAttribute('aria-pressed', String(state !== 'off'))
    }
  }

  const showTab = (id: string) => {
    for (const [tabId, page] of pages) {
      page.hidden = tabId !== id
      tabs.get(tabId)!.setAttribute('aria-selected', String(tabId === id))
    }
  }

  /** Number inputs have no selection API; the caret then stays at the end. */
  function select(start: number, end = start): void {
    try {
      input.setSelectionRange(start, end)
    } catch {
      // ignore
    }
  }

  function insert(typed: TextKey): void {
    const capital = typed.letter === true && shift !== 'off'
    const key = capital ? { ...typed, text: typed.text.toLocaleUpperCase('tr-TR') } : typed
    if (capital && shift === 'once') setShift('off')
    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? start
    // ')' steps over the one the '(' key already added, like the physical key on the command input.
    if (key.text === ')' && start === end && input.value[start] === ')') {
      select(start + 1)
      return
    }
    input.value = input.value.slice(0, start) + key.text + input.value.slice(end)
    // A template selects its first placeholder; other text leaves the caret inside it.
    const placeholder = [...key.text.matchAll(PLACEHOLDER)][0]
    if (placeholder) {
      select(start + placeholder.index!, start + placeholder.index! + placeholder[0].length)
    } else {
      select(start + key.text.length - (key.caret ?? 0))
    }
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }

  function act(key: ActionKey): void {
    const event = new KeyboardEvent('keydown', { key: key.key, bubbles: true, cancelable: true })
    const handled = !input.dispatchEvent(event)
    if (handled) return
    // Keys the input does not handle itself are edited here.
    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? start
    if (key.key === 'Backspace') {
      const from = start === end ? Math.max(0, start - 1) : start
      input.value = input.value.slice(0, from) + input.value.slice(end)
      select(from)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    } else if (key.key === 'ArrowLeft' || key.key === 'ArrowRight') {
      const caret = key.key === 'ArrowLeft'
        ? (start === end ? Math.max(0, start - 1) : start)
        : (start === end ? Math.min(input.value.length, end + 1) : end)
      select(caret)
    } else if (key.key === 'Enter' && input.form) {
      // A dialog's field submits with its first button (Tamam), as Enter on a physical keyboard does.
      input.form.requestSubmit(input.form.querySelector<HTMLButtonElement>('button[type="submit"]'))
    }
  }

  /** Type into `field` from now on; the keyboard follows it into a dialog or the help popup. */
  function attach(field: HTMLInputElement): void {
    if (field === input && hostFor(field).contains(keyboard)) return
    const open = !keyboard.hidden
    if (open) input.removeAttribute('inputmode')
    input = field
    host = hostFor(field)
    const embedded = host !== panel
    keyboard.classList.toggle('is-embedded', embedded)
    // In the help popup it goes right below the search field, above the long topic list.
    const searchRow = field.closest('.help-search')
    if (searchRow) searchRow.after(keyboard)
    else host.append(keyboard)
    panel.classList.toggle('has-keyboard', open && !embedded)
    if (open) input.inputMode = 'none'
    // A closed dialog takes the keyboard with it; give it back to the command input.
    const dialog = field.closest('dialog')
    dialog?.addEventListener('close', () => {
      if (input === field) attach(commandInput)
    }, { once: true })
  }

  function hostFor(field: HTMLInputElement): HTMLElement {
    return field.closest<HTMLElement>('dialog form, .help-content') ?? panel
  }

  /** A card that stopped editing, a closed popup or a removed field leaves the command input. */
  function ensureTarget(): void {
    const popup = input.closest<HTMLElement>('.help-popup')
    if (!input.isConnected || input.readOnly || input.disabled || (popup && popup.style.display !== 'flex')) {
      attach(commandInput)
    }
  }

  for (const tab of TABS) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'math-keyboard-tab'
    button.id = `keyboardtab-${tab.id}`
    button.setAttribute('role', 'tab')
    button.textContent = tab.label
    button.addEventListener('click', () => showTab(tab.id))
    tabs.set(tab.id, button)
    tabBar.append(button)

    const page = document.createElement('div')
    page.className = `math-keyboard-page math-keyboard-${tab.id}`
    page.setAttribute('role', 'tabpanel')
    for (const row of tab.rows) {
      const line = document.createElement('div')
      line.className = 'math-keyboard-row'
      for (const key of row) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'math-key'
        if (key.wide) button.classList.add('is-wide')
        if ('key' in key) button.classList.add('is-action')
        button.textContent = key.label
        button.title = key.title ?? key.label
        button.setAttribute('aria-label', button.title)
        if ('shift' in key) {
          button.classList.add('is-action', 'is-shift')
          shiftButtons.push(button)
        } else if (!('key' in key) && key.letter) {
          letters.push({ button, key })
        }
        button.addEventListener('click', () => {
          ensureTarget()
          input.focus()
          if ('shift' in key) setShift(shift === 'off' ? 'once' : shift === 'once' ? 'locked' : 'off')
          else if ('key' in key) act(key)
          else insert(key)
        })
        line.append(button)
      }
      page.append(line)
    }
    pages.set(tab.id, page)
    keyboard.append(page)
  }
  keyboard.prepend(tabBar)
  // Pressing a key must not move focus out of the input, or its selection would be lost.
  keyboard.addEventListener('pointerdown', event => event.preventDefault())
  keyboard.addEventListener('mousedown', event => event.preventDefault())
  setShift('off')
  showTab('numbers')
  host.append(keyboard)

  const api: MathKeyboard = {
    get isOpen() { return !keyboard.hidden },
    get target() { return input },
    setOpen(open) {
      if (open) ensureTarget()
      else closedOn = input
      keyboard.hidden = !open
      panel.classList.toggle('has-keyboard', open && host === panel)
      toggle.setAttribute('aria-pressed', String(open))
      toggle.title = open ? 'Matematik klavyesini kapat' : 'Matematik klavyesi'
      // The on-screen keyboard replaces the system one while it is open.
      if (open) input.inputMode = 'none'
      else input.removeAttribute('inputmode')
    },
    release() {
      attach(commandInput)
    },
  }

  toggle.addEventListener('mousedown', event => event.preventDefault())
  toggle.addEventListener('click', () => {
    // The button sits by the command input: it opens the keyboard for that input.
    if (!api.isOpen) attach(commandInput)
    api.setOpen(!api.isOpen)
    input.focus()
  })
  // On a touch screen a field's focus opens the keyboard, unless the user closed it in that field.
  const offer = (field: EventTarget | null) => {
    if (!typeable(field) || keyboard.contains(field)) return
    attach(field)
    if (!api.isOpen && field !== closedOn && touchScreen()) api.setOpen(true)
  }
  document.addEventListener('focusin', event => offer(event.target))
  // A card's field is focused while read-only (the first click of a double click) and only then
  // becomes editable, without a new focus event.
  new MutationObserver(records => {
    if (records.some(record => record.target === document.activeElement)) offer(document.activeElement)
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['readonly'] })
  return api
}
