import { PLACEHOLDER } from '../commands/language'

const PAIRS: Readonly<Record<string, string>> = { '(': ')', '[': ']', '{': '}' }
const CLOSING = new Set(Object.values(PAIRS))

/**
 * Insert the closing bracket around the selection; typing a closing bracket steps over the one
 * already there (otherwise `sin(x)` typed key by key became `sin(x))`); Backspace removes an empty pair.
 */
function handleBrackets(event: KeyboardEvent, input: HTMLInputElement): void {
  const start = input.selectionStart ?? input.value.length
  const end = input.selectionEnd ?? start
  const value = input.value
  const close = PAIRS[event.key]
  if (close) {
    event.preventDefault()
    // A selected template placeholder is replaced, not wrapped.
    const selected = value.slice(start, end)
    const inner = new RegExp(`^${PLACEHOLDER.source}$`, 'u').test(selected) ? '' : selected
    input.value = value.slice(0, start) + event.key + inner + close + value.slice(end)
    input.setSelectionRange(start + 1, start + 1 + inner.length)
    return
  }
  if (CLOSING.has(event.key) && start === end && value[start] === event.key) {
    event.preventDefault()
    input.setSelectionRange(start + 1, start + 1)
    return
  }
  if (event.key === 'Backspace' && start === end) {
    const previous = value[start - 1]
    if (previous !== undefined && PAIRS[previous] !== undefined && value[start] === PAIRS[previous]) {
      event.preventDefault()
      input.value = value.slice(0, start - 1) + value.slice(start + 1)
      input.setSelectionRange(start - 1, start - 1)
    }
  }
}

/**
 * Enter submits non-empty text; IME composition and modified keys keep their native meaning.
 * Text that still has a template placeholder is not submitted: `incomplete` reports it.
 */
export function bindCommandInput(input: HTMLInputElement, submit: (source: string) => void,
  incomplete: () => void = () => undefined): void {
  input.addEventListener('keydown', event => {
    // keyCode 229 marks composition in browsers that do not set isComposing.
    if (event.isComposing || event.keyCode === 229) return
    if (event.ctrlKey || event.metaKey || event.altKey) return
    handleBrackets(event, input)
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (!input.value.trim()) return
    if (input.value.match(PLACEHOLDER)) {
      incomplete()
      return
    }
    submit(input.value)
    input.value = ''
  })
}
