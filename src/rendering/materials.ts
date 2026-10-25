import * as THREE from 'three'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { edgeMaterial } from './edge-lines'

/**
 * Shared materials by color and kind. Objects of one color share one material, so a
 * document of many objects compiles a handful of programs and nothing leaks on updates.
 */
export class MaterialCache {
  private materials = new Map<string, THREE.Material>()
  private lineWidth = 1

  private get<M extends THREE.Material>(key: string, create: () => M): M {
    let material = this.materials.get(key) as M | undefined
    if (!material) {
      material = create()
      this.materials.set(key, material)
    }
    return material
  }

  /** Lit, opaque: points, lines, angle arcs. */
  solid(color: string): THREE.MeshStandardMaterial {
    return this.get(`solid:${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.55 }))
  }

  /** Lit, see-through faces; they do not hide the edges and points behind them. */
  face(color: string, opacity: number): THREE.MeshStandardMaterial {
    return this.get(`face:${color}:${opacity}`, () => new THREE.MeshStandardMaterial({
      color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, roughness: 0.7,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    }))
  }

  /** Edge lines (`EdgeLines`); every one has the width set by `setLineWidth`. */
  line(color: string, opacity = 1): LineMaterial {
    return this.get(`line:${color}:${opacity}`, () => edgeMaterial(color, { opacity }, this.lineWidth))
  }

  dashed(color: string): LineMaterial {
    return this.get(`dashed:${color}`, () => edgeMaterial(color, { dashed: { dash: 0.15, gap: 0.1 } }, this.lineWidth))
  }

  /** Edges hidden behind a solid: longer dashes that stay readable through the faces. */
  hidden(color: string): LineMaterial {
    return this.get(`hidden:${color}`, () => edgeMaterial(color, { dashed: { dash: 0.25, gap: 0.16 } }, this.lineWidth))
  }

  dotted(color: string): LineMaterial {
    return this.get(`dotted:${color}`, () => edgeMaterial(color, { dashed: { dash: 0.04, gap: 0.1 } }, this.lineWidth))
  }

  /** Width of every edge line in CSS pixels. */
  setLineWidth(width: number): void {
    if (width === this.lineWidth) return
    this.lineWidth = width
    for (const material of this.materials.values()) {
      if (material instanceof LineMaterial) material.linewidth = width
    }
  }

  /** Unlit and drawn over everything: tool previews and the cursor. */
  overlay(color: string, opacity = 1): THREE.MeshBasicMaterial {
    return this.get(`overlay:${color}:${opacity}`, () => new THREE.MeshBasicMaterial({
      color, transparent: opacity < 1, opacity, side: THREE.DoubleSide, depthWrite: false,
    }))
  }

  dispose(): void {
    for (const material of this.materials.values()) material.dispose()
    this.materials.clear()
  }
}
