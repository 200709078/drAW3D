import * as THREE from "three"
import { LineSegment } from "./LineSegment"
import { updateConstrainedPoints } from "../interaction/LineSegmentConstraint"
import { getRandomColor } from "../utils/color"

export class SphereObject {
  centerPoint: THREE.Mesh
  surfacePoint: THREE.Mesh
  mesh: THREE.Mesh
  ownedPoints: THREE.Mesh[]
  constrainedPoints: THREE.Mesh[] = []
  radiusSegmentObject: LineSegment | null = null
  radiusSegment: THREE.Mesh | null = null
  originalRadiusColor: THREE.Color | null = null

  constructor(
    centerPoint: THREE.Mesh,
    surfacePoint: THREE.Mesh,
    selectableObjects?: THREE.Object3D[],
    radiusSegment?: LineSegment,
    ownedPoints: THREE.Mesh[] = []
  ) {
    this.centerPoint = centerPoint
    this.surfacePoint = surfacePoint
    this.radiusSegmentObject = radiusSegment ?? null
    this.radiusSegment = radiusSegment?.mesh ?? null
    this.ownedPoints = ownedPoints

    const geometry = new THREE.SphereGeometry(1, 32, 32)
    const material = new THREE.MeshStandardMaterial({
      color: getRandomColor(),
      transparent: true,
      opacity: 0.55,
    })

    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    this.mesh.userData.selectableType = "solid"
    this.mesh.userData.owner = this
    this.mesh.userData.selectionOutline = "none"

    selectableObjects?.push(this.mesh)

    this.centerPoint.userData.dependents ??= []
    this.surfacePoint.userData.dependents ??= []

    this.centerPoint.userData.dependents.push(this)
    this.surfacePoint.userData.dependents.push(this)

    this.update()
  }

  onBeforeDelete() {
    if (!this.radiusSegmentObject) return

    this.removeDependent(this.centerPoint, this.radiusSegmentObject)
    this.removeDependent(this.surfacePoint, this.radiusSegmentObject)
  }

  getOwnedObjectsForDeletion() {
    const objects: Array<THREE.Object3D | null> = [
      this.mesh,
      this.radiusSegment,
      ...this.ownedPoints,
      ...this.constrainedPoints,
    ]

    return objects.filter((object): object is THREE.Object3D => object instanceof THREE.Object3D)
  }

  onSelect() {
    const material = this.radiusSegment?.material

    if (!material || Array.isArray(material) || !("color" in material)) return

    const colorMaterial = material as THREE.Material & { color: THREE.Color }

    this.originalRadiusColor = colorMaterial.color.clone()
    colorMaterial.color.set(0xffaa00)
  }

  onDeselect() {
    const material = this.radiusSegment?.material

    if (
      !this.originalRadiusColor ||
      !material ||
      Array.isArray(material) ||
      !("color" in material)
    ) {
      return
    }

    const colorMaterial = material as THREE.Material & { color: THREE.Color }

    colorMaterial.color.copy(this.originalRadiusColor)
    this.originalRadiusColor = null
  }

  update() {
    const center = this.centerPoint.position
    const surface = this.surfacePoint.position

    const radius = center.distanceTo(surface)

    this.mesh.position.copy(center)
    this.mesh.scale.set(radius, radius, radius)
    updateConstrainedPoints(this)
  }

  private removeDependent(point: THREE.Object3D, dependent: unknown) {
    const dependents = point.userData.dependents

    if (!Array.isArray(dependents)) return

    point.userData.dependents = dependents.filter((item: unknown) => item !== dependent)
  }
}
