import * as THREE from "three"
import { BaseTool } from "./BaseTool"
import { createPoint } from "../objects/Point"
import { LineSegment } from "../objects/LineSegment"
import { Pyramid } from "../objects/Pyramid"
import { getNearestSelectablePoint, getPointerIntersection, getPointerPointSize, PREVIEW_POINT_SIZE, shouldShowPointerPreview, updatePointCursor } from "../interaction/Pointer"

export class PyramidTool extends BaseTool {
  selectableObjects: THREE.Object3D[]
  sideCount = 4

  pointA: THREE.Mesh | null = null
  private pointACreated = false

  cursorPreview: THREE.Mesh
  edgePreview: THREE.Line | null = null
  pyramidPreview: THREE.Mesh | null = null
  previewSideLines: THREE.LineSegments | null = null

  lastPyramid: Pyramid | null = null

  sliderContainer: HTMLElement | null = null
  sideSlider: HTMLInputElement | null = null
  sideValue: HTMLSpanElement | null = null

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    selectableObjects: THREE.Object3D[]
  ) {
    super(scene, camera)

    this.selectableObjects = selectableObjects

    this.cursorPreview = new THREE.Mesh(
      new THREE.SphereGeometry(PREVIEW_POINT_SIZE, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xff0000 })
    )

    this.sliderContainer = document.getElementById("sideControl")
    this.sideSlider = document.getElementById("sideSlider") as HTMLInputElement
    this.sideValue = document.getElementById("sideValue") as HTMLSpanElement

    this.sideSlider?.addEventListener("input", () => {
      const value = parseInt(this.sideSlider!.value)

      this.sideCount = value

      if (this.sideValue) {
        this.sideValue.textContent = value.toString()
      }

    })
  }

  setSideCount(n: number) {
    this.sideCount = n

  }

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

    return { point, created: true }
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
    if (this.pointA && this.pointACreated) {
      this.removeCreatedPoint(this.pointA)
    }

    this.reset()
  }

  reset() {
    if (this.edgePreview) {
      this.scene.remove(this.edgePreview)
      this.edgePreview.geometry.dispose()
      this.edgePreview = null
    }

    if (this.pyramidPreview) {
      this.scene.remove(this.pyramidPreview)
      this.pyramidPreview.geometry.dispose()
      this.pyramidPreview = null
    }

    if (this.previewSideLines) {
      this.scene.remove(this.previewSideLines)
      this.previewSideLines.geometry.dispose()
      this.previewSideLines = null
    }

    this.pointA = null
    this.pointACreated = false
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

    const A = this.pointA.position.clone()
    const B = pos.clone()

    if (A.distanceTo(B) < 0.001) return

    this.updateEdgePreview(A, B)
    this.updatePyramidPreview(A, B)
  }
  onMouseMove(_event: MouseEvent) { }

  onPointerDown(event: PointerEvent) {
    const result = this.getOrCreatePoint(event)
    const point = result.point

    if (!this.pointA) {
      this.pointA = point
      this.pointACreated = result.created
      return
    }

    if (point === this.pointA || point.position.distanceTo(this.pointA.position) < 0.001) {
      if (result.created) this.removeCreatedPoint(point)
      return
    }

    const edge = new LineSegment(this.pointA, point)
    this.scene.add(edge.mesh)

    const ownedPoints = [
      ...(this.pointACreated ? [this.pointA] : []),
      ...(result.created ? [point] : []),
    ]

    this.lastPyramid = new Pyramid(
      this.scene,
      this.selectableObjects,
      this.pointA,
      point,
      this.sideCount,
      edge,
      ownedPoints
    )
    this.recordCreation(
      "Piramit oluştur",
      [
        ...ownedPoints,
        edge.mesh,
        this.lastPyramid.pointC,
        this.lastPyramid.apexPoint,
        this.lastPyramid.centerPoint,
        this.lastPyramid.mesh,
        this.lastPyramid.baseLine,
        this.lastPyramid.sideLines,
        this.lastPyramid.heightLine,
        ...(this.lastPyramid.unFoldGroup ? [this.lastPyramid.unFoldGroup] : []),
        ...this.lastPyramid.cornerPoints,
      ],
      [edge, this.lastPyramid]
    )

    this.reset()
    this.complete()
  }

  onClick(event: MouseEvent) { this.onPointerDown(event as PointerEvent) }

  updateEdgePreview(A: THREE.Vector3, B: THREE.Vector3) {
    if (this.edgePreview) {
      this.scene.remove(this.edgePreview)
      this.edgePreview.geometry.dispose()
      this.edgePreview = null
    }

    const geometry = new THREE.BufferGeometry().setFromPoints([A, B])
    const material = new THREE.LineBasicMaterial({ color: 0xff0000 })

    this.edgePreview = new THREE.Line(geometry, material)
    this.scene.add(this.edgePreview)
  }

  updatePyramidPreview(A: THREE.Vector3, B: THREE.Vector3) {
    const preview = this.createPreviewGeometry(A, B)

    if (!preview) return

    if (!this.pyramidPreview) {
      const material = new THREE.MeshStandardMaterial({
        color: 0xd2a679,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
      })

      this.pyramidPreview = new THREE.Mesh(preview.meshGeometry, material)
      this.scene.add(this.pyramidPreview)
    } else {
      this.pyramidPreview.geometry.dispose()
      this.pyramidPreview.geometry = preview.meshGeometry
    }

    if (!this.previewSideLines) {
      const material = new THREE.LineBasicMaterial({ color: 0x000000 })
      this.previewSideLines = new THREE.LineSegments(
        preview.lineGeometry,
        material
      )
      this.scene.add(this.previewSideLines)
    } else {
      this.previewSideLines.geometry.dispose()
      this.previewSideLines.geometry = preview.lineGeometry
    }
  }

  private createPreviewGeometry(A: THREE.Vector3, B: THREE.Vector3) {
    const C = this.createInitialC(A, B)
    const baseVertices = this.createPolygonVertices(A, B, C)

    if (baseVertices.length < 3) return null

    const normal = this.getBaseNormal(A, B, C)
    if (!normal) return null

    normal.multiplyScalar(-1)

    const height = A.distanceTo(B)
    const center = this.getPolygonCenter(baseVertices)
    const apex = center.clone().add(normal.multiplyScalar(height))

    return {
      meshGeometry: this.buildMeshGeometry(baseVertices, apex),
      lineGeometry: this.buildLineGeometry(baseVertices, apex),
    }
  }

  private createInitialC(A: THREE.Vector3, B: THREE.Vector3) {
    const AB = new THREE.Vector3().subVectors(B, A)
    const length = AB.length()

    const mid = new THREE.Vector3()
      .addVectors(A, B)
      .multiplyScalar(0.5)

    const ABxz = new THREE.Vector3(AB.x, 0, AB.z)

    if (ABxz.length() < 0.0001) {
      return mid.clone().add(new THREE.Vector3(1, 0, 0))
    }

    ABxz.normalize()

    const perpendicular = new THREE.Vector3(
      -ABxz.z,
      0,
      ABxz.x
    )

    return mid.add(perpendicular.multiplyScalar(length))
  }

  private createPolygonVertices(
    A: THREE.Vector3,
    B: THREE.Vector3,
    C: THREE.Vector3
  ) {
    const n = this.sideCount
    const theta = (2 * Math.PI) / n

    const AB = new THREE.Vector3().subVectors(B, A)
    const AC = new THREE.Vector3().subVectors(C, A)

    const sideLength = AB.length()

    if (sideLength < 0.0001) return [A]

    let normal = new THREE.Vector3().crossVectors(AB, AC)

    if (normal.length() < 0.0001) return [A, B]

    normal.normalize()

    const mid = new THREE.Vector3()
      .addVectors(A, B)
      .multiplyScalar(0.5)

    let perpendicularInPlane = new THREE.Vector3()
      .crossVectors(normal, AB)
      .normalize()

    const centerDistance = sideLength / (2 * Math.tan(Math.PI / n))

    if (new THREE.Vector3().subVectors(C, mid).dot(perpendicularInPlane) > 0) {
      perpendicularInPlane.multiplyScalar(-1)
    }

    const center = mid
      .clone()
      .add(perpendicularInPlane.multiplyScalar(centerDistance))

    const testB = this.rotateAroundAxis(A, center, normal, theta)

    if (testB.distanceTo(B) > 0.001) {
      normal.multiplyScalar(-1)
    }

    const vertices: THREE.Vector3[] = []

    for (let i = 0; i < n; i++) {
      vertices.push(
        this.rotateAroundAxis(A, center, normal, theta * i)
      )
    }

    return vertices
  }

  private getBaseNormal(
    A: THREE.Vector3,
    B: THREE.Vector3,
    C: THREE.Vector3
  ) {
    const AB = new THREE.Vector3().subVectors(B, A)
    const AC = new THREE.Vector3().subVectors(C, A)

    const normal = new THREE.Vector3().crossVectors(AB, AC)

    if (normal.length() < 0.0001) return null

    return normal.normalize()
  }

  private getPolygonCenter(vertices: THREE.Vector3[]) {
    const center = new THREE.Vector3()

    for (const vertex of vertices) {
      center.add(vertex)
    }

    return center.divideScalar(vertices.length)
  }

  private buildMeshGeometry(
    baseVertices: THREE.Vector3[],
    apex: THREE.Vector3
  ) {
    const n = baseVertices.length

    const vertices: number[] = []
    const indices: number[] = []

    for (const p of baseVertices) {
      vertices.push(p.x, p.y, p.z)
    }

    vertices.push(apex.x, apex.y, apex.z)

    const apexIndex = n

    for (let i = 1; i < n - 1; i++) {
      indices.push(0, i, i + 1)
    }

    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n
      indices.push(i, next, apexIndex)
    }

    const geometry = new THREE.BufferGeometry()

    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3)
    )

    geometry.setIndex(indices)
    geometry.computeVertexNormals()

    return geometry
  }

  private buildLineGeometry(
    baseVertices: THREE.Vector3[],
    apex: THREE.Vector3
  ) {
    const points: THREE.Vector3[] = []

    for (let i = 0; i < baseVertices.length; i++) {
      const next = (i + 1) % baseVertices.length

      points.push(baseVertices[i].clone())
      points.push(baseVertices[next].clone())

      points.push(baseVertices[i].clone())
      points.push(apex.clone())
    }

    return new THREE.BufferGeometry().setFromPoints(points)
  }

  private rotateAroundAxis(
    point: THREE.Vector3,
    center: THREE.Vector3,
    axis: THREE.Vector3,
    angle: number
  ) {
    return point
      .clone()
      .sub(center)
      .applyAxisAngle(axis, angle)
      .add(center)
  }

  private removeCreatedPoint(point: THREE.Mesh) {
    this.scene.remove(point)
    const index = this.selectableObjects.indexOf(point)
    if (index >= 0) this.selectableObjects.splice(index, 1)
    point.geometry.dispose()
  }
}
