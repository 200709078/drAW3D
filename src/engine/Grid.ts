import * as THREE from "three"

export function createGrid(scene: THREE.Scene) {
  const grid = new THREE.GridHelper(50, 50)
  //grid.visible = false
  scene.add(grid)
  return grid
}