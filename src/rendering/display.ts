/** The screen the app is used on; chosen in the view menu, `auto` guesses it. */
export type DisplayMode = 'auto' | 'desktop' | 'mobile' | 'board'
export type DisplayKind = Exclude<DisplayMode, 'auto'>

export const DISPLAY_MODES: readonly [DisplayMode, string][] = [
  ['auto', 'Otomatik'], ['desktop', 'Bilgisayar'], ['mobile', 'Telefon / tablet'], ['board', 'Akıllı tahta'],
]

export const DISPLAY_NAMES: Readonly<Record<DisplayKind, string>> = {
  desktop: 'Bilgisayar', mobile: 'Telefon / tablet', board: 'Akıllı tahta',
}

/** What the browser tells about the screen (CSS pixels). */
export interface DeviceInfo {
  /** The primary pointer is a finger (no mouse or touchpad). */
  coarse: boolean
  /** Shorter and longer side of the screen. */
  shortSide: number
  longSide: number
  devicePixelRatio: number
}

/** How the scene and the interface are drawn on a kind of screen. */
export interface DisplayProfile {
  kind: DisplayKind
  /** Drawing-buffer pixels per CSS pixel, at most the screen's own ratio. */
  pixelRatio: number
  shadowMapSize: number
  /** Size of the interface (CSS zoom of the page); 1 keeps the desktop layout. */
  uiScale: number
  /** Points, lines and drag arrows in the scene. */
  sceneScale: number
  /** Width of edge lines in drawing-buffer pixels; 1 is the thin line of the desktop look. */
  edgeWidth: number
}

/** Touch screens shorter than this (CSS px) are phones and tablets; larger ones may be boards. */
const MOBILE_SHORT_SIDE = 900

/**
 * The guess for `auto`. A smart board is a large touch screen, but so is a big tablet or a
 * touch monitor, so a board is never assumed: `boardLikely` only suggests choosing it.
 */
export function detectDisplay(device: DeviceInfo): { kind: DisplayKind; boardLikely: boolean } {
  if (device.coarse && device.shortSide < MOBILE_SHORT_SIDE) return { kind: 'mobile', boardLikely: false }
  return { kind: 'desktop', boardLikely: device.coarse }
}

export function displayProfile(mode: DisplayMode, device: DeviceInfo): DisplayProfile {
  const kind = mode === 'auto' ? detectDisplay(device).kind : mode
  const ratio = Math.max(1, device.devicePixelRatio || 1)
  switch (kind) {
    // Today's look: sharp up to twice the CSS resolution, full shadows.
    case 'desktop': return { kind, pixelRatio: Math.min(ratio, 2), shadowMapSize: 2048, uiScale: 1, sceneScale: 1, edgeWidth: 1 }
    // A phone's 3× screen drawn at 1.5×: little visible difference, far less heat and battery.
    case 'mobile': return { kind, pixelRatio: Math.min(ratio, 1.5), shadowMapSize: 1024, uiScale: 1, sceneScale: 1, edgeWidth: 1.5 }
    // Seen from across the room: larger controls, thicker lines; a 4K panel drawn at most at 1.5×.
    case 'board': {
      const pixelRatio = Math.min(ratio, 1.5)
      return { kind, pixelRatio, shadowMapSize: 2048, uiScale: 1.4, sceneScale: 1.6, edgeWidth: 2.5 * pixelRatio }
    }
  }
}

export function isDisplayMode(value: unknown): value is DisplayMode {
  return DISPLAY_MODES.some(([mode]) => mode === value)
}
