import * as THREE from "three"
import { BaseTool } from "./BaseTool"
import { createPoint } from "../objects/Point"
import { Plane } from "../objects/Plane"
import { getNearestSelectablePoint, getPointerIntersection, getPointerPointSize, PREVIEW_POINT_SIZE, shouldShowPointerPreview, updatePointCursor } from "../interaction/Pointer"

export class PlaneTool extends BaseTool {
  selectableObjects: THREE.Object3D[]
  points: THREE.Mesh[] = []
  createdPoints: THREE.Mesh[] = []

  cursorPreview: THREE.Mesh

  previewPlane: THREE.Mesh | null = null

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

  updatePreviewPlane(
    pointA: THREE.Mesh,
    pointB: THREE.Mesh,
    currentPoint: THREE.Vector3
  ) {
    const A = pointA.position.clone()
    const B = pointB.position.clone()
    const C = currentPoint.clone()

    const AB = new THREE.Vector3().subVectors(B, A)
    const AC = new THREE.Vector3().subVectors(C, A)

    const normal = new THREE.Vector3().crossVectors(AB, AC)

    if (normal.length() < 0.0001) return

    normal.normalize()

    const center = new THREE.Vector3()
      .addVectors(A, B)
      .add(C)
      .divideScalar(3)

    const width = 4
    const height = 4

    const xAxis = AB.clone().normalize()
    const yAxis = new THREE.Vector3()
      .crossVectors(normal, xAxis)
      .normalize()

    const p1 = center.clone()
      .add(xAxis.clone().multiplyScalar(-width / 2))
      .add(yAxis.clone().multiplyScalar(-height / 2))

    const p2 = center.clone()
      .add(xAxis.clone().multiplyScalar(width / 2))
      .add(yAxis.clone().multiplyScalar(-height / 2))

    const p3 = center.clone()
      .add(xAxis.clone().multiplyScalar(width / 2))
      .add(yAxis.clone().multiplyScalar(height / 2))

    const p4 = center.clone()
      .add(xAxis.clone().multiplyScalar(-width / 2))
      .add(yAxis.clone().multiplyScalar(height / 2))

    const geometry = new THREE.BufferGeometry()

    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([
        p1.x, p1.y, p1.z,
        p2.x, p2.y, p2.z,
        p3.x, p3.y, p3.z,
        p4.x, p4.y, p4.z,
      ], 3)
    )

    geometry.setIndex([
      0, 1, 2,
      0, 2, 3,
    ])

    geometry.computeVertexNormals()

    if (!this.previewPlane) {
      const material = new THREE.MeshStandardMaterial({
        color: 0x00aaff,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
        depthWrite: false,
      })

      this.previewPlane = new THREE.Mesh(geometry, material)
      this.scene.add(this.previewPlane)
      return
    }

    this.previewPlane.geometry.dispose()
    this.previewPlane.geometry = geometry
  }

  private clearPreviewPlane() {
    if (!this.previewPlane) return

    this.scene.remove(this.previewPlane)
    this.previewPlane.geometry.dispose()
    this.previewPlane = null
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
    this.points = []
    this.createdPoints = []
    this.cursorPreview.visible = false
    this.clearPreviewPlane()
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

    if (this.points.length === 2) {
      this.updatePreviewPlane(this.points[0], this.points[1], pos)
    }
  }
  onMouseMove(_event: MouseEvent) { }

  onPointerDown(event: PointerEvent) {
    const result = this.getOrCreatePoint(event)
    const point = result.point

    if (this.hasPoint(point)) {
      if (result.created) this.removeCreatedPoint(point)
      return
    }

    this.points.push(point)

    if (this.points.length === 3) {
      if (this.areCollinear(this.points[0], this.points[1], this.points[2])) {
        if (result.created) this.removeCreatedPoint(point)
        this.points.pop()
        return
      }

      const plane = new Plane(
        this.points[0],
        this.points[1],
        this.points[2],
        this.selectableObjects
      )

      this.scene.add(plane.mesh)
      this.recordCreation("Düzlem oluştur", [...this.createdPoints, plane.mesh], [plane])
      this.clearPreviewPlane()
      this.points = []
      this.createdPoints = []
      this.complete()
    }
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

  private areCollinear(a: THREE.Mesh, b: THREE.Mesh, c: THREE.Mesh) {
    const ab = new THREE.Vector3().subVectors(b.position, a.position)
    const ac = new THREE.Vector3().subVectors(c.position, a.position)

    return new THREE.Vector3().crossVectors(ab, ac).length() < 0.0001
  }

  private removeCreatedPoint(point: THREE.Mesh) {
    this.scene.remove(point)
    const index = this.selectableObjects.indexOf(point)
    if (index >= 0) this.selectableObjects.splice(index, 1)
    this.createdPoints = this.createdPoints.filter((createdPoint) => createdPoint !== point)
    point.geometry.dispose()
  }

  private hasPoint(point: THREE.Mesh) {
    return this.points.some((existing) =>
      existing === point || existing.position.distanceTo(point.position) < 0.001
    )
  }
}
