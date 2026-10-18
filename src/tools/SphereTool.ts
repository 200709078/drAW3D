import * as THREE from "three"
import { BaseTool } from "./BaseTool"
import { getNearestSelectablePoint, getPointerIntersection, getPointerPointSize, PREVIEW_POINT_SIZE, shouldShowPointerPreview, updatePointCursor } from "../interaction/Pointer"
import { createPoint } from "../objects/Point"
import { LineSegment } from "../objects/LineSegment"
import { SphereObject } from "../objects/Sphere"

export class SphereTool extends BaseTool {
  selectableObjects: THREE.Object3D[]

  centerPoint: THREE.Mesh | null = null
  private centerPointCreated = false

  cursorPreview: THREE.Mesh
  radiusPreview: THREE.Line | null = null
  spherePreview: THREE.Mesh | null = null

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    selectableObjects: THREE.Object3D[]
  ) {
    super(scene, camera)
    this.selectableObjects = selectableObjects

    const geo = new THREE.SphereGeometry(PREVIEW_POINT_SIZE, 16, 16)
    const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 })

    this.cursorPreview = new THREE.Mesh(geo, mat)
  }

  activate() {
    this.cursorPreview.visible = false

    if (!this.cursorPreview.parent) {
      this.scene.add(this.cursorPreview)
    }
  }

  deactivate() {
    this.cancel()
    if (this.cursorPreview.parent) {
      this.scene.remove(this.cursorPreview)
    }
  }

  cancel() {
    if (this.centerPoint && this.centerPointCreated) {
      this.removeCreatedPoint(this.centerPoint)
    }

    this.reset()
  }

  reset() {
    if (this.radiusPreview) {
      this.scene.remove(this.radiusPreview)
      this.radiusPreview = null
    }

    if (this.spherePreview) {
      this.scene.remove(this.spherePreview)
      this.spherePreview = null
    }

    this.centerPoint = null
    this.centerPointCreated = false
    this.cursorPreview.visible = false
  }

  onPointerMove(event: PointerEvent) {
    updatePointCursor(event, this.camera, this.selectableObjects)

    if (!shouldShowPointerPreview(event)) {
      this.cursorPreview.visible = false
      return
    }

    const pos = getPointerIntersection(event, this.camera)

    this.cursorPreview.position.copy(pos)
    this.cursorPreview.visible = true

    if (!this.centerPoint) return

    if (this.radiusPreview) {
      this.scene.remove(this.radiusPreview)
    }

    this.radiusPreview = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([this.centerPoint.position, pos]),
      new THREE.LineBasicMaterial({ color: 0xff0000 })
    )
    this.scene.add(this.radiusPreview)

    const radius = this.centerPoint.position.distanceTo(pos)

    if (!this.spherePreview) {
      this.spherePreview = new THREE.Mesh(
        new THREE.SphereGeometry(1, 32, 32),
        new THREE.MeshStandardMaterial({
          color: 0x44aa88,
          transparent: true,
          opacity: 0.35,
        })
      )
      this.scene.add(this.spherePreview)
    }

    this.spherePreview.position.copy(this.centerPoint.position)
    this.spherePreview.scale.set(radius, radius, radius)
  }
  onMouseMove(_event: MouseEvent) { }

  onPointerDown(_event: PointerEvent) {
    const existingPoint = getNearestSelectablePoint(
      _event,
      this.camera,
      this.selectableObjects
    )

    if (!this.centerPoint) {
      const centerCreated = !existingPoint
      const center = existingPoint ?? createPoint(
        getPointerIntersection(_event, this.camera),
        getPointerPointSize(_event)
      )

      if (existingPoint) {
        this.selectPoint(existingPoint)
      } else {
        this.scene.add(center)
        this.selectableObjects.push(center)
      }

      this.centerPoint = center
      this.centerPointCreated = centerCreated
      return
    }

    const surfacePointCreated = !existingPoint
    const surfacePoint = existingPoint ?? createPoint(
      getPointerIntersection(_event, this.camera),
      getPointerPointSize(_event)
    )

    if (surfacePoint === this.centerPoint || surfacePoint.position.distanceTo(this.centerPoint.position) < 0.001) {
      return
    }

    if (existingPoint) {
      this.selectPoint(existingPoint)
    } else {
      this.scene.add(surfacePoint)
      this.selectableObjects.push(surfacePoint)
    }

    const radiusSegment = new LineSegment(this.centerPoint, surfacePoint)
    this.scene.add(radiusSegment.mesh)

    const ownedPoints = [
      ...(this.centerPointCreated ? [this.centerPoint] : []),
      ...(surfacePointCreated ? [surfacePoint] : []),
    ]

    const sphere = new SphereObject(
      this.centerPoint,
      surfacePoint,
      this.selectableObjects,
      radiusSegment,
      ownedPoints
    )
    this.scene.add(sphere.mesh)
    this.recordCreation(
      "Küre oluştur",
      [...ownedPoints, radiusSegment.mesh, sphere.mesh],
      [radiusSegment, sphere]
    )

    this.reset()
    this.complete()
  }

  onClick(event: MouseEvent) { this.onPointerDown(event as PointerEvent) }

  private removeCreatedPoint(point: THREE.Mesh) {
    this.scene.remove(point)
    const index = this.selectableObjects.indexOf(point)
    if (index >= 0) this.selectableObjects.splice(index, 1)
    point.geometry.dispose()
  }
}
