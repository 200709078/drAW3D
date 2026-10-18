import * as THREE from "three"
import { createPoint } from "./Point"
import { LineSegment } from "./LineSegment"
import { HEIGHT_POINT_SIZE, LOCKED_POINT_SIZE } from "../interaction/Pointer"
import { updateConstrainedPoints } from "../interaction/LineSegmentConstraint"
import { getRandomColor } from "../utils/color"
import { PrismUnfolder } from "../unfold/PrismUnfolder"

export class Prism {
  pointA: THREE.Mesh
  pointB: THREE.Mesh
  pointC: THREE.Mesh
  pointAprime: THREE.Mesh

  mesh: THREE.Mesh
  initialEdge: LineSegment | null = null
  baseLine: THREE.LineLoop
  topLine: THREE.LineLoop
  heightLine: THREE.Line

  sideLines: THREE.LineSegments
  cornerPoints: THREE.Mesh[] = []
  ownedPoints: THREE.Mesh[] = []
  constrainedPoints: THREE.Mesh[] = []

  selectableObjects: THREE.Object3D[]

  sideCount: number
  height: number
  unFoldAngle = 0
  unFoldGroup: THREE.Group | null = null
  private unFolder: PrismUnfolder | null = null

  constructor(
    scene: THREE.Scene,
    selectableObjects: THREE.Object3D[],
    pointA: THREE.Mesh,
    pointB: THREE.Mesh,
    sideCount = 4,
    initialEdge?: LineSegment,
    ownedPoints: THREE.Mesh[] = []
  ) {
    this.pointA = pointA
    this.pointB = pointB
    this.initialEdge = initialEdge ?? null
    this.ownedPoints = ownedPoints
    this.sideCount = sideCount
    this.height = pointA.position.distanceTo(pointB.position)
    this.selectableObjects = selectableObjects

    const pointCObject = createPoint(
      this.createInitialC(pointA.position, pointB.position),
      this.getPointRadius(pointA)
    )

    this.pointC = pointCObject
    this.pointAprime = this.createPurplePoint(pointA.position.clone())

    this.pointA.userData.pointRole ??= "free"
    this.pointB.userData.pointRole ??= "free"
    this.pointC.userData.pointRole = "free"
    this.pointAprime.userData.pointRole = "height"
    this.pointC.userData.owner = this
    this.pointAprime.userData.owner = this
    this.ownedPoints.forEach((point) => {
      point.userData.owner = this
    })

    scene.add(this.pointC)
    scene.add(this.pointAprime)

    selectableObjects.push(this.pointC)
    selectableObjects.push(this.pointAprime)

    this.mesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshStandardMaterial({
        color: getRandomColor(),
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
      })
    )
    this.mesh.userData.selectableType = "solid"
    this.mesh.userData.owner = this
    selectableObjects.push(this.mesh)

    this.baseLine = new THREE.LineLoop(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x000000 })
    )

    this.topLine = new THREE.LineLoop(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x000000 })
    )

    this.heightLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({
        color: 0x800080,
        dashSize: 0.15,
        gapSize: 0.1,
      })
    )

    this.sideLines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x000000 })
    )

    this.unFoldGroup = new THREE.Group()
    this.unFoldGroup.name = "PrismUnFoldGroup"
    this.unFolder = new PrismUnfolder(this.unFoldGroup)

    scene.add(this.mesh)
    scene.add(this.baseLine)
    scene.add(this.topLine)
    scene.add(this.heightLine)
    scene.add(this.sideLines)
    scene.add(this.unFoldGroup)

    this.pointA.userData.dependents ??= []
    this.pointB.userData.dependents ??= []
    this.pointC.userData.dependents ??= []
    this.pointAprime.userData.dependents ??= []

    this.pointA.userData.dependents.push(this)
    this.pointB.userData.dependents.push(this)
    this.pointC.userData.dependents.push(this)

    this.update()
  }

  onBeforeDelete() {
    if (!this.initialEdge) return

    this.removeDependent(this.pointA, this.initialEdge)
    this.removeDependent(this.pointB, this.initialEdge)
  }

  getOwnedObjectsForDeletion() {
    const objects: Array<THREE.Object3D | null> = [
      this.pointA,
      this.pointB,
      this.pointC,
      this.pointAprime,
      this.mesh,
      this.initialEdge?.mesh ?? null,
      this.baseLine,
      this.topLine,
      this.heightLine,
      this.sideLines,
      this.unFoldGroup,
      ...this.cornerPoints,
      ...this.constrainedPoints,
    ]

    return objects.filter((object): object is THREE.Object3D => object instanceof THREE.Object3D)
  }

  setSideCount(n: number) {
    this.sideCount = n
    this.update()
  }

  setUnFoldAngle(angle: number) {
    this.unFoldAngle = THREE.MathUtils.clamp(angle, 0, 90)
    this.updateUnFold()
  }

  moveAlongNormal(delta: number) {
    this.height += delta
    this.update()
  }

  update() {
    const baseVertices = this.createPolygonVertices()
    if (baseVertices.length < 3) return

    const normal = this.getBaseNormal()
    if (!normal) return

    // Prizma tabanın diğer tarafında oluşsun.
    normal.multiplyScalar(-1)

    this.pointAprime.position.copy(
      this.pointA.position.clone().add(
        normal.clone().multiplyScalar(this.height)
      )
    )

    this.updateDependentsOf(this.pointAprime)

    const topVertices = baseVertices.map((p) =>
      p.clone().add(normal.clone().multiplyScalar(this.height))
    )

    this.updateLines(baseVertices, topVertices)
    this.updateSideLines(baseVertices, topVertices)
    this.updateCornerPoints(baseVertices, topVertices)
    this.updateMesh(baseVertices, topVertices)
    this.updateHeightLine()
    this.updateUnFold(baseVertices, topVertices)
    updateConstrainedPoints(this)
  }

  getEdgeEndpoints(edgeIndex: number) {
    const baseVertices = this.createPolygonVertices()
    if (baseVertices.length < 3) return null

    const normal = this.getBaseNormal()
    if (!normal) return null

    normal.multiplyScalar(-1)

    const topVertices = baseVertices.map((p) =>
      p.clone().add(normal.clone().multiplyScalar(this.height))
    )

    const n = baseVertices.length
    const normalizedIndex = THREE.MathUtils.clamp(Math.floor(edgeIndex), 0, n * 3 - 1)

    if (normalizedIndex < n) {
      return {
        start: baseVertices[normalizedIndex].clone(),
        end: baseVertices[(normalizedIndex + 1) % n].clone(),
      }
    }

    if (normalizedIndex < n * 2) {
      const topIndex = normalizedIndex - n

      return {
        start: topVertices[topIndex].clone(),
        end: topVertices[(topIndex + 1) % n].clone(),
      }
    }

    const sideIndex = normalizedIndex - n * 2

    return {
      start: baseVertices[sideIndex].clone(),
      end: topVertices[sideIndex].clone(),
    }
  }

  getEdgeCount() {
    const baseVertices = this.createPolygonVertices()
    return baseVertices.length >= 3 ? baseVertices.length * 3 : 0
  }

  getFaceCount() {
    const baseVertices = this.createPolygonVertices()
    return baseVertices.length >= 3 ? baseVertices.length + 2 : 0
  }

  getFaceVertices(faceIndex: number) {
    const baseVertices = this.createPolygonVertices()
    if (baseVertices.length < 3) return null

    const normal = this.getBaseNormal()
    if (!normal) return null

    normal.multiplyScalar(-1)

    const topVertices = baseVertices.map((p) =>
      p.clone().add(normal.clone().multiplyScalar(this.height))
    )

    if (faceIndex === 0) {
      return baseVertices.map((vertex) => vertex.clone())
    }

    if (faceIndex === 1) {
      return topVertices.map((vertex) => vertex.clone())
    }

    const sideIndex = faceIndex - 2
    if (sideIndex < 0 || sideIndex >= baseVertices.length) return null

    const next = (sideIndex + 1) % baseVertices.length

    return [
      baseVertices[sideIndex].clone(),
      baseVertices[next].clone(),
      topVertices[next].clone(),
      topVertices[sideIndex].clone(),
    ]
  }

  updateUnFold(
    baseVertices = this.createPolygonVertices(),
    topVertices?: THREE.Vector3[]
  ) {
    if (baseVertices.length < 3) {
      this.unFolder?.update({
        baseVertices: [],
        topVertices: [],
        angle: 0,
      })
      return
    }

    if (!topVertices) {
      const normal = this.getBaseNormal()

      if (!normal) {
        this.unFolder?.update({
          baseVertices: [],
          topVertices: [],
          angle: 0,
        })
        return
      }

      normal.multiplyScalar(-1)
      topVertices = baseVertices.map((p) =>
        p.clone().add(normal.clone().multiplyScalar(this.height))
      )
    }

    this.unFolder?.update({
      baseVertices,
      topVertices,
      angle: this.unFoldAngle,
    })
  }

  private updateSideLines(
    baseVertices: THREE.Vector3[],
    topVertices: THREE.Vector3[]
  ) {
    const points: THREE.Vector3[] = []

    for (let i = 1; i < baseVertices.length; i++) {
      points.push(baseVertices[i].clone())
      points.push(topVertices[i].clone())
    }

    this.sideLines.geometry.dispose()
    this.sideLines.geometry = new THREE.BufferGeometry().setFromPoints(points)
  }

  private updateCornerPoints(
    baseVertices: THREE.Vector3[],
    topVertices: THREE.Vector3[]
  ) {
    const allVertices = [
      ...baseVertices.slice(2),
      ...topVertices.slice(1)
    ]

    while (this.cornerPoints.length < allVertices.length) {
      const point = this.createGrayPoint(new THREE.Vector3())
      this.cornerPoints.push(point)
      this.selectableObjects.push(point)
      this.mesh.parent?.add(point)
    }

    for (let i = 0; i < allVertices.length; i++) {
      this.cornerPoints[i].position.copy(allVertices[i])
      this.cornerPoints[i].visible = true
      this.updateDependentsOf(this.cornerPoints[i])
    }

    for (let i = allVertices.length; i < this.cornerPoints.length; i++) {
      this.cornerPoints[i].visible = false
    }
  }

  private updateDependentsOf(object: THREE.Object3D) {
    object.userData.dependents?.forEach((dependent: any) => {
      if (dependent === this) return
      dependent.update?.()
    })
  }

  private createGrayPoint(position: THREE.Vector3) {
    const geometry = new THREE.SphereGeometry(LOCKED_POINT_SIZE, 24, 24)

    const material = new THREE.MeshStandardMaterial({
      color: 0x808080,
    })

    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.copy(position)

    mesh.userData.pointRole = "locked"
    mesh.userData.owner = this
    mesh.userData.lockMouseDrag = true
    mesh.userData.lockWheel = true
    mesh.userData.dependents ??= []

    return mesh
  }

  private createPurplePoint(position: THREE.Vector3) {
    const geometry = new THREE.SphereGeometry(HEIGHT_POINT_SIZE, 24, 24)
    const material = new THREE.MeshStandardMaterial({
      color: 0x800080,
    })

    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.copy(position)

    mesh.userData.pointRole = "height"
    mesh.userData.owner = this
    mesh.userData.lockMouseDrag = true
    mesh.userData.normalWheelController = this
    mesh.userData.dependents ??= []

    return mesh
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

  private createPolygonVertices() {
    const A = this.pointA.position.clone()
    const B = this.pointB.position.clone()
    const C = this.pointC.position.clone()

    const n = this.sideCount
    const theta = (2 * Math.PI) / n

    const AB = new THREE.Vector3().subVectors(B, A)
    const AC = new THREE.Vector3().subVectors(C, A)

    const sideLength = AB.length()

    if (sideLength < 0.0001) {
      return [A]
    }

    let normal = new THREE.Vector3().crossVectors(AB, AC)

    if (normal.length() < 0.0001) {
      return [A, B]
    }

    normal.normalize()

    const mid = new THREE.Vector3()
      .addVectors(A, B)
      .multiplyScalar(0.5)

    let perpendicularInPlane = new THREE.Vector3()
      .crossVectors(normal, AB)
      .normalize()

    const centerDistance = sideLength / (2 * Math.tan(Math.PI / n))

    // M noktası C'nin ters tarafında olsun.
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

  private getBaseNormal() {
    const A = this.pointA.position.clone()
    const B = this.pointB.position.clone()
    const C = this.pointC.position.clone()

    const AB = new THREE.Vector3().subVectors(B, A)
    const AC = new THREE.Vector3().subVectors(C, A)

    const normal = new THREE.Vector3().crossVectors(AB, AC)

    if (normal.length() < 0.0001) {
      return null
    }

    return normal.normalize()
  }

  private updateLines(
    baseVertices: THREE.Vector3[],
    topVertices: THREE.Vector3[]
  ) {
    this.baseLine.geometry.dispose()
    this.baseLine.geometry = new THREE.BufferGeometry().setFromPoints(baseVertices)

    this.topLine.geometry.dispose()
    this.topLine.geometry = new THREE.BufferGeometry().setFromPoints(topVertices)
  }

  private updateHeightLine() {
    const points = [
      this.pointA.position.clone(),
      this.pointAprime.position.clone(),
    ]

    this.heightLine.geometry.dispose()
    this.heightLine.geometry = new THREE.BufferGeometry().setFromPoints(points)
    this.heightLine.computeLineDistances()
  }

  private updateMesh(
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

    this.mesh.geometry.dispose()
    this.mesh.geometry = geometry
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

  getHeightDirection() {
    const direction = new THREE.Vector3()
      .subVectors(this.pointAprime.position, this.pointA.position)

    if (direction.length() < 0.0001) {
      return new THREE.Vector3(0, 1, 0)
    }

    return direction.normalize()
  }

  private removeDependent(point: THREE.Object3D, dependent: unknown) {
    const dependents = point.userData.dependents

    if (!Array.isArray(dependents)) return

    point.userData.dependents = dependents.filter((item: unknown) => item !== dependent)
  }

  private getPointRadius(point: THREE.Mesh) {
    const geometry = point.geometry as THREE.BufferGeometry & {
      parameters?: { radius?: number }
    }

    return geometry.parameters?.radius
  }
}
