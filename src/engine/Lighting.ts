import * as THREE from "three"

export function createLighting(scene: THREE.Scene) {
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.7)
  dirLight.position.set(5, 10, 5)
  dirLight.castShadow = true

  const ambient = new THREE.AmbientLight(0xffffff, 0.5)

  scene.add(dirLight)
  scene.add(ambient)
}