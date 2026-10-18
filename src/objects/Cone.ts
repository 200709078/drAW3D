import * as THREE from "three"
import { LineSegment } from "./LineSegment"
import { HEIGHT_POINT_SIZE } from "../interaction/Pointer"
import { updateConstrainedPoints } from "../interaction/LineSegmentConstraint"
import { getRandomColor } from "../utils/color"
import { ConeUnfolder } from "../unfold/ConeUnfolder"

export class Cone {
  baseCenterPoint: THREE.Mesh
  radiusPoint: THREE.Mesh
  apexPoint: THREE.Mesh

  initialEdge: LineSegment | null = null
  ownedPoints: THREE.Mesh[] = []
  mesh: THREE.Mesh
  baseLine: THREE.LineLoop
  heightLine: THREE.Line
  slantLine: THREE.Line
  constrainedPoints: THREE.Mesh[] = []

  height: number
  unFoldAngle = 0
  unFoldGroup: THREE.Group | null = null
  private unFolder: ConeUnfolder | null = null

  constructor(
    scene: THREE.Scene,
    selectableObjects: THREE.Object3D[],
    baseCenterPoint: THREE.Mesh,
    radiusPoint: THREE.Mesh,
    initialEdge?: LineSegment,
    ownedPoints: THREE.Mesh[] = []
  ) {
    this.baseCenterPoint = baseCenterPoint
    this.radiusPoint = radiusPoint
    this.initialEdge = initialEdge ?? null
    this.ownedPoints = ownedPoints
    this.height = baseCenterPoint.position.distanceTo(radiusPoint.position) * 2
    this.apexPoint = this.createPurplePoint(baseCenterPoint.position.clone())

    this.baseCenterPoint.userData.pointRole ??= "free"
    this.radiusPoint.userData.pointRole ??= "free"
    this.apexPoint.userData.pointRole = "height"
    this.apexPoint.userData.owner = this
    this.ownedPoints.forEach((point) => {
      point.userData.owner = this
    })

    scene.add(this.apexPoint)
    selectableObjects.push(this.apexPoint)

    this.mesh = new THREE.Mesh(
      new THREE.ConeGeometry(1, 1, 64, 1, false),
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

    this.heightLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({
        color: 0x800080,
        dashSize: 0.15,
        gapSize: 0.1,
      })
    )

    this.slantLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({
        color: 0x000000,
        dashSize: 0.15,
        gapSize: 0.1,
      })
    )

    this.unFoldGroup = new THREE.Group()
    this.unFoldGroup.name = "ConeUnFoldGroup"
    this.unFolder = new ConeUnfolder(this.unFoldGroup)

    scene.add(this.mesh)
    scene.add(this.baseLine)
    scene.add(this.heightLine)
    scene.add(this.slantLine)
    scene.add(this.unFoldGroup)

    this.baseCenterPoint.userData.dependents ??= []
    this.radiusPoint.userData.dependents ??= []
    this.apexPoint.userData.dependents ??= []

    this.baseCenterPoint.userData.dependents.push(this)
    this.radiusPoint.userData.dependents.push(this)

    this.update()
  }

  onBeforeDelete() {
    if (!this.initialEdge) return

    this.removeDependent(this.baseCenterPoint, this.initialEdge)
    this.removeDependent(this.radiusPoint, this.initialEdge)
  }

  getOwnedObjectsForDeletion() {
    const objects: Array<THREE.Object3D | null> = [
      ...this.ownedPoints,
      this.apexPoint,
      this.mesh,
      this.initialEdge?.mesh ?? null,
      this.baseLine,
      this.heightLine,
      this.slantLine,
      this.unFoldGroup,
      ...this.constrainedPoints,
    ]

    return objects.filter((object): object is THREE.Object3D => object instanceof THREE.Object3D)
  }

  moveAlongNormal(delta: number) {
    this.height = Math.max(0.05, this.height + delta)
    this.update()
  }

  setUnFoldAngle(angle: number) {
    this.unFoldAngle = THREE.MathUtils.clamp(angle, 0, this.getMaxUnFoldAngle())
    this.updateUnFold()
  }

  getMaxUnFoldAngle() {
    const radius = this.getRadius()

    if (radius < 0.0001 || this.height < 0.0001) return 0

    const slantHeight = Math.hypot(radius, this.height)
    const acuteLinePlaneAngle = THREE.MathUtils.radToDeg(
      Math.asin(THREE.MathUtils.clamp(this.height / slantHeight, -1, 1))
    )

    return THREE.MathUtils.clamp(180 - acuteLinePlaneAngle, 0, 180)
  }

  update() {
    const radius = this.getRadius()

    if (radius < 0.0001) return

    const baseCenter = this.baseCenterPoint.position.clone()
    const heightDirection = this.getHeightDirection()
    const apex = baseCenter.clone().add(heightDirection.clone().multiplyScalar(this.height))

    this.apexPoint.position.copy(apex)
    this.updateDependentsOf(this.apexPoint)

    this.mesh.position.copy(
      new THREE.Vector3().addVectors(baseCenter, apex).multiplyScalar(0.5)
    )
    this.mesh.scale.set(radius, this.height, radius)
    this.mesh.quaternion.copy(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        heightDirection
      )
    )

    this.updateBaseLine(baseCenter, radius, heightDirection)
    this.updateHeightLine(baseCenter, apex)
    this.updateSlantLine(apex)
    this.updateUnFold(baseCenter, radius, heightDirection, apex)
    updateConstrainedPoints(this)
  }

  getSurfaceFrame() {
    const radius = this.getRadius()
    const baseCenter = this.baseCenterPoint.position.clone()
    const heightDirection = this.getHeightDirection()
    const apex = baseCenter.clone().add(heightDirection.clone().multiplyScalar(this.height))
    const radiusDirection = new THREE.Vector3()
      .subVectors(this.radiusPoint.position, this.baseCenterPoint.position)

    if (radius < 0.0001 || radiusDirection.lengthSq() < 0.000001) return null

    radiusDirection.normalize()

    const tangentDirection = new THREE.Vector3()
      .crossVectors(heightDirection, radiusDirection)
      .normalize()

    return {
      apex,
      baseCenter,
      height: this.height,
      heightDirection,
      radius,
      radiusDirection,
      tangentDirection,
    }
  }

  updateUnFold(
    baseCenter = this.baseCenterPoint.position.clone(),
    radius = this.getRadius(),
    heightDirection = this.getHeightDirection(),
    apex = baseCenter.clone().add(heightDirection.clone().multiplyScalar(this.height))
  ) {
    if (radius < 0.0001) {
      this.unFolder?.update({
        baseCenter,
        baseVertices: [],
        radiusPoint: this.radiusPoint.position.clone(),
        apex,
        heightDirection,
        angle: 0,
        maxAngle: 0,
      })
      return
    }

    this.unFolder?.update({
      baseCenter,
      baseVertices: this.createCirclePoints(baseCenter, radius, heightDirection),
      radiusPoint: this.radiusPoint.position.clone(),
      apex,
      heightDirection,
      angle: this.unFoldAngle,
      maxAngle: this.getMaxUnFoldAngle(),
    })
  }

  getHeightDirection() {
    const radiusDirection = new THREE.Vector3()
      .subVectors(this.radiusPoint.position, this.baseCenterPoint.position)

    if (radiusDirection.length() < 0.0001) {
      return new THREE.Vector3(0, 1, 0)
    }

    radiusDirection.normalize()

    const worldUp = new THREE.Vector3(0, 1, 0)
    const heightDirection = worldUp.sub(
      radiusDirection.clone().multiplyScalar(worldUp.dot(radiusDirection))
    )

    if (heightDirection.length() < 0.0001) {
      return new THREE.Vector3(1, 0, 0)
    }

    return heightDirection.normalize()
  }

  private getRadius() {
    return this.baseCenterPoint.position.distanceTo(this.radiusPoint.position)
  }

  private updateBaseLine(
    baseCenter: THREE.Vector3,
    radius: number,
    heightDirection: THREE.Vector3
  ) {
    this.baseLine.geometry.dispose()
    this.baseLine.geometry = new THREE.BufferGeometry().setFromPoints(
      this.createCirclePoints(baseCenter, radius, heightDirection)
    )
  }

  private updateHeightLine(baseCenter: THREE.Vector3, apex: THREE.Vector3) {
    this.heightLine.geometry.dispose()
    this.heightLine.geometry = new THREE.BufferGeometry().setFromPoints([
      baseCenter,
      apex,
    ])
    this.heightLine.computeLineDistances()
  }

  private updateSlantLine(apex: THREE.Vector3) {
    this.slantLine.geometry.dispose()
    this.slantLine.geometry = new THREE.BufferGeometry().setFromPoints([
      this.radiusPoint.position.clone(),
      apex,
    ])
    this.slantLine.computeLineDistances()
  }

  private createCirclePoints(
    center: THREE.Vector3,
    radius: number,
    heightDirection: THREE.Vector3
  ) {
    const points: THREE.Vector3[] = []
    const segments = 96
    const radiusDirection = new THREE.Vector3()
      .subVectors(this.radiusPoint.position, this.baseCenterPoint.position)
      .normalize()
    const tangentDirection = new THREE.Vector3()
      .crossVectors(heightDirection, radiusDirection)
      .normalize()

    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2

      points.push(
        center
          .clone()
          .add(radiusDirection.clone().multiplyScalar(Math.cos(angle) * radius))
          .add(tangentDirection.clone().multiplyScalar(Math.sin(angle) * radius))
      )
    }

    return points
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

  private updateDependentsOf(object: THREE.Object3D) {
    object.userData.dependents?.forEach((dependent: any) => {
      if (dependent === this) return
      dependent.update?.()
    })
  }

  private removeDependent(point: THREE.Object3D, dependent: unknown) {
    const dependents = point.userData.dependents

    if (!Array.isArray(dependents)) return

    point.userData.dependents = dependents.filter((item: unknown) => item !== dependent)
  }
}
