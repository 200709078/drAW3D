import * as THREE from 'three'

/**
 * Shared materials by color and kind. Objects of one color share one material, so a
 * document of many objects compiles a handful of programs and nothing leaks on updates.
 */
export class MaterialCache {
  private materials = new Map<string, THREE.Material>()

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

  line(color: string, opacity = 1): THREE.LineBasicMaterial {
    return this.get(`line:${color}:${opacity}`, () => new THREE.LineBasicMaterial({
      color, transparent: opacity < 1, opacity,
    }))
  }

  dashed(color: string): THREE.LineDashedMaterial {
    return this.get(`dashed:${color}`, () => new THREE.LineDashedMaterial({ color, dashSize: 0.15, gapSize: 0.1 }))
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
