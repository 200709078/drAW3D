import * as THREE from 'three'
import type { Vec3 } from '../geometry/vec3'

export function toThree(point: Vec3, target = new THREE.Vector3()): THREE.Vector3 {
  return target.set(point.x, point.y, point.z)
}

/** Write positions into the geometry, reusing its buffer when the size is unchanged. */
export function writePositions(geometry: THREE.BufferGeometry, values: Float32Array): void {
  const current = geometry.getAttribute('position') as THREE.BufferAttribute | undefined
  if (current && current.array.length === values.length) {
    (current.array as Float32Array).set(values)
    current.needsUpdate = true
  } else {
    geometry.setAttribute('position', new THREE.BufferAttribute(values, 3))
  }
  geometry.computeBoundingSphere()
}

function pack(points: readonly Vec3[]): Float32Array {
  const values = new Float32Array(points.length * 3)
  points.forEach((point, index) => {
    values[index * 3] = point.x
    values[index * 3 + 1] = point.y
    values[index * 3 + 2] = point.z
  })
  return values
}

/** A connected polyline for THREE.Line. */
export function writePolyline(geometry: THREE.BufferGeometry, points: readonly Vec3[]): void {
  writePositions(geometry, pack(points))
}

/** Separate segments (pairs) for THREE.LineSegments. */
export function writeSegments(geometry: THREE.BufferGeometry, segments: readonly (readonly [Vec3, Vec3])[]): void {
  writePositions(geometry, pack(segments.flat()))
}

/** Planar convex polygons as a flat-shaded triangle list. */
export function writePolygons(geometry: THREE.BufferGeometry, polygons: readonly (readonly Vec3[])[]): void {
  const corners: Vec3[] = []
  for (const polygon of polygons) {
    for (let index = 1; index + 1 < polygon.length; index++) corners.push(polygon[0]!, polygon[index]!, polygon[index + 1]!)
  }
  writePositions(geometry, pack(corners))
  geometry.deleteAttribute('normal')
  geometry.computeVertexNormals()
}

/** Orient an object whose local +Y axis spans `from` → `to` (unit cylinders and cones). */
export function placeAlong(object: THREE.Object3D, from: Vec3, to: Vec3, radius: number): void {
  const start = toThree(from)
  const direction = toThree(to).sub(start)
  const size = direction.length()
  object.visible = size > 1e-9
  if (!object.visible) return
  object.position.copy(start).addScaledVector(direction, 0.5)
  object.quaternion.setFromUnitVectors(UNIT_Y, direction.normalize())
  object.scale.set(radius, size, radius)
}

const UNIT_Y = new THREE.Vector3(0, 1, 0)
