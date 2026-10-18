import * as THREE from "three"
import { BaseTool } from "./BaseTool"
import { createPoint } from "../objects/Point"
import { LineSegment } from "../objects/LineSegment"
import { Prism } from "../objects/Prism"
import { getNearestSelectablePoint, getPointerIntersection, getPointerPointSize, PREVIEW_POINT_SIZE, shouldShowPointerPreview, updatePointCursor } from "../interaction/Pointer"

export class PrismTool extends BaseTool {
  selectableObjects: THREE.Object3D[]
  sideCount = 4

  pointA: THREE.Mesh | null = null
  private pointACreated = false

  cursorPreview: THREE.Mesh
  edgePreview: THREE.Line | null = null
  prismPreview: THREE.Mesh | null = null
  lastPrism: Prism | null = null

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

  setSideCount(n: number) {
    console.log("slider:", n)
    this.sideCount = n
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

    if (this.prismPreview) {
      this.scene.remove(this.prismPreview)
      this.prismPreview.geometry.dispose()
      this.prismPreview = null
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
    this.updatePrismPreview(A, B)
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

    this.lastPrism = new Prism(
      this.scene,
      this.selectableObjects,
      this.pointA,
      point,
      this.sideCount,
      edge,
      ownedPoints
    )
    this.recordCreation(
      "Prizma oluştur",
      [
        ...ownedPoints,
        edge.mesh,
        this.lastPrism.pointC,
        this.lastPrism.pointAprime,
        this.lastPrism.mesh,
        this.lastPrism.baseLine,
        this.lastPrism.topLine,
        this.lastPrism.heightLine,
        this.lastPrism.sideLines,
        ...(this.lastPrism.unFoldGroup ? [this.lastPrism.unFoldGroup] : []),
        ...this.lastPrism.cornerPoints,
      ],
      [edge, this.lastPrism]
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

  updatePrismPreview(A: THREE.Vector3, B: THREE.Vector3) {
    const geometry = this.createPreviewGeometry(A, B)

    if (!geometry) return

    if (!this.prismPreview) {
      const material = new THREE.MeshStandardMaterial({
        color: 0xd2a679,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
      })

      this.prismPreview = new THREE.Mesh(geometry, material)
      this.scene.add(this.prismPreview)
      return
    }

    this.prismPreview.geometry.dispose()
    this.prismPreview.geometry = geometry
  }

  private createPreviewGeometry(A: THREE.Vector3, B: THREE.Vector3) {
    const C = this.createInitialC(A, B)
    const baseVertices = this.createPolygonVertices(A, B, C)

    if (baseVertices.length < 3) return null

    const normal = this.getBaseNormal(A, B, C)

    if (!normal) return null

    normal.multiplyScalar(-1)

    const height = A.distanceTo(B)

    const topVertices = baseVertices.map((p) =>
      p.clone().add(normal.clone().multiplyScalar(height))
    )

    return this.buildGeometry(baseVertices, topVertices)
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

  private buildGeometry(
    baseVertices: THREE.Vector3[],
    topVertices: THREE.Vector3[]
  ) {
    const n = baseVertices.length

    const vertices: number[] = []
    const indices: number[] = []

    for (const p of baseVertices) {
      vertices.push(p.x, p.y, p.z)
    }

    for (const p of topVertices) {
      vertices.push(p.x, p.y, p.z)
    }

    for (let i = 1; i < n - 1; i++) {
      indices.push(0, i, i + 1)
    }

    for (let i = 1; i < n - 1; i++) {
      indices.push(n, n + i + 1, n + i)
    }

    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n

      const a = i
      const b = next
      const c = n + next
      const d = n + i

      indices.push(a, b, d)
      indices.push(b, c, d)
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
