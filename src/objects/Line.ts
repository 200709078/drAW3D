import * as THREE from "three"
import { updateConstrainedPoints } from "../interaction/LineSegmentConstraint"
import { getRandomColor } from "../utils/color"

const LINE_RADIUS = 0.1
const LINE_RADIAL_SEGMENTS = 32

export class LineObject {
  pointA: THREE.Mesh
  pointB: THREE.Mesh
  mesh: THREE.Mesh
  length: number
  constrainedPoints: THREE.Mesh[] = []

  constructor(
    pointA: THREE.Mesh,
    pointB: THREE.Mesh,
    length = 100,
    selectableObjects?: THREE.Object3D[]
  ) {
    this.pointA = pointA
    this.pointB = pointB
    this.length = length

    const geometry = new THREE.CylinderGeometry(
      LINE_RADIUS,
      LINE_RADIUS,
      1,
      LINE_RADIAL_SEGMENTS
    )
    const material = new THREE.MeshStandardMaterial({ color: getRandomColor() })

    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    this.mesh.userData.selectableType = "solid"
    this.mesh.userData.owner = this

    selectableObjects?.push(this.mesh)

    this.pointA.userData.dependents ??= []
    this.pointB.userData.dependents ??= []

    this.pointA.userData.dependents.push(this)
    this.pointB.userData.dependents.push(this)

    this.update()
  }

  update() {
    const a = this.pointA.position
    const b = this.pointB.position

    const direction = new THREE.Vector3()
      .subVectors(b, a)
      .normalize()

    const center = new THREE.Vector3()
      .addVectors(a, b)
      .multiplyScalar(0.5)

    this.mesh.position.copy(center)

    this.mesh.scale.set(1, this.length, 1)

    const quaternion = new THREE.Quaternion()
    quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction
    )

    this.mesh.quaternion.copy(quaternion)
    updateConstrainedPoints(this)
  }
}
