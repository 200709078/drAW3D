import * as THREE from "three"

export function createLoop(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  controls: any
) {
  function animate() {
    requestAnimationFrame(animate)

    controls.update()
    renderer.render(scene, camera)
  }

  animate()
}