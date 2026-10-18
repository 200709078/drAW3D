import * as THREE from "three"

const raycaster = new THREE.Raycaster()
const mouse = new THREE.Vector2()

const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const intersection = new THREE.Vector3()

export function getMouseIntersection(
  event: MouseEvent,
  camera: THREE.PerspectiveCamera
) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1

  raycaster.setFromCamera(mouse, camera)
  raycaster.ray.intersectPlane(plane, intersection)

  return intersection.clone()
}