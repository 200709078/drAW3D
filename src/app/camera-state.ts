import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { CameraPose } from '../document/file-format'
import { length, normalize, sub, vec, type Ray, type Vec3 } from '../geometry/vec3'

export const STANDARD_POSITION = vec(18, 15, 18)
export const STANDARD_TARGET = vec(0, 0, 0)

/** Named camera directions; all but the standard view keep the current target and distance. */
export type ViewDirection = 'standard' | 'front' | 'top' | 'side' | 'isometric'

/** From the target toward the camera. Straight down would leave the azimuth undefined. */
const DIRECTIONS: Readonly<Record<Exclude<ViewDirection, 'standard'>, Vec3>> = {
  front: vec(0, 0, 1),
  top: normalize(vec(0, 1, 1e-4))!,
  side: vec(1, 0, 0),
  isometric: normalize(vec(1, 1, 1))!,
}

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

/** Where the viewer is: what faces of a solid are turned toward. */
export interface Eye {
  orthographic: boolean
  /** Camera position (perspective). */
  position: Vec3
  /** Unit view direction, from the camera into the scene. */
  direction: Vec3
}

const FOV = 75
/** Content is fitted with this much room around it, and never smaller than this radius. */
const FIT_MARGIN = 1.25
const FIT_MIN_RADIUS = 4

/**
 * The perspective and orthographic cameras and the orbit controls that move whichever is
 * active. Switching keeps what is seen: the same target, direction and visible size.
 */
export class CameraState implements Projector {
  readonly perspective = new THREE.PerspectiveCamera(FOV, 1, 0.1, 1000)
  // Nothing is clipped in front of an orthographic camera: the scene may lie on both sides of it.
  readonly orthographic = new THREE.OrthographicCamera(-1, 1, 1, -1, -1000, 1000)
  readonly controls: OrbitControls
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = this.perspective
  private width = 1
  private height = 1
  /** Half the visible height of the orthographic view at zoom 1. */
  private halfHeight = 10
  private projected = new THREE.Vector3()

  constructor(element: HTMLElement) {
    this.controls = new OrbitControls(this.camera, element)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.maxDistance = 300
    this.controls.minZoom = 0.05
    this.controls.maxZoom = 40
    this.setView('standard')
  }

  get isOrthographic(): boolean {
    return this.camera === this.orthographic
  }

  resize(width: number, height: number): void {
    this.width = Math.max(width, 1)
    this.height = Math.max(height, 1)
    this.perspective.aspect = this.width / this.height
    this.perspective.updateProjectionMatrix()
    this.updateFrustum()
  }

  private updateFrustum(): void {
    const aspect = this.width / this.height
    Object.assign(this.orthographic, {
      left: -this.halfHeight * aspect, right: this.halfHeight * aspect, top: this.halfHeight, bottom: -this.halfHeight,
    })
    this.orthographic.updateProjectionMatrix()
  }

  /** Spend the remaining damping glide first, or it would drift the camera off a set view. */
  private settle(): void {
    this.controls.enableDamping = false
    this.controls.update()
  }

  private finish(): void {
    this.camera.lookAt(this.controls.target)
    this.controls.update()
    this.controls.enableDamping = true
  }

  setOrthographic(enabled: boolean): void {
    if (enabled === this.isOrthographic) return
    this.settle()
    const target = this.controls.target
    if (enabled) {
      const distance = this.perspective.position.distanceTo(target)
      this.halfHeight = distance * Math.tan(THREE.MathUtils.degToRad(FOV / 2))
      this.updateFrustum()
      this.orthographic.position.copy(this.perspective.position)
      this.orthographic.zoom = 1
      this.orthographic.updateProjectionMatrix()
      this.camera = this.orthographic
    } else {
      // The distance at which the perspective view shows what the orthographic one shows.
      const visible = this.halfHeight / this.orthographic.zoom
      const distance = visible / Math.tan(THREE.MathUtils.degToRad(FOV / 2))
      const direction = this.orthographic.position.clone().sub(target).normalize()
      this.perspective.position.copy(target).addScaledVector(direction, distance)
      this.camera = this.perspective
    }
    this.controls.object = this.camera
    this.finish()
  }

  /**
   * The standard view shows the same region on every screen shape: from STANDARD_POSITION
   * on a landscape screen, from farther away on a portrait one (a phone held upright),
   * where the narrow horizontal view would otherwise crop the scene.
   */
  private standardDistance(): number {
    const vertical = THREE.MathUtils.degToRad(FOV / 2)
    const horizontal = Math.atan(Math.tan(vertical) * this.width / this.height)
    const radius = length(sub(STANDARD_POSITION, STANDARD_TARGET)) * Math.sin(vertical)
    return radius / Math.sin(Math.min(vertical, horizontal))
  }

  setView(view: ViewDirection): void {
    this.settle()
    if (view === 'standard') {
      this.controls.target.set(STANDARD_TARGET.x, STANDARD_TARGET.y, STANDARD_TARGET.z)
      const direction = normalize(sub(STANDARD_POSITION, STANDARD_TARGET))!
      const distance = this.standardDistance()
      this.camera.position.copy(this.controls.target).addScaledVector(new THREE.Vector3(direction.x, direction.y, direction.z), distance)
      if (this.isOrthographic) {
        this.halfHeight = distance * Math.tan(THREE.MathUtils.degToRad(FOV / 2))
        this.orthographic.zoom = 1
        this.updateFrustum()
      }
    } else {
      const distance = this.camera.position.distanceTo(this.controls.target)
      const direction = DIRECTIONS[view]
      this.camera.position.copy(this.controls.target).addScaledVector(new THREE.Vector3(direction.x, direction.y, direction.z), distance)
    }
    this.finish()
  }

  /**
   * Look at a sphere of content from the current direction so that it fills about 80 % of the
   * view; tiny content is shown at FIT_MIN_RADIUS so a single small solid is not blown up.
   */
  fit(center: Vec3, radius: number): void {
    this.settle()
    const direction = this.camera.position.clone().sub(this.controls.target).normalize()
    const vertical = THREE.MathUtils.degToRad(FOV / 2)
    const horizontal = Math.atan(Math.tan(vertical) * this.width / this.height)
    const distance = Math.max(radius, FIT_MIN_RADIUS) * FIT_MARGIN / Math.sin(Math.min(vertical, horizontal))
    this.controls.target.set(center.x, center.y, center.z)
    this.camera.position.copy(this.controls.target).addScaledVector(direction, distance)
    if (this.isOrthographic) {
      this.halfHeight = distance * Math.tan(vertical)
      this.orthographic.zoom = 1
      this.updateFrustum()
    }
    this.finish()
  }

  pose(): CameraPose {
    const { position, zoom } = this.camera
    const { target } = this.controls
    return {
      position: vec(position.x, position.y, position.z), target: vec(target.x, target.y, target.z),
      zoom: this.isOrthographic ? zoom : 1,
    }
  }

  /** Look from a saved pose, keeping the current projection. */
  setPose(pose: CameraPose): void {
    this.settle()
    this.controls.target.set(pose.target.x, pose.target.y, pose.target.z)
    this.camera.position.set(pose.position.x, pose.position.y, pose.position.z)
    if (this.isOrthographic) {
      this.halfHeight = this.camera.position.distanceTo(this.controls.target) * Math.tan(THREE.MathUtils.degToRad(FOV / 2))
      this.orthographic.zoom = pose.zoom
      this.updateFrustum()
    }
    this.finish()
  }

  /** Advance damping; true while the camera is still moving. */
  update(): boolean {
    return this.controls.update()
  }

  eye(): Eye {
    const forward = this.camera.getWorldDirection(this.projected)
    const direction = vec(forward.x, forward.y, forward.z)
    const { x, y, z } = this.camera.position
    return { orthographic: this.isOrthographic, position: vec(x, y, z), direction }
  }

  /** World size of one CSS pixel at a point (for things drawn at a constant screen size). */
  pixelSize(point: Vec3): number {
    if (this.isOrthographic) return (2 * this.halfHeight / this.orthographic.zoom) / this.height
    const distance = this.perspective.position.distanceTo(this.projected.set(point.x, point.y, point.z))
    return 2 * distance * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) / this.height
  }

  toScreen(point: Vec3): ScreenPoint | null {
    this.camera.updateMatrixWorld()
    const view = this.projected.set(point.x, point.y, point.z).applyMatrix4(this.camera.matrixWorldInverse)
    if (!this.isOrthographic && view.z > -this.perspective.near) return null
    view.applyMatrix4(this.camera.projectionMatrix)
    return { x: (view.x * 0.5 + 0.5) * this.width, y: (-view.y * 0.5 + 0.5) * this.height }
  }

  ray(screen: ScreenPoint): Ray {
    this.camera.updateMatrixWorld()
    const ndcX = screen.x / this.width * 2 - 1
    const ndcY = -(screen.y / this.height) * 2 + 1
    // Near and far points of the pixel work for both projections.
    const near = this.projected.set(ndcX, ndcY, -1).unproject(this.camera)
    const origin = vec(near.x, near.y, near.z)
    const far = this.projected.set(ndcX, ndcY, 1).unproject(this.camera)
    return { origin, direction: normalize(sub(vec(far.x, far.y, far.z), origin))! }
  }
}
