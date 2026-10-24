import * as THREE from 'three'
import { circlePoint, type AngleShape, type PlaneShape, type PolyhedronShape, type RoundShape, type SphereShape } from '../geometry/solids'
import { unfoldSolid, type Net } from '../geometry/unfold'
import { add, scale, type Vec3 } from '../geometry/vec3'
import { placeAlong, toThree, writePolygons, writePolyline, writeSegments } from './buffers'
import type { MaterialCache } from './materials'

export const EDGE_COLOR = '#000000'
export const HEIGHT_COLOR = '#800080'
export const SELECTED_COLOR = '#ffaa00'
export const FACE_OPACITY = 0.55
export const PLANE_OPACITY = 0.28
/** Faces of a solid while its net is open. */
export const GHOST_OPACITY = 0.14
export const LINE_RADIUS = 0.08
export const ARM_RADIUS = 0.04
export const ARC_RADIUS = 0.06

const NET_COLORS: Readonly<Record<string, readonly [string, string]>> = {
  prism: ['#9ed8ff', '#2563eb'],
  pyramid: ['#ffd28a', '#d97706'],
  cylinder: ['#c4b5fd', '#7c3aed'],
  cone: ['#b5f5d5', '#059669'],
}

/** Unit geometries shared by every view; placed with position, rotation and scale. */
export const UNIT = {
  sphere: new THREE.SphereGeometry(1, 20, 14),
  smoothSphere: new THREE.SphereGeometry(1, 48, 32),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 16, 1, true),
  roundCylinder: new THREE.CylinderGeometry(1, 1, 1, 64, 1, false),
  roundCone: new THREE.ConeGeometry(1, 1, 64, 1, false),
}

export interface ViewStyle {
  color: string
  selected: boolean
}

export interface ObjectView {
  readonly root: THREE.Object3D
  dispose(): void
}

function edgeColor(style: ViewStyle): string {
  return style.selected ? SELECTED_COLOR : EDGE_COLOR
}

export class PointView implements ObjectView {
  readonly root: THREE.Mesh
  constructor(private materials: MaterialCache) {
    this.root = new THREE.Mesh(UNIT.sphere, materials.solid('#0066ff'))
    this.root.castShadow = true
  }
  update(position: Vec3, color: string, radius: number): void {
    toThree(position, this.root.position)
    this.root.scale.setScalar(radius)
    this.root.material = this.materials.solid(color)
  }
  dispose(): void { /* shared geometry */ }
}

/** A thick line as a lit tube between two points. */
export class TubeView implements ObjectView {
  readonly root: THREE.Mesh
  constructor(private materials: MaterialCache) {
    this.root = new THREE.Mesh(UNIT.cylinder, materials.solid(EDGE_COLOR))
    this.root.castShadow = true
  }
  update(from: Vec3, to: Vec3, style: ViewStyle, radius = LINE_RADIUS): void {
    placeAlong(this.root, from, to, radius)
    this.root.material = this.materials.solid(style.selected ? SELECTED_COLOR : style.color)
  }
  dispose(): void { /* shared geometry */ }
}

export class PlaneView implements ObjectView {
  readonly root = new THREE.Group()
  private face = new THREE.Mesh(new THREE.BufferGeometry())
  private outline = new THREE.LineLoop(new THREE.BufferGeometry())
  constructor(private materials: MaterialCache) {
    this.root.add(this.face, this.outline)
  }
  update(shape: PlaneShape, style: ViewStyle): void {
    const half = shape.size / 2
    const corner = (s: number, t: number) => add(shape.center, add(scale(shape.u, s * half), scale(shape.v, t * half)))
    const corners = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)]
    writePolygons(this.face.geometry, [corners])
    writePolyline(this.outline.geometry, corners)
    this.face.material = this.materials.face(style.color, PLANE_OPACITY)
    this.outline.material = this.materials.line(style.selected ? SELECTED_COLOR : style.color, style.selected ? 1 : 0.6)
  }
  dispose(): void {
    this.face.geometry.dispose()
    this.outline.geometry.dispose()
  }
}

export class AngleView implements ObjectView {
  readonly root = new THREE.Group()
  private arms: [TubeView, TubeView]
  private arc = new THREE.Mesh(new THREE.BufferGeometry())
  private sector = new THREE.Mesh(new THREE.BufferGeometry())
  private key = ''
  constructor(private materials: MaterialCache) {
    this.arms = [new TubeView(materials), new TubeView(materials)]
    this.root.add(this.arms[0].root, this.arms[1].root, this.arc, this.sector)
  }
  update(shape: AngleShape, style: ViewStyle): void {
    const armStyle = { color: EDGE_COLOR, selected: style.selected }
    this.arms[0].update(shape.vertex, shape.a, armStyle, ARM_RADIUS)
    this.arms[1].update(shape.vertex, shape.c, armStyle, ARM_RADIUS)
    const points: Vec3[] = []
    const steps = 32
    for (let index = 0; index <= steps; index++) {
      points.push(circlePoint(shape.vertex, shape.u, shape.v, shape.arcRadius, shape.radians * index / steps))
    }
    const key = points.map(point => `${point.x},${point.y},${point.z}`).join(';')
    if (key !== this.key) {
      this.key = key
      this.arc.geometry.dispose()
      this.arc.geometry = shape.radians > 1e-6
        ? new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(point => toThree(point))), 48, ARC_RADIUS, 8, false)
        : new THREE.BufferGeometry()
      writePolygons(this.sector.geometry, points.slice(0, -1).map((point, index) => [shape.vertex, point, points[index + 1]!]))
    }
    const color = style.selected ? SELECTED_COLOR : style.color
    this.arc.material = this.materials.solid(color)
    this.sector.material = this.materials.face(color, 0.3)
  }
  dispose(): void {
    this.arc.geometry.dispose()
    this.sector.geometry.dispose()
  }
}

export class SphereView implements ObjectView {
  readonly root: THREE.Mesh
  constructor(private materials: MaterialCache) {
    this.root = new THREE.Mesh(UNIT.smoothSphere, materials.face('#888888', FACE_OPACITY))
  }
  update(shape: SphereShape, style: ViewStyle): void {
    toThree(shape.center, this.root.position)
    this.root.scale.setScalar(shape.radius)
    this.root.material = this.materials.face(style.selected ? SELECTED_COLOR : style.color, style.selected ? 0.4 : FACE_OPACITY)
  }
  dispose(): void { /* shared geometry */ }
}

/** The opened net of a solid: translucent faces and their outlines. */
class NetView {
  readonly root = new THREE.Group()
  private faces = new THREE.Mesh(new THREE.BufferGeometry())
  private outlines = new THREE.LineSegments(new THREE.BufferGeometry())
  constructor(private materials: MaterialCache) {
    this.root.add(this.faces, this.outlines)
    this.root.visible = false
  }
  update(net: Net | null, solid: string): void {
    this.root.visible = net !== null
    if (!net) return
    const [face, line] = NET_COLORS[solid] ?? ['#dddddd', '#555555']
    writePolygons(this.faces.geometry, net.faces)
    writeSegments(this.outlines.geometry, net.outlines.flatMap(polyline =>
      polyline.slice(0, -1).map((point, index): [Vec3, Vec3] => [point, polyline[index + 1]!])))
    this.faces.material = this.materials.face(face, 0.5)
    this.outlines.material = this.materials.line(line)
  }
  dispose(): void {
    this.faces.geometry.dispose()
    this.outlines.geometry.dispose()
  }
}

export class PolyhedronView implements ObjectView {
  readonly root = new THREE.Group()
  private faces = new THREE.Mesh(new THREE.BufferGeometry())
  private edges = new THREE.LineSegments(new THREE.BufferGeometry())
  private height = new THREE.Line(new THREE.BufferGeometry())
  private net: NetView
  constructor(private materials: MaterialCache) {
    this.net = new NetView(materials)
    this.root.add(this.faces, this.edges, this.height, this.net.root)
  }
  update(shape: PolyhedronShape, style: ViewStyle, unfold: number): void {
    const { vertices } = shape
    writePolygons(this.faces.geometry, shape.faces.map(face => face.map(index => vertices[index]!)))
    // Base edge AB is the construction's own segment; a prism's edge at A is the height line.
    const n = shape.base.length
    const skipped = new Set([0, shape.solid === 'prism' ? 2 * n : -1])
    writeSegments(this.edges.geometry, shape.edges.filter((_, index) => !skipped.has(index))
      .map(([from, to]): [Vec3, Vec3] => [vertices[from]!, vertices[to]!]))
    writePolyline(this.height.geometry, [shape.heightStart, shape.heightEnd])
    this.height.computeLineDistances()
    const open = unfold > 0
    this.faces.material = this.materials.face(style.color, open ? GHOST_OPACITY : FACE_OPACITY)
    this.edges.material = this.materials.line(edgeColor(style), open ? 0.35 : 1)
    this.height.material = this.materials.dashed(HEIGHT_COLOR)
    this.net.update(open ? unfoldSolid(shape, unfold) : null, shape.solid)
  }
  dispose(): void {
    this.faces.geometry.dispose()
    this.edges.geometry.dispose()
    this.height.geometry.dispose()
    this.net.dispose()
  }
}

export class RoundView implements ObjectView {
  readonly root = new THREE.Group()
  private body: THREE.Mesh
  private circles = new THREE.LineSegments(new THREE.BufferGeometry())
  private height = new THREE.Line(new THREE.BufferGeometry())
  private slant = new THREE.Line(new THREE.BufferGeometry())
  private net: NetView
  constructor(private materials: MaterialCache, solid: 'cylinder' | 'cone') {
    this.body = new THREE.Mesh(solid === 'cylinder' ? UNIT.roundCylinder : UNIT.roundCone)
    this.net = new NetView(materials)
    this.root.add(this.body, this.circles, this.height, this.slant, this.net.root)
  }
  update(shape: RoundShape, style: ViewStyle, unfold: number): void {
    const { baseCenter, axis, u, v, radius, height, top } = shape
    toThree(add(baseCenter, scale(axis, height / 2)), this.body.position)
    this.body.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), toThree(axis))
    this.body.scale.set(radius, height, radius)
    const ring = (center: Vec3) => {
      const segments: [Vec3, Vec3][] = []
      const steps = 96
      for (let index = 0; index < steps; index++) {
        segments.push([circlePoint(center, u, v, radius, 2 * Math.PI * index / steps),
          circlePoint(center, u, v, radius, 2 * Math.PI * (index + 1) / steps)])
      }
      return segments
    }
    writeSegments(this.circles.geometry, shape.solid === 'cylinder' ? [...ring(baseCenter), ...ring(top)] : ring(baseCenter))
    writePolyline(this.height.geometry, [baseCenter, top])
    this.height.computeLineDistances()
    writePolyline(this.slant.geometry, [shape.rim, shape.topRim])
    this.slant.computeLineDistances()
    const open = unfold > 0
    this.body.material = this.materials.face(style.color, open ? GHOST_OPACITY : FACE_OPACITY)
    this.circles.material = this.materials.line(edgeColor(style), open ? 0.35 : 1)
    this.height.material = this.materials.dashed(HEIGHT_COLOR)
    this.slant.material = this.materials.dashed(edgeColor(style))
    this.net.update(open ? unfoldSolid(shape, unfold) : null, shape.solid)
  }
  dispose(): void {
    this.circles.geometry.dispose()
    this.height.geometry.dispose()
    this.slant.geometry.dispose()
    this.net.dispose()
  }
}
