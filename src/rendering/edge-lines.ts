import * as THREE from 'three'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'
import type { Vec3 } from '../geometry/vec3'

export type Segment = readonly [Vec3, Vec3]

/**
 * Edge lines with a width in pixels (WebGL draws native lines one pixel wide). The buffers
 * are reused and grow only when needed: solids rewrite their edges every frame while the
 * camera turns, so nothing is allocated per frame.
 */
export class EdgeLines extends LineSegments2 {
  private capacity = 0
  private positions = new Float32Array(0)
  private distances = new Float32Array(0)
  private positionBuffer!: THREE.InstancedInterleavedBuffer
  private distanceBuffer!: THREE.InstancedInterleavedBuffer
  private used = 0

  constructor() {
    super(new LineSegmentsGeometry())
    // The used part of the buffers changes all the time; bounds would only be stale.
    this.frustumCulled = false
    this.grow(8)
    ;(this.geometry as LineSegmentsGeometry).instanceCount = 0
  }

  /** Number of segments drawn. */
  get segmentCount(): number {
    return this.used
  }

  setSegments(segments: readonly Segment[]): void {
    if (segments.length > this.capacity) this.grow(segments.length)
    let travelled = 0
    segments.forEach(([from, to], index) => {
      this.positions.set([from.x, from.y, from.z, to.x, to.y, to.z], index * 6)
      // Dashes run on along the line, as with THREE.Line's computeLineDistances.
      const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z)
      this.distances[index * 2] = travelled
      this.distances[index * 2 + 1] = travelled += length
    })
    this.used = segments.length
    const geometry = this.geometry as LineSegmentsGeometry
    geometry.instanceCount = segments.length
    this.positionBuffer.needsUpdate = true
    this.distanceBuffer.needsUpdate = true
  }

  /** A connected line through the points; closed back to the first when asked. */
  setPolyline(points: readonly Vec3[], closed = false): void {
    const segments: Segment[] = []
    for (let index = 0; index + 1 < points.length; index++) segments.push([points[index]!, points[index + 1]!])
    if (closed && points.length > 2) segments.push([points[points.length - 1]!, points[0]!])
    this.setSegments(segments)
  }

  private grow(needed: number): void {
    this.capacity = Math.max(needed, this.capacity * 2)
    this.positions = new Float32Array(this.capacity * 6)
    this.distances = new Float32Array(this.capacity * 2)
    const geometry = this.geometry as LineSegmentsGeometry
    // Frees the GPU buffers of the old attributes before new ones replace them.
    geometry.dispose()
    this.positionBuffer = new THREE.InstancedInterleavedBuffer(this.positions, 6, 1)
    geometry.setAttribute('instanceStart', new THREE.InterleavedBufferAttribute(this.positionBuffer, 3, 0))
    geometry.setAttribute('instanceEnd', new THREE.InterleavedBufferAttribute(this.positionBuffer, 3, 3))
    this.distanceBuffer = new THREE.InstancedInterleavedBuffer(this.distances, 2, 1)
    geometry.setAttribute('instanceDistanceStart', new THREE.InterleavedBufferAttribute(this.distanceBuffer, 1, 0))
    geometry.setAttribute('instanceDistanceEnd', new THREE.InterleavedBufferAttribute(this.distanceBuffer, 1, 1))
  }

  dispose(): void {
    this.geometry.dispose()
  }
}

export interface EdgeLook {
  dashed?: { dash: number; gap: number }
  opacity?: number
}

/** A line material; its width is set for all of them by the material cache. */
export function edgeMaterial(color: string, look: EdgeLook, width: number): LineMaterial {
  const material = new LineMaterial({
    color: new THREE.Color(color).getHex(), linewidth: width, transparent: (look.opacity ?? 1) < 1, opacity: look.opacity ?? 1,
  })
  if (look.dashed) {
    material.dashed = true
    material.dashSize = look.dashed.dash
    material.gapSize = look.dashed.gap
  }
  return material
}
