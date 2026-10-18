import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import * as THREE from "three"

export function createControls(
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer
) {
  const controls = new OrbitControls(camera, renderer.domElement)

  controls.enableDamping = true
  controls.dampingFactor = 0.05

  controls.target.set(0, 0, 0)
  controls.update()

  return controls
}
