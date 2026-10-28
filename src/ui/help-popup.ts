import { HELP_TOPICS, LANGUAGE } from '../commands/language'

const normalize = (text: string) => text.trim().toLocaleLowerCase('tr-TR')

export interface HelpPopupOptions {
  input: HTMLInputElement
  /** An example was chosen: make the command input visible and focus it. */
  onExample(command: string): void
  /** The popup closed (the on-screen keyboard leaves its search field). */
  onClose?(): void
}

/** Topics and examples from the language table, as H4 headings followed by their entries. */
function renderTopics(section: HTMLElement): void {
  for (const topic of HELP_TOPICS) {
    const entries = LANGUAGE.filter(entry => entry.topic === topic.title)
    const heading = document.createElement('h4')
    heading.textContent = topic.title
    section.append(heading)
    if (topic.note) {
      const note = document.createElement('h6')
      note.textContent = topic.note
      section.append(note)
    }
    for (const entry of entries) {
      const block = document.createElement('pre')
      if (entry.syntax) block.append(entry.syntax, '\n')
      for (const example of entry.examples) {
        const code = document.createElement('code')
        code.className = 'example'
        code.textContent = example
        block.append(code)
      }
      section.append(block)
    }
  }
}

/** The help popup renders its topics and turns them into searchable accordions on first open. */
export function createHelpPopup({ input, onExample, onClose }: HelpPopupOptions): { open(): void; close(): void } {
  const popup = document.getElementById('help-popup')
  const header = document.getElementById('help-header')
  const section = document.querySelector<HTMLElement>('.help-section')
  let search: HTMLInputElement | null = null
  if (section) renderTopics(section)

  const close = () => {
    if (popup) popup.style.display = 'none'
    onClose?.()
  }

  function filter(query: string): void {
    const normalized = normalize(query)
    for (const topic of document.querySelectorAll<HTMLDetailsElement>('.help-topic')) {
      const matches = !normalized || normalize(topic.textContent ?? '').includes(normalized)
      topic.hidden = !matches
      if (normalized && matches) topic.open = true
    }
  }

  function buildAccordion(): void {
    if (!popup || !header || !section || search) return
    const wrap = document.createElement('div')
    wrap.className = 'help-search'
    search = document.createElement('input')
    search.id = 'helpSearch'
    search.type = 'search'
    search.placeholder = 'Komut ara...'
    search.autocomplete = 'off'
    search.addEventListener('input', () => filter(search!.value))
    wrap.append(search)
    header.after(wrap)

    section.classList.add('is-accordion-ready')
    const titles = Array.from(section.children).filter(child => child.tagName === 'H4')
    titles.forEach((title, index) => {
      const details = document.createElement('details')
      details.className = 'help-topic'
      details.open = index === 0
      const summary = document.createElement('summary')
      summary.textContent = title.textContent
      const body = document.createElement('div')
      body.className = 'help-topic-body'
      for (let next = title.nextElementSibling; next && next.tagName !== 'H4';) {
        const current = next
        next = next.nextElementSibling
        body.append(current)
      }
      details.append(summary, body)
      title.replaceWith(details)
    })
    popup.addEventListener('click', event => {
      if (event.target === popup) close()
    })
  }

  function open(): void {
    buildAccordion()
    if (popup) popup.style.display = 'flex'
    input.value = ''
    if (search) {
      search.value = ''
      filter('')
      search.focus()
    }
  }

  document.querySelector('.help-close')?.addEventListener('click', close)
  for (const example of document.querySelectorAll('.example')) {
    example.addEventListener('click', () => {
      close()
      onExample(example.textContent?.trim() ?? '')
    })
  }

  return { open, close }
}
