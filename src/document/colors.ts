import type { PointKind } from '../geometry/types'

export const POINT_COLORS: Readonly<Record<PointKind, string>> = {
  free: '#0066ff',
  on: '#0b6b3a',
  height: '#800080',
  vertex: '#808080',
}

export const SELECTED_COLOR = '#ffaa00'

/** A random color darkened by a quarter, so it stays readable on the light background. */
export function randomColor(random: () => number = Math.random): string {
  let color = '#'
  for (let channel = 0; channel < 3; channel++) {
    const value = Math.round(Math.floor(random() * 256) * 0.75)
    color += value.toString(16).padStart(2, '0')
  }
  return color
}
