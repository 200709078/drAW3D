import { PLACEHOLDER, matchingTemplates, type LanguageEntry } from '../commands/language'

const MAX_SUGGESTIONS = 8
const MIN_PREFIX = 2
/** The command name being typed: letters just before the cursor, not yet followed by '('. */
const NAME_BEFORE_CURSOR = /[\p{L}_][\p{L}\p{N}_]*$/u

export interface CommandTemplates {
  /** The first unfilled `<Placeholder>`, selected for typing; null when there is none. */
  selectUnfilled(): string | null
}

/**
 * Command suggestions while a command name is typed. Accepting one inserts its template
 * and selects the first `<Placeholder>`; Tab moves to the next. Registered before the
 * input's own key handling, so Enter accepts a suggestion instead of submitting.
 */
export function bindCommandTemplates(input: HTMLInputElement): CommandTemplates {
  const box = document.createElement('div')
  box.id = 'commandSuggestions'
  box.className = 'command-suggestions'
  box.setAttribute('role', 'listbox')
  box.hidden = true
  input.insertAdjacentElement('afterend', box)
  input.setAttribute('aria-autocomplete', 'list')
  input.setAttribute('aria-controls', box.id)

  let matches: LanguageEntry[] = []
  let highlighted = 0
  let token: { start: number; end: number } | null = null

  function hide(): void {
    matches = []
    box.hidden = true
  }

  function typedName(): { start: number; end: number; text: string } | null {
    const cursor = input.selectionStart
    if (cursor === null || cursor !== input.selectionEnd) return null
    const name = input.value.slice(0, cursor).match(NAME_BEFORE_CURSOR)
    const next = input.value[cursor]
    if (!name || (next !== undefined && /[\p{L}\p{N}_(]/u.test(next))) return null
    return { start: cursor - name[0].length, end: cursor, text: name[0] }
  }

  function render(): void {
    if (!matches.length) {
      box.hidden = true
      return
    }
    box.replaceChildren(...matches.map((entry, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'command-suggestion'
      button.setAttribute('role', 'option')
      button.setAttribute('aria-selected', String(index === highlighted))
      const template = document.createElement('span')
      template.textContent = entry.syntax
      const topic = document.createElement('small')
      topic.textContent = entry.topic
      button.append(template, topic)
      // Keep focus in the input while choosing.
      button.addEventListener('mousedown', event => event.preventDefault())
      button.addEventListener('click', () => accept(entry))
      return button
    }))
    box.hidden = false
  }

  function update(): void {
    const name = typedName()
    token = name
    highlighted = 0
    matches = name && name.text.length >= MIN_PREFIX ? matchingTemplates(name.text).slice(0, MAX_SUGGESTIONS) : []
    render()
  }

  /** Select the first placeholder at or after `from`, wrapping around. */
  function selectPlaceholder(from: number): string | null {
    const all = [...input.value.matchAll(PLACEHOLDER)]
    const next = all.find(match => match.index! >= from) ?? all[0]
    if (!next) return null
    input.setSelectionRange(next.index!, next.index! + next[0].length)
    return next[0]
  }

  function accept(entry: LanguageEntry): void {
    const range = token ?? { start: input.selectionStart ?? input.value.length, end: input.selectionEnd ?? input.value.length }
    input.value = input.value.slice(0, range.start) + entry.syntax + input.value.slice(range.end)
    hide()
    input.focus()
    if (!selectPlaceholder(range.start)) input.setSelectionRange(range.start + entry.syntax.length, range.start + entry.syntax.length)
  }

  input.addEventListener('keydown', event => {
    if (event.isComposing || event.keyCode === 229) return
    const consume = () => {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    if (matches.length) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        consume()
        highlighted = (highlighted + (event.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length
        render()
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        consume()
        accept(matches[highlighted]!)
      } else if (event.key === 'Escape') {
        consume()
        hide()
      } else {
        // Bracket pairing changes the value without an input event. Microtasks run between
        // listeners, so wait for the next task, after the input's own key handling.
        window.setTimeout(update)
      }
      return
    }
    // Tab walks through the template's placeholders.
    if (event.key === 'Tab' && !event.shiftKey && input.value.match(PLACEHOLDER)) {
      consume()
      selectPlaceholder(input.selectionEnd ?? 0)
    }
  })
  input.addEventListener('input', update)
  input.addEventListener('blur', hide)
  document.addEventListener('click', event => {
    if (event.target !== input && !(event.target instanceof Element && event.target.closest('#commandSuggestions'))) hide()
  })

  return {
    selectUnfilled() {
      input.focus()
      return selectPlaceholder(0)
    },
  }
}
