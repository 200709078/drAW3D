import * as THREE from "three"
import { BaseTool } from "./BaseTool"
import { createPoint } from "../objects/Point"
import { RayObject } from "../objects/Ray"
import { getNearestSelectablePoint, getPointerIntersection, getPointerPointSize, PREVIEW_POINT_SIZE, shouldShowPointerPreview, updatePointCursor } from "../interaction/Pointer"

export class RayTool extends BaseTool {
  startPoint: THREE.Vector3 | null = null
  startPointMesh: THREE.Mesh | null = null
  createdPoints: THREE.Mesh[] = []
  selectableObjects: THREE.Object3D[]

  cursorPreview: THREE.Mesh
  previewRay: THREE.Line | null = null

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
    if (this.previewRay) {
      this.scene.remove(this.previewRay)
      this.previewRay.geometry.dispose()
      this.previewRay = null
    }

    this.startPoint = null
    this.startPointMesh = null
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

    if (!this.startPoint) return

    const direction = new THREE.Vector3()
      .subVectors(pos, this.startPoint)
      .normalize()

    const end = this.startPoint.clone().add(direction.multiplyScalar(50))

    if (this.previewRay) {
      this.scene.remove(this.previewRay)
      this.previewRay.geometry.dispose()
    }

    this.previewRay = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([this.startPoint.clone(), end]),
      new THREE.LineBasicMaterial({ color: 0xff0000 })
    )

    this.scene.add(this.previewRay)
  }
  onMouseMove(_event: MouseEvent) { }

  onPointerDown(event: PointerEvent) {
    const result = this.getOrCreatePoint(event)
    const point = result.point

    if (!this.startPointMesh) {
      this.startPointMesh = point
      this.startPoint = point.position.clone()
      return
    }

    if (point === this.startPointMesh || point.position.distanceTo(this.startPointMesh.position) < 0.001) {
      if (result.created) this.removeCreatedPoint(point)
      return
    }

    const ray = new RayObject(
      this.startPointMesh,
      point,
      50,
      this.selectableObjects
    )
    this.scene.add(ray.mesh)
    this.recordCreation("Işın oluştur", [...this.createdPoints, ray.mesh], [ray])

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
