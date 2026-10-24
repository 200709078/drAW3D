import { expect, test } from '@playwright/test'
import { createFrameRenderer, type FrameClock } from '../src/rendering/frame-renderer'

function frameClock() {
  const pending = new Map<number, FrameRequestCallback>()
  let next = 0
  const clock: FrameClock = {
    request(callback) { pending.set(++next, callback); return next },
    cancel(handle) { pending.delete(handle) },
  }
  return {
    clock,
    pending,
    advance() {
      const callbacks = [...pending.values()]
      pending.clear()
      for (const callback of callbacks) callback(0)
    },
  }
}

test('aynı karedeki talepler birleşir, boyama sırasında gelen değişiklik sonraki kareye kalır', () => {
  const frames = frameClock()
  let paints = 0
  const renderer = createFrameRenderer(() => {
    paints++
    if (paints === 1) renderer.request()
  }, frames.clock)
  for (let index = 0; index < 100; index++) renderer.request()
  expect(frames.pending.size).toBe(1)
  frames.advance()
  expect(paints).toBe(1)
  expect(frames.pending.size).toBe(1)
  frames.advance()
  expect(paints).toBe(2)
  renderer.request()
  renderer.dispose()
  renderer.request()
  frames.advance()
  expect(paints).toBe(2)
})
