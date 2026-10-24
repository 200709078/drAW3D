import type { Vec3 } from '../geometry/vec3'

export interface ScreenPoint {
  x: number
  y: number
}

interface Label {
  element: HTMLElement
  anchor: Vec3
}

/**
 * Text placed over the canvas at projected world positions (angle measures). HTML text
 * stays sharp at every zoom, unlike textures in the scene.
 */
export class LabelLayer {
  private labels = new Map<string, Label>()

  constructor(private container: HTMLElement) {}

  set(key: string, text: string, color: string, anchor: Vec3): void {
    let label = this.labels.get(key)
    if (!label) {
      const element = document.createElement('span')
      element.className = 'scene-label'
      element.dataset.key = key
      this.container.append(element)
      label = { element, anchor }
      this.labels.set(key, label)
    }
    label.anchor = anchor
    if (label.element.textContent !== text) label.element.textContent = text
    label.element.style.color = color
  }

  /** Remove every label not in `keep`. */
  retain(keep: ReadonlySet<string>): void {
    for (const [key, label] of this.labels) {
      if (keep.has(key)) continue
      label.element.remove()
      this.labels.delete(key)
    }
  }

  layout(project: (point: Vec3) => ScreenPoint | null): void {
    for (const label of this.labels.values()) {
      const screen = project(label.anchor)
      label.element.hidden = screen === null
      if (screen) label.element.style.transform = `translate(${screen.x}px, ${screen.y}px) translate(-50%, -50%)`
    }
  }
}
