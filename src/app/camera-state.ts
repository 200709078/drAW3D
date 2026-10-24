import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { normalize, sub, vec, type Ray, type Vec3 } from '../geometry/vec3'

export const STANDARD_POSITION = vec(18, 15, 18)
export const STANDARD_TARGET = vec(0, 0, 0)

/** Canvas-local CSS pixels. */
export interface ScreenPoint {
  x: number
  y: number
}

/** World ↔ canvas mapping shared by hit testing, dragging and labels. */
export interface Projector {
  /** Null for points behind the camera. */
  toScreen(point: Vec3): ScreenPoint | null
  /** The pointer ray through a canvas pixel. */
  ray(screen: ScreenPoint): Ray
}

export class CameraState implements Projector {
  readonly camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000)
  readonly controls: OrbitControls
  private width = 1
  private height = 1
  private projected = new THREE.Vector3()

  constructor(element: HTMLElement) {
    this.controls = new OrbitControls(this.camera, element)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.maxDistance = 300
    this.standardView()
  }

  resize(width: number, height: number): void {
    this.width = Math.max(width, 1)
    this.height = Math.max(height, 1)
    this.camera.aspect = this.width / this.height
    this.camera.updateProjectionMatrix()
  }

  standardView(): void {
    // Spend the remaining damping glide first, or it would drift the camera off the view.
    this.controls.enableDamping = false
    this.controls.update()
    this.camera.position.set(STANDARD_POSITION.x, STANDARD_POSITION.y, STANDARD_POSITION.z)
    this.controls.target.set(STANDARD_TARGET.x, STANDARD_TARGET.y, STANDARD_TARGET.z)
    this.camera.lookAt(this.controls.target)
    this.controls.update()
    this.controls.enableDamping = true
  }

  /** Advance damping; true while the camera is still moving. */
  update(): boolean {
    return this.controls.update()
  }

  toScreen(point: Vec3): ScreenPoint | null {
    this.camera.updateMatrixWorld()
    const view = this.projected.set(point.x, point.y, point.z).applyMatrix4(this.camera.matrixWorldInverse)
    if (view.z > -this.camera.near) return null
    view.applyMatrix4(this.camera.projectionMatrix)
    return { x: (view.x * 0.5 + 0.5) * this.width, y: (-view.y * 0.5 + 0.5) * this.height }
  }

  ray(screen: ScreenPoint): Ray {
    this.camera.updateMatrixWorld()
    const target = this.projected.set(screen.x / this.width * 2 - 1, -(screen.y / this.height) * 2 + 1, 0.5)
      .unproject(this.camera)
    const origin = vec(this.camera.position.x, this.camera.position.y, this.camera.position.z)
    return { origin, direction: normalize(sub(vec(target.x, target.y, target.z), origin))! }
  }
}
