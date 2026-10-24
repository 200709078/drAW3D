const TOAST_DURATION_MS = 2800

export type ShowToast = (title: string, message?: string) => void

/** Bind the status toast. A single "Başlık|Mesaj" string is split at the first bar. */
export function createToast(): ShowToast {
  const toast = document.getElementById('snackbar')
  const title = document.getElementById('snackTitle')
  const content = document.getElementById('snackContent')
  let timer: number | undefined

  return (heading, message = '') => {
    if (!toast || !title || !content || (!heading && !message)) return
    let text = message
    if (!text && heading.includes('|')) {
      const [first = '', ...rest] = heading.split('|')
      heading = first
      text = rest.join('|')
    }
    title.textContent = heading.toLocaleUpperCase('tr-TR')
    content.textContent = text
    toast.classList.add('show', 'is-visible')
    window.clearTimeout(timer)
    timer = window.setTimeout(() => toast.classList.remove('show', 'is-visible'), TOAST_DURATION_MS)
  }
}
