import * as THREE from "three"
import {
  removeObjectPointConstraint,
  setObjectPointConstraint,
  updateConstrainedPoints,
} from "../interaction/LineSegmentConstraint"
import { getRandomColor } from "../utils/color"

const LINE_RADIUS = 0.1
const LINE_RADIAL_SEGMENTS = 32

export class LineSegment {
  startPoint: THREE.Mesh
  endPoint: THREE.Mesh
  mesh: THREE.Mesh
  constrainedPoints: THREE.Mesh[] = []

  constructor(
    startPoint: THREE.Mesh,
    endPoint: THREE.Mesh,
    selectableObjects?: THREE.Object3D[]
  ) {
    this.startPoint = startPoint
    this.endPoint = endPoint

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

    // dependents bağla
    this.startPoint.userData.dependents ??= []
    this.endPoint.userData.dependents ??= []

    this.startPoint.userData.dependents.push(this)
    this.endPoint.userData.dependents.push(this)

    this.update()
  }

  addConstrainedPoint(point: THREE.Mesh, t: number) {
    setObjectPointConstraint(point, {
      type: "lineSegment",
      owner: this,
      t,
    })
  }

  removeConstrainedPoint(point: THREE.Mesh) {
    removeObjectPointConstraint(point)
  }

  update() {
    const start = this.startPoint.position
    const end = this.endPoint.position

    const direction = new THREE.Vector3().subVectors(end, start)
    const length = direction.length()

    if (length < 0.0001) return

    const midpoint = new THREE.Vector3()
      .addVectors(start, end)
      .multiplyScalar(0.5)

    // pozisyon
    this.mesh.position.copy(midpoint)

    // ROTASYON
    const quaternion = new THREE.Quaternion()
    quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.clone().normalize()
    )

    this.mesh.quaternion.copy(quaternion)

    // SCALE (önce sıfırla sonra ver → önemli)
    this.mesh.scale.set(1, 1, 1)
    this.mesh.scale.set(1, length, 1)

    updateConstrainedPoints(this)
  }
}
