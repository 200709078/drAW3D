import * as THREE from 'three'

export const BACKGROUND = '#f0f0f0'
export const GROUND_SIZE = 50

/** Ground and grid visibility; the toggle cycles through them in this order. */
export type GroundMode = 'showBoth' | 'hidePlane' | 'hideBoth'

export const NEXT_GROUND_MODE: Readonly<Record<GroundMode, GroundMode>> = {
  showBoth: 'hidePlane',
  hidePlane: 'hideBoth',
  hideBoth: 'showBoth',
}

export interface Environment {
  setGroundMode(mode: GroundMode): void
}

export function createEnvironment(scene: THREE.Scene): Environment {
  scene.background = new THREE.Color(BACKGROUND)
  const sun = new THREE.DirectionalLight(0xffffff, 1.6)
  sun.position.set(10, 20, 10)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 80 })
  sun.shadow.bias = -0.0005
  scene.add(sun, new THREE.AmbientLight(0xffffff, 1.4))

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
    new THREE.MeshStandardMaterial({ color: 0xdddddd, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  ground.name = 'ground'
  const grid = new THREE.GridHelper(GROUND_SIZE, GROUND_SIZE, 0x888888, 0xbbbbbb)
  grid.name = 'grid'
  scene.add(ground, grid)

  return {
    setGroundMode(mode) {
      ground.visible = mode === 'showBoth'
      grid.visible = mode !== 'hideBoth'
    },
  }
}
