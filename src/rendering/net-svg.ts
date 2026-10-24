import type { NetSheet, Point2 } from '../geometry/net-sheet'

/** A4 portrait in millimetres. */
export const PAGE = { width: 210, height: 297 }
const MARGIN = 10
/** Room under the drawing for the caption. */
const CAPTION = 14
/** One unit of the scene is one centimetre on paper. */
export const MM_PER_UNIT = 10

export interface SheetLayout {
  /** Millimetres per unit: 10 at full scale, less when the net was shrunk to fit. */
  scale: number
  /** Turn of the net on the page, degrees. */
  rotation: number
  place(point: Point2): Point2
}

function sheetPoints(sheet: NetSheet): Point2[] {
  return [...sheet.faces.flat(), ...sheet.cuts.flat(), ...sheet.tabs.flat()]
}

const turn = (point: Point2, radians: number): Point2 => ({
  x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
  y: point.x * Math.sin(radians) + point.y * Math.cos(radians),
})

/**
 * Fit the net on the page at full scale, turning it when that helps; a net too large for
 * any turn is shrunk as little as possible (the caption says so).
 */
export function layoutSheet(sheet: NetSheet): SheetLayout {
  const points = sheetPoints(sheet)
  const width = PAGE.width - 2 * MARGIN
  const height = PAGE.height - 2 * MARGIN - CAPTION
  const turns = [0, 90, ...Array.from({ length: 34 }, (_, index) => 5 * (index + 1)).filter(angle => angle !== 90)]
  let best: { scale: number; rotation: number; minX: number; minY: number; spanX: number; spanY: number } | null = null
  for (const rotation of turns) {
    const turned = points.map(point => turn(point, rotation * Math.PI / 180))
    const xs = turned.map(point => point.x)
    const ys = turned.map(point => point.y)
    const [minX, minY] = [Math.min(...xs), Math.min(...ys)]
    const [spanX, spanY] = [Math.max(...xs) - minX, Math.max(...ys) - minY]
    const scale = Math.min(MM_PER_UNIT, width / Math.max(spanX, 1e-9), height / Math.max(spanY, 1e-9))
    // Only a strictly better fit turns the net away from 0° or 90°.
    if (!best || scale > best.scale + 1e-9) best = { scale, rotation, minX, minY, spanX, spanY }
  }
  const { scale, rotation, minX, minY, spanX, spanY } = best!
  const left = MARGIN + (width - spanX * scale) / 2
  const top = MARGIN + (height - spanY * scale) / 2
  return {
    scale, rotation,
    place(point) {
      const turned = turn(point, rotation * Math.PI / 180)
      // Page y grows downward; the net's y axis points up the page.
      return { x: left + (turned.x - minX) * scale, y: top + (minY + spanY - turned.y) * scale }
    },
  }
}

const number = (value: number) => String(Math.round(value * 100) / 100)

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, character => `&#${character.charCodeAt(0)};`)
}

/** The caption's scale note, in Turkish number format. */
export function scaleNote(layout: SheetLayout): string {
  if (layout.scale >= MM_PER_UNIT - 1e-9) return 'Ölçek 1:1 — 1 birim = 1 cm'
  const millimetres = (Math.round(layout.scale * 10) / 10).toLocaleString('tr-TR')
  return `Sayfaya sığması için küçültüldü — 1 birim = ${millimetres} mm`
}

/**
 * An A4 page (mm units) with the net: faces filled lightly, cut lines solid, fold lines
 * dashed, glue tabs gray.
 */
export function netSvg(sheet: NetSheet, options: { title: string; color: string }): string {
  const layout = layoutSheet(sheet)
  const path = (points: readonly Point2[], close: boolean) => points.map((point, index) => {
    const { x, y } = layout.place(point)
    return `${index ? 'L' : 'M'}${number(x)} ${number(y)}`
  }).join('') + (close ? 'Z' : '')
  const faces = sheet.faces.map(face => `<path d="${path(face, true)}"/>`).join('')
  const tabs = sheet.tabs.map(tab => `<path d="${path(tab, true)}"/>`).join('')
  const cuts = sheet.cuts.map(cut => `<path d="${path(cut, false)}"/>`).join('')
  const folds = sheet.folds.map(fold => `<path d="${path(fold, false)}"/>`).join('')
  const captionY = PAGE.height - MARGIN - 4
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE.width}mm" height="${PAGE.height}mm" viewBox="0 0 ${PAGE.width} ${PAGE.height}">`,
    `<title>${escapeXml(options.title)}</title>`,
    `<rect width="${PAGE.width}" height="${PAGE.height}" fill="#ffffff"/>`,
    `<g fill="${escapeXml(options.color)}" fill-opacity="0.16" stroke="none">${faces}</g>`,
    `<g fill="#e5e7eb" stroke="none">${tabs}</g>`,
    `<g fill="none" stroke="#111827" stroke-width="0.3" stroke-linejoin="round" stroke-linecap="round">${cuts}</g>`,
    `<g fill="none" stroke="#4b5563" stroke-width="0.25" stroke-dasharray="2 1.2">${folds}</g>`,
    `<g font-family="Arial, Helvetica, sans-serif" fill="#111827">`,
    `<text x="${MARGIN}" y="${captionY}" font-size="4" font-weight="700">${escapeXml(options.title)}</text>`,
    `<text x="${MARGIN}" y="${captionY + 5}" font-size="3">${escapeXml(scaleNote(layout))} · Düz çizgi: kes · Kesikli çizgi: katla${sheet.tabs.length ? ' · Gri: yapıştırma payı' : ''}</text>`,
    '</g></svg>',
  ].join('')
}

/** A page that prints the SVG on one A4 sheet without margins. */
export function printPage(svg: string, title: string): string {
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><title>${escapeXml(title)}</title>`
    + '<style>@page{size:A4 portrait;margin:0}html,body{margin:0;padding:0}svg{display:block}</style>'
    + `</head><body>${svg}</body></html>`
}
