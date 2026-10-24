export interface ObjectControlsState {
  /** Side count of the selected prism/pyramid, or of the next one the tool builds. */
  sides: number | null
  /** Opening angle of the selected solid in degrees, with its maximum. */
  unfold: { value: number; max: number } | null
  /** The selected solid's net is playing. */
  playing?: boolean
}

export interface ObjectControlsHandlers {
  onSides(value: number): void
  onUnfold(value: number): void
  /** The slider was released: the change is one history step. */
  onCommit(): void
  /** Start or stop playing the selected solid's net. */
  onPlay?(): void
}

export interface ObjectControls {
  show(state: ObjectControlsState): void
}

/** The floating panel with the side count and opening sliders. */
export function createObjectControls(handlers: ObjectControlsHandlers): ObjectControls {
  const panel = document.getElementById('objectControls')!
  const sideControl = document.getElementById('sideControl')!
  const sideSlider = document.getElementById('sideSlider') as HTMLInputElement
  const sideValue = document.getElementById('sideValue')!
  const unfoldControl = document.getElementById('unfoldControl')!
  const unfoldSlider = document.getElementById('unfoldSlider') as HTMLInputElement
  const unfoldValue = document.getElementById('unfoldValue')!
  const play = document.getElementById('unfoldPlay') as HTMLButtonElement | null
  play?.addEventListener('click', () => handlers.onPlay?.())

  // While a slider is dragged, refreshes must not move it under the finger.
  let adjusting: HTMLInputElement | null = null
  sideSlider.addEventListener('input', () => {
    adjusting = sideSlider
    sideValue.textContent = sideSlider.value
    handlers.onSides(Number(sideSlider.value))
  })
  unfoldSlider.addEventListener('input', () => {
    adjusting = unfoldSlider
    unfoldValue.textContent = unfoldSlider.value
    handlers.onUnfold(Number(unfoldSlider.value))
  })
  for (const slider of [sideSlider, unfoldSlider]) {
    slider.addEventListener('change', () => {
      adjusting = null
      handlers.onCommit()
    })
  }

  return {
    show({ sides, unfold, playing }) {
      if (play) {
        play.textContent = playing ? '⏸' : '▶'
        play.title = playing ? 'Durdur' : 'Oynat'
        play.setAttribute('aria-label', play.title)
      }
      sideControl.hidden = sides === null
      unfoldControl.hidden = unfold === null
      panel.hidden = sides === null && unfold === null
      if (sides !== null && adjusting !== sideSlider) {
        sideSlider.value = String(sides)
        sideValue.textContent = String(sides)
      }
      if (unfold) {
        unfoldSlider.max = String(Math.ceil(unfold.max - 1e-9))
        if (adjusting !== unfoldSlider) {
          unfoldSlider.value = String(Math.round(unfold.value))
          unfoldValue.textContent = String(Math.round(unfold.value))
        }
      }
    },
  }
}
