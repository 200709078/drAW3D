import * as THREE from 'three'
import type { Vec3 } from '../geometry/vec3'
import { toThree } from './buffers'
import type { MaterialCache } from './materials'

const SHAFT = new THREE.CylinderGeometry(0.06, 0.06, 0.66, 12)
const HEAD = new THREE.ConeGeometry(0.16, 0.36, 16)
/** Arrow scale in CSS pixels (the unit arrow is about 1.6 units long). */
const SCREEN_PIXELS = 25

/** Double arrows around the selected point showing the directions it can be dragged in. */
export class ArrowView {
  readonly root = new THREE.Group()
  private arrows: THREE.Group[] = []

  constructor(private materials: MaterialCache) {
    this.root.visible = false
  }

  update(origin: Vec3 | null, directions: readonly Vec3[], color: string): void {
    this.root.visible = origin !== null && directions.length > 0
    if (!origin) return
    toThree(origin, this.root.position)
    const wanted = directions.length * 2
    while (this.arrows.length < wanted) {
      const arrow = new THREE.Group()
      const shaft = new THREE.Mesh(SHAFT)
      const head = new THREE.Mesh(HEAD)
      shaft.position.y = 0.6 + 0.33
      head.position.y = 0.6 + 0.66 + 0.18
      arrow.add(shaft, head)
      this.arrows.push(arrow)
      this.root.add(arrow)
    }
    const up = new THREE.Vector3(0, 1, 0)
    this.arrows.forEach((arrow, index) => {
      arrow.visible = index < wanted
      if (!arrow.visible) return
      const direction = toThree(directions[Math.floor(index / 2)]!).normalize()
      if (index % 2) direction.negate()
      arrow.quaternion.setFromUnitVectors(up, direction)
      for (const child of arrow.children) (child as THREE.Mesh).material = this.materials.solid(color)
    })
  }

  /** Keep a constant size on screen; `pixelSize` is the world size of a pixel at a point. */
  scaleFor(pixelSize: (point: Vec3) => number, factor = 1): void {
    if (!this.root.visible) return
    const { x, y, z } = this.root.position
    this.root.scale.setScalar(Math.max(pixelSize({ x, y, z }) * SCREEN_PIXELS * factor, 0.05))
  }
}
