import * as THREE from 'three'
import type { LabelLayer } from './labels'

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
  setAxes(visible: boolean): void
  /** Resolution of the sun's shadow map (smaller on phones). */
  setShadowSize(size: number): void
}

export const AXIS_COLORS = { x: '#d32f2f', y: '#2e7d32', z: '#1565c0' } as const
const AXIS_LENGTH = GROUND_SIZE / 2
const TICK_STEP = 5

/** x, y (up) and z axes with arrow heads, names and a number every five units. */
function createAxes(scene: THREE.Scene, labels: LabelLayer): (visible: boolean) => void {
  const group = new THREE.Group()
  group.name = 'axes'
  group.visible = false
  const directions = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) }
  for (const [name, direction] of Object.entries(directions) as [keyof typeof directions, THREE.Vector3][]) {
    const color = AXIS_COLORS[name]
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([direction.clone().multiplyScalar(-AXIS_LENGTH), direction.clone().multiplyScalar(AXIS_LENGTH)]),
      new THREE.LineBasicMaterial({ color }),
    )
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.6, 16), new THREE.MeshBasicMaterial({ color }))
    head.position.copy(direction).multiplyScalar(AXIS_LENGTH)
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction)
    group.add(line, head)
  }
  scene.add(group)
  const place = (visible: boolean) => {
    group.visible = visible
    const keep = new Set<string>()
    if (visible) {
      for (const [name, direction] of Object.entries(directions) as [keyof typeof directions, THREE.Vector3][]) {
        const end = direction.clone().multiplyScalar(AXIS_LENGTH + 0.8)
        keep.add(`axis:${name}`)
        labels.set(`axis:${name}`, name, AXIS_COLORS[name], { x: end.x, y: end.y, z: end.z }, 'scene-label axis-name')
        for (let value = -AXIS_LENGTH + TICK_STEP; value < AXIS_LENGTH; value += TICK_STEP) {
          if (value === 0) continue
          const at = direction.clone().multiplyScalar(value)
          keep.add(`tick:${name}:${value}`)
          labels.set(`tick:${name}:${value}`, String(value), AXIS_COLORS[name], { x: at.x, y: at.y, z: at.z }, 'scene-label axis-tick')
        }
      }
    }
    labels.retain(keep)
  }
  return place
}

export function createEnvironment(scene: THREE.Scene, labels: LabelLayer): Environment {
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
  const setAxes = createAxes(scene, labels)

  return {
    setGroundMode(mode) {
      ground.visible = mode === 'showBoth'
      grid.visible = mode !== 'hideBoth'
    },
    setAxes,
    setShadowSize(size) {
      if (sun.shadow.mapSize.x === size) return
      sun.shadow.mapSize.set(size, size)
      // The map is rebuilt at the new size on the next frame.
      sun.shadow.map?.dispose()
      sun.shadow.map = null
    },
  }
}
