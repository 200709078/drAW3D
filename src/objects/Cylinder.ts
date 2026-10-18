import * as THREE from "three"
import { LineSegment } from "./LineSegment"
import { HEIGHT_POINT_SIZE, LOCKED_POINT_SIZE } from "../interaction/Pointer"
import { updateConstrainedPoints } from "../interaction/LineSegmentConstraint"
import { getRandomColor } from "../utils/color"
import { CylinderUnfolder } from "../unfold/CylinderUnfolder"

export class Cylinder {
  baseCenterPoint: THREE.Mesh
  radiusPoint: THREE.Mesh
  topCenterPoint: THREE.Mesh
  topRadiusPoint: THREE.Mesh

  initialEdge: LineSegment | null = null
  ownedPoints: THREE.Mesh[] = []
  mesh: THREE.Mesh
  baseLine: THREE.LineLoop
  topLine: THREE.LineLoop
  heightLine: THREE.Line
  slantLine: THREE.Line
  constrainedPoints: THREE.Mesh[] = []

  height: number
  unFoldAngle = 0
  unFoldGroup: THREE.Group | null = null
  private unFolder: CylinderUnfolder | null = null

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
    this.topCenterPoint = this.createPurplePoint(baseCenterPoint.position.clone())
    this.topRadiusPoint = this.createGrayPoint(radiusPoint.position.clone())

    this.baseCenterPoint.userData.pointRole ??= "free"
    this.radiusPoint.userData.pointRole ??= "free"
    this.topCenterPoint.userData.pointRole = "height"
    this.topRadiusPoint.userData.pointRole = "locked"
    this.topCenterPoint.userData.owner = this
    this.topRadiusPoint.userData.owner = this
    this.ownedPoints.forEach((point) => {
      point.userData.owner = this
    })

    scene.add(this.topCenterPoint)
    scene.add(this.topRadiusPoint)
    selectableObjects.push(this.topCenterPoint)
    selectableObjects.push(this.topRadiusPoint)

    this.mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 1, 64, 1, false),
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

    this.slantLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({
        color: 0x000000,
        dashSize: 0.15,
        gapSize: 0.1,
      })
    )

    this.unFoldGroup = new THREE.Group()
    this.unFoldGroup.name = "CylinderUnFoldGroup"
    this.unFolder = new CylinderUnfolder(this.unFoldGroup)

    scene.add(this.mesh)
    scene.add(this.baseLine)
    scene.add(this.topLine)
    scene.add(this.heightLine)
    scene.add(this.slantLine)
    scene.add(this.unFoldGroup)

    this.baseCenterPoint.userData.dependents ??= []
    this.radiusPoint.userData.dependents ??= []
    this.topCenterPoint.userData.dependents ??= []
    this.topRadiusPoint.userData.dependents ??= []

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
      this.topCenterPoint,
      this.topRadiusPoint,
      this.mesh,
      this.initialEdge?.mesh ?? null,
      this.baseLine,
      this.topLine,
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
    this.unFoldAngle = THREE.MathUtils.clamp(angle, 0, 90)
    this.updateUnFold()
  }

  update() {
    const radius = this.getRadius()

    if (radius < 0.0001) return

    const baseCenter = this.baseCenterPoint.position.clone()
    const heightDirection = this.getHeightDirection()
    const topCenter = baseCenter.clone().add(heightDirection.clone().multiplyScalar(this.height))

    this.topCenterPoint.position.copy(topCenter)
    this.updateDependentsOf(this.topCenterPoint)

    this.mesh.position.copy(
      new THREE.Vector3().addVectors(baseCenter, topCenter).multiplyScalar(0.5)
    )
    this.mesh.scale.set(radius, this.height, radius)
    this.mesh.quaternion.copy(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        heightDirection
      )
    )

    this.updateCircleLines(baseCenter, topCenter, radius, heightDirection)
    this.updateHeightLine(baseCenter, topCenter)
    this.updateSlantLine(heightDirection)
    this.updateUnFold(radius, heightDirection, topCenter)
    updateConstrainedPoints(this)
  }

  getSurfaceFrame() {
    const radius = this.getRadius()
    const baseCenter = this.baseCenterPoint.position.clone()
    const heightDirection = this.getHeightDirection()
    const topCenter = baseCenter.clone().add(heightDirection.clone().multiplyScalar(this.height))
    const radiusDirection = new THREE.Vector3()
      .subVectors(this.radiusPoint.position, this.baseCenterPoint.position)

    if (radius < 0.0001 || radiusDirection.lengthSq() < 0.000001) return null

    radiusDirection.normalize()

    const tangentDirection = new THREE.Vector3()
      .crossVectors(heightDirection, radiusDirection)
      .normalize()

    return {
      baseCenter,
      height: this.height,
      heightDirection,
      radius,
      radiusDirection,
      tangentDirection,
      topCenter,
    }
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

  private updateCircleLines(
    baseCenter: THREE.Vector3,
    topCenter: THREE.Vector3,
    radius: number,
    heightDirection: THREE.Vector3
  ) {
    const basePoints = this.createCirclePoints(baseCenter, radius, heightDirection)
    const topPoints = this.createCirclePoints(topCenter, radius, heightDirection)

    this.baseLine.geometry.dispose()
    this.baseLine.geometry = new THREE.BufferGeometry().setFromPoints(basePoints)

    this.topLine.geometry.dispose()
    this.topLine.geometry = new THREE.BufferGeometry().setFromPoints(topPoints)
  }

  private updateHeightLine(baseCenter: THREE.Vector3, topCenter: THREE.Vector3) {
    this.heightLine.geometry.dispose()
    this.heightLine.geometry = new THREE.BufferGeometry().setFromPoints([
      baseCenter,
      topCenter,
    ])
    this.heightLine.computeLineDistances()
  }

  private updateSlantLine(heightDirection: THREE.Vector3) {
    const topRadiusPoint = this.radiusPoint.position
      .clone()
      .add(heightDirection.clone().multiplyScalar(this.height))

    this.topRadiusPoint.position.copy(topRadiusPoint)
    this.updateDependentsOf(this.topRadiusPoint)

    this.slantLine.geometry.dispose()
    this.slantLine.geometry = new THREE.BufferGeometry().setFromPoints([
      this.radiusPoint.position.clone(),
      this.topRadiusPoint.position.clone(),
    ])
    this.slantLine.computeLineDistances()
  }

  updateUnFold(
    radius = this.getRadius(),
    heightDirection = this.getHeightDirection(),
    topCenter = this.topCenterPoint.position.clone()
  ) {
    const radiusDirection = new THREE.Vector3()
      .subVectors(this.radiusPoint.position, this.baseCenterPoint.position)

    if (radiusDirection.length() < 0.0001) {
      this.unFolder?.update({
        radius,
        topCenter,
        basePoint: this.radiusPoint.position.clone(),
        topPoint: this.topRadiusPoint.position.clone(),
        heightDirection,
        radiusDirection: new THREE.Vector3(1, 0, 0),
        angle: 0,
      })
      return
    }

    this.unFolder?.update({
      radius,
      topCenter,
      basePoint: this.radiusPoint.position.clone(),
      topPoint: this.topRadiusPoint.position.clone(),
      heightDirection,
      radiusDirection: radiusDirection.normalize(),
      angle: this.unFoldAngle,
    })
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
