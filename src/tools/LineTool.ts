import * as THREE from "three"
import { BaseTool } from "./BaseTool"
import { createPoint } from "../objects/Point"
import { LineObject } from "../objects/Line"
import { getNearestSelectablePoint, getPointerIntersection, getPointerPointSize, PREVIEW_POINT_SIZE, shouldShowPointerPreview, updatePointCursor } from "../interaction/Pointer"

export class LineTool extends BaseTool {
  selectableObjects: THREE.Object3D[]

  pointA: THREE.Mesh | null = null
  createdPoints: THREE.Mesh[] = []

  cursorPreview: THREE.Mesh
  previewLine: THREE.Line | null = null

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
    [...this.createdPoints].forEach((point) => this.removeCreatedPoint(point))
    this.reset()
  }

  reset() {
    if (this.previewLine) {
      this.scene.remove(this.previewLine)
      this.previewLine.geometry.dispose()
      this.previewLine = null
    }

    this.pointA = null
    this.createdPoints = []
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

    if (!this.pointA) return

    const direction = new THREE.Vector3()
      .subVectors(pos, this.pointA.position)
      .normalize()

    const length = 100
    const start = this.pointA.position.clone().add(direction.clone().multiplyScalar(-length / 2))
    const end = this.pointA.position.clone().add(direction.clone().multiplyScalar(length / 2))

    if (this.previewLine) {
      this.scene.remove(this.previewLine)
      this.previewLine.geometry.dispose()
    }

    this.previewLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([start, end]),
      new THREE.LineBasicMaterial({ color: 0xff0000 })
    )
    this.scene.add(this.previewLine)
  }
  onMouseMove(_event: MouseEvent) { }

  onPointerDown(event: PointerEvent) {
    const result = this.getOrCreatePoint(event)
    const point = result.point

    if (!this.pointA) {
      this.pointA = point
      return
    }

    if (point === this.pointA || point.position.distanceTo(this.pointA.position) < 0.001) {
      if (result.created) this.removeCreatedPoint(point)
      return
    }

    const line = new LineObject(this.pointA, point, 100, this.selectableObjects)
    this.scene.add(line.mesh)
    this.recordCreation("Doğru oluştur", [...this.createdPoints, line.mesh], [line])

    this.reset()
    this.complete()
  }

  onClick(event: MouseEvent) { this.onPointerDown(event as PointerEvent) }

  private getOrCreatePoint(event: PointerEvent | MouseEvent) {
    const existingPoint = getNearestSelectablePoint(
      event,
      this.camera,
      this.selectableObjects
    )

    if (existingPoint) {
      this.selectPoint(existingPoint)
      return { point: existingPoint, created: false }
    }

    const pos = getPointerIntersection(event, this.camera)
    const point = createPoint(pos, getPointerPointSize(event))

    this.scene.add(point)
    this.selectableObjects.push(point)
    this.createdPoints.push(point)

    return { point, created: true }
  }

  private removeCreatedPoint(point: THREE.Mesh) {
    this.scene.remove(point)
    const index = this.selectableObjects.indexOf(point)
    if (index >= 0) this.selectableObjects.splice(index, 1)
    this.createdPoints = this.createdPoints.filter((createdPoint) => createdPoint !== point)
    point.geometry.dispose()
  }
}
