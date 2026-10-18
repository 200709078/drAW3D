import * as THREE from "three"
import { POINT_SIZE } from "../interaction/Pointer"

export function createPoint(position: THREE.Vector3, size = POINT_SIZE, color = 0x0066ff) {
  const geo = new THREE.SphereGeometry(size, 50, 50)
  const mat = new THREE.MeshStandardMaterial({ color })

  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.copy(position)

  mesh.userData.pointRole = "free"
  mesh.userData.dependents ??= []

  return mesh
}
