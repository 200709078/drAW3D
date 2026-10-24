export interface FrameClock {
  request(callback: FrameRequestCallback): number
  cancel(handle: number): void
}

/** Coalesce changes into one paint; changes made during paint get a later frame. */
export function createFrameRenderer(paint: () => void, clock: FrameClock = {
  request: callback => requestAnimationFrame(callback),
  cancel: handle => cancelAnimationFrame(handle),
}): { request(): void; dispose(): void } {
  let pending: number | null = null
  let disposed = false
  return {
    request() {
      if (disposed || pending !== null) return
      pending = clock.request(() => {
        pending = null
        if (!disposed) paint()
      })
    },
    dispose() {
      disposed = true
      if (pending !== null) clock.cancel(pending)
      pending = null
    },
  }
}
