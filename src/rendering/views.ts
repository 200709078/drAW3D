import * as THREE from 'three'
import type { SectionShape } from '../geometry/section'
import { circlePoint, type AngleShape, type PlaneShape, type PolyhedronShape, type RoundShape, type SphereShape } from '../geometry/solids'
import type { LineStyle } from '../geometry/types'
import { unfoldSolid, type Net } from '../geometry/unfold'
import { polyhedronEdgeVisibility, roundOutline, type Viewer } from '../geometry/visibility'
import { add, distance, lerp, scale, type Vec3 } from '../geometry/vec3'
import type { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { placeAlong, toThree, writePolygons } from './buffers'
import { EdgeLines, type Segment } from './edge-lines'
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
  frustum: ['#fecaca', '#dc2626'],
  tetrahedron: ['#fde68a', '#b45309'],
  cube: ['#bfdbfe', '#1d4ed8'],
  octahedron: ['#ddd6fe', '#6d28d9'],
  dodecahedron: ['#bbf7d0', '#15803d'],
  icosahedron: ['#fbcfe8', '#be185d'],
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
  /** Thickness factor (1 = default). */
  size?: number
  lineStyle?: LineStyle
  /** Face opacity; the type's default when absent. */
  opacity?: number
  faces?: boolean
  edges?: boolean
  /** Screen's size factor for points and thick lines (smart boards draw them larger). */
  scale?: number
}

export interface ObjectView {
  readonly root: THREE.Object3D
  dispose(): void
}

function edgeColor(style: ViewStyle): string {
  return style.selected ? SELECTED_COLOR : EDGE_COLOR
}

/** Edge material for a line style (thin lines). */
function edgeMaterial(materials: MaterialCache, color: string, style: LineStyle | undefined, opacity = 1): LineMaterial {
  if (style === 'dashed') return materials.dashed(color)
  if (style === 'dotted') return materials.dotted(color)
  return materials.line(color, opacity)
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

const DASH = { length: 0.45, gap: 0.3 }
const DOT_SPACING = 0.32
const MAX_PIECES = 600

/**
 * A thick line: one lit tube, or for dashed and dotted lines short tubes and beads along it,
 * drawn as one instanced mesh.
 */
export class TubeView implements ObjectView {
  readonly root = new THREE.Group()
  private tube: THREE.Mesh
  private pieces: THREE.InstancedMesh
  private beads: THREE.InstancedMesh
  private matrix = new THREE.Matrix4()
  private placer = new THREE.Object3D()

  constructor(private materials: MaterialCache) {
    this.tube = new THREE.Mesh(UNIT.cylinder, materials.solid(EDGE_COLOR))
    this.tube.castShadow = true
    this.pieces = new THREE.InstancedMesh(UNIT.cylinder, materials.solid(EDGE_COLOR), MAX_PIECES)
    this.beads = new THREE.InstancedMesh(UNIT.sphere, materials.solid(EDGE_COLOR), MAX_PIECES)
    this.root.add(this.tube, this.pieces, this.beads)
  }

  update(from: Vec3, to: Vec3, style: ViewStyle, radius = LINE_RADIUS): void {
    const thickness = radius * (style.size ?? 1) * (style.scale ?? 1)
    const material = this.materials.solid(style.selected ? SELECTED_COLOR : style.color)
    const pattern = style.lineStyle ?? 'solid'
    this.tube.visible = pattern === 'solid'
    this.pieces.visible = pattern === 'dashed'
    this.beads.visible = pattern === 'dotted'
    if (pattern === 'solid') {
      placeAlong(this.tube, from, to, thickness)
      this.tube.material = material
      return
    }
    const total = distance(from, to)
    const target = pattern === 'dashed' ? this.pieces : this.beads
    target.material = material
    const step = pattern === 'dashed' ? (DASH.length + DASH.gap) * Math.max(1, style.size ?? 1) : DOT_SPACING * Math.max(1, style.size ?? 1)
    const count = Math.min(MAX_PIECES, Math.floor(total / step) + 1)
    for (let index = 0; index < count; index++) {
      const start = index * step / Math.max(total, 1e-9)
      if (pattern === 'dashed') {
        const end = Math.min(1, start + DASH.length * Math.max(1, style.size ?? 1) / total)
        placeAlong(this.placer, lerp(from, to, start), lerp(from, to, end), thickness)
      } else {
        toThree(lerp(from, to, Math.min(1, start)), this.placer.position)
        this.placer.quaternion.identity()
        this.placer.scale.setScalar(thickness * 1.3)
      }
      this.placer.updateMatrix()
      target.setMatrixAt(index, this.matrix.copy(this.placer.matrix))
    }
    target.count = count
    target.instanceMatrix.needsUpdate = true
    target.computeBoundingSphere()
  }

  dispose(): void {
    this.pieces.dispose()
    this.beads.dispose()
  }
}

export class PlaneView implements ObjectView {
  readonly root = new THREE.Group()
  private face = new THREE.Mesh(new THREE.BufferGeometry())
  private outline = new EdgeLines()
  constructor(private materials: MaterialCache) {
    this.root.add(this.face, this.outline)
  }
  update(shape: PlaneShape, style: ViewStyle): void {
    const half = shape.size / 2
    const corner = (s: number, t: number) => add(shape.center, add(scale(shape.u, s * half), scale(shape.v, t * half)))
    const corners = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)]
    writePolygons(this.face.geometry, [corners])
    this.outline.setPolyline(corners, true)
    this.face.visible = style.faces !== false
    this.outline.visible = style.edges !== false || style.selected
    this.face.material = this.materials.face(style.color, style.opacity ?? PLANE_OPACITY)
    this.outline.material = style.selected
      ? this.materials.line(SELECTED_COLOR)
      : edgeMaterial(this.materials, style.color, style.lineStyle, 0.6)
  }
  dispose(): void {
    this.face.geometry.dispose()
    this.outline.dispose()
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
    const armStyle = { color: EDGE_COLOR, selected: style.selected, size: style.size ?? 1, scale: style.scale ?? 1 }
    this.arms[0].update(shape.vertex, shape.a, armStyle, ARM_RADIUS)
    this.arms[1].update(shape.vertex, shape.c, armStyle, ARM_RADIUS)
    const points: Vec3[] = []
    const steps = 32
    for (let index = 0; index <= steps; index++) {
      points.push(circlePoint(shape.vertex, shape.u, shape.v, shape.arcRadius, shape.radians * index / steps))
    }
    const thickness = ARC_RADIUS * (style.size ?? 1) * (style.scale ?? 1)
    const key = `${thickness};${points.map(point => `${point.x},${point.y},${point.z}`).join(';')}`
    if (key !== this.key) {
      this.key = key
      this.arc.geometry.dispose()
      this.arc.geometry = shape.radians > 1e-6
        ? new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(point => toThree(point))), 48, thickness, 8, false)
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
    this.arms.forEach(arm => arm.dispose())
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
    this.root.material = this.materials.face(style.selected ? SELECTED_COLOR : style.color,
      style.selected ? 0.4 : style.opacity ?? FACE_OPACITY)
  }
  dispose(): void { /* shared geometry */ }
}

/** The opened net of a solid: translucent faces and their outlines. */
class NetView {
  readonly root = new THREE.Group()
  private faces = new THREE.Mesh(new THREE.BufferGeometry())
  private outlines = new EdgeLines()
  constructor(private materials: MaterialCache) {
    this.root.add(this.faces, this.outlines)
    this.root.visible = false
  }
  update(net: Net | null, solid: string): void {
    this.root.visible = net !== null
    if (!net) return
    const [face, line] = NET_COLORS[solid] ?? ['#dddddd', '#555555']
    writePolygons(this.faces.geometry, net.faces)
    this.outlines.setSegments(net.outlines.flatMap(polyline =>
      polyline.slice(0, -1).map((point, index): Segment => [point, polyline[index + 1]!])))
    this.faces.material = this.materials.face(face, 0.5)
    this.outlines.material = this.materials.line(line)
  }
  dispose(): void {
    this.faces.geometry.dispose()
    this.outlines.dispose()
  }
}

/** Faces, edges and net of a solid, with its appearance settings. */
function solidLook(materials: MaterialCache, style: ViewStyle, unfold: number) {
  const open = unfold > 0
  return {
    faces: materials.face(style.color, open ? GHOST_OPACITY : style.opacity ?? FACE_OPACITY),
    edges: style.selected
      ? materials.line(SELECTED_COLOR, open ? 0.35 : 1)
      : edgeMaterial(materials, EDGE_COLOR, style.lineStyle, open ? 0.35 : 1),
    showFaces: style.faces !== false,
    // A selected solid always shows its edges, so the highlight is visible.
    showEdges: style.edges !== false || style.selected,
  }
}

/** Edges behind the solid in the textbook look. */
export const HIDDEN_EDGE_COLOR = '#1f2937'

/** Split outline lines into seen and hidden geometry with the edge and hidden-edge materials. */
class OutlineLines {
  readonly seen = new EdgeLines()
  readonly hidden = new EdgeLines()
  write(seen: readonly Segment[], hidden: readonly Segment[]): void {
    this.seen.setSegments(seen)
    this.hidden.setSegments(hidden)
    this.hidden.visible = hidden.length > 0 && this.seen.visible
  }
  look(materials: MaterialCache, edges: LineMaterial, show: boolean, selected: boolean): void {
    this.seen.material = edges
    this.seen.visible = show
    this.hidden.material = materials.hidden(selected ? SELECTED_COLOR : HIDDEN_EDGE_COLOR)
    this.hidden.visible = show && this.hidden.segmentCount > 0
  }
  dispose(): void {
    this.seen.dispose()
    this.hidden.dispose()
  }
}

/** Views whose edges depend on where the viewer is (hidden edges drawn dashed). */
export interface ViewerDependent {
  setViewer(viewer: Viewer | null): void
}

export class PolyhedronView implements ObjectView, ViewerDependent {
  readonly root = new THREE.Group()
  private faces = new THREE.Mesh(new THREE.BufferGeometry())
  private outline = new OutlineLines()
  private height = new EdgeLines()
  private net: NetView
  private shape: PolyhedronShape | null = null
  private unfold = 0
  private viewer: Viewer | null = null
  private key = ''
  constructor(private materials: MaterialCache) {
    this.net = new NetView(materials)
    this.root.add(this.faces, this.outline.seen, this.outline.hidden, this.height, this.net.root)
  }
  update(shape: PolyhedronShape, style: ViewStyle, unfold: number): void {
    const { vertices } = shape
    this.shape = shape
    this.unfold = unfold
    this.key = ''
    writePolygons(this.faces.geometry, shape.faces.map(face => face.map(index => vertices[index]!)))
    this.height.setPolyline([shape.heightStart, shape.heightEnd])
    this.height.visible = shape.heightStart !== shape.heightEnd
    const look = solidLook(this.materials, style, unfold)
    this.faces.material = look.faces
    this.faces.visible = look.showFaces
    this.writeEdges()
    this.outline.look(this.materials, look.edges, look.showEdges, style.selected)
    this.height.material = this.materials.dashed(HEIGHT_COLOR)
    this.net.update(unfold > 0 ? unfoldSolid(shape, unfold) : null, shape.solid)
  }
  setViewer(viewer: Viewer | null): void {
    this.viewer = viewer
    this.writeEdges()
  }
  private writeEdges(): void {
    const shape = this.shape
    if (!shape) return
    const { vertices } = shape
    // Edge AB (vertices 0 and 1) is the construction's own segment; a prism's edge at A is the height line.
    const n = shape.base.length
    const skip = (from: number, to: number) => (Math.min(from, to) === 0 && Math.max(from, to) === 1)
      || (shape.solid === 'prism' && Math.min(from, to) === 0 && Math.max(from, to) === n)
    const seen = this.viewer && this.unfold === 0 ? polyhedronEdgeVisibility(shape, this.viewer) : null
    const key = seen ? seen.map(value => (value ? 1 : 0)).join('') : 'all'
    if (key === this.key) return
    this.key = key
    const edges = shape.edges.map(([from, to]): [Vec3, Vec3] => [vertices[from]!, vertices[to]!])
    const kept = (index: number) => !skip(...shape.edges[index]!)
    this.outline.write(edges.filter((_, index) => kept(index) && (!seen || seen[index])),
      edges.filter((_, index) => kept(index) && seen !== null && !seen[index]))
  }
  dispose(): void {
    this.faces.geometry.dispose()
    this.outline.dispose()
    this.height.dispose()
    this.net.dispose()
  }
}

export class RoundView implements ObjectView, ViewerDependent {
  readonly root = new THREE.Group()
  private body: THREE.Mesh
  private outline = new OutlineLines()
  private height = new EdgeLines()
  private slant = new EdgeLines()
  private net: NetView
  private shape: RoundShape | null = null
  private unfold = 0
  private viewer: Viewer | null = null
  private ratio = -1
  constructor(private materials: MaterialCache, solid: 'cylinder' | 'cone') {
    this.body = new THREE.Mesh(solid === 'cylinder' ? UNIT.roundCylinder : UNIT.roundCone)
    this.net = new NetView(materials)
    this.root.add(this.body, this.outline.seen, this.outline.hidden, this.height, this.slant, this.net.root)
  }
  update(shape: RoundShape, style: ViewStyle, unfold: number): void {
    const { baseCenter, axis, radius, height, top } = shape
    this.shape = shape
    this.unfold = unfold
    // A cut cone has its own body geometry, rebuilt only when its top ratio changes.
    const ratio = shape.topRadius / radius
    if (shape.solid === 'cone' && ratio !== this.ratio) {
      if (this.ratio > 0) this.body.geometry.dispose()
      this.body.geometry = ratio > 0 ? new THREE.CylinderGeometry(ratio, 1, 1, 64, 1, false) : UNIT.roundCone
      this.ratio = ratio
    }
    toThree(add(baseCenter, scale(axis, height / 2)), this.body.position)
    this.body.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), toThree(axis))
    this.body.scale.set(radius, height, radius)
    this.height.setPolyline([baseCenter, top])
    this.slant.setPolyline([shape.rim, shape.topRim])
    const look = solidLook(this.materials, style, unfold)
    this.body.material = look.faces
    this.body.visible = look.showFaces
    this.writeEdges()
    this.outline.look(this.materials, look.edges, look.showEdges, style.selected)
    this.slant.visible = look.showEdges
    this.height.material = this.materials.dashed(HEIGHT_COLOR)
    this.slant.material = this.materials.dashed(edgeColor(style))
    this.net.update(unfold > 0 ? unfoldSolid(shape, unfold) : null, shape.solid)
  }
  setViewer(viewer: Viewer | null): void {
    this.viewer = viewer
    this.writeEdges()
  }
  private writeEdges(): void {
    const shape = this.shape
    if (!shape) return
    if (this.viewer && this.unfold === 0) {
      const { visible, hidden } = roundOutline(shape, this.viewer)
      this.outline.write(visible, hidden)
      return
    }
    const { u, v, radius, baseCenter, top, topRadius } = shape
    const ring = (center: Vec3, size: number) => {
      const segments: Segment[] = []
      const steps = 96
      for (let index = 0; index < steps; index++) {
        segments.push([circlePoint(center, u, v, size, 2 * Math.PI * index / steps),
          circlePoint(center, u, v, size, 2 * Math.PI * (index + 1) / steps)])
      }
      return segments
    }
    this.outline.write(topRadius > 0 ? [...ring(baseCenter, radius), ...ring(top, topRadius)] : ring(baseCenter, radius), [])
  }
  dispose(): void {
    if (this.ratio > 0) this.body.geometry.dispose()
    this.outline.dispose()
    this.height.dispose()
    this.slant.dispose()
    this.net.dispose()
  }
}

/** A section: the cut polygon, filled, with its outline. */
export class SectionView implements ObjectView {
  readonly root = new THREE.Group()
  private face = new THREE.Mesh(new THREE.BufferGeometry())
  private outline = new EdgeLines()
  constructor(private materials: MaterialCache) {
    this.root.add(this.face, this.outline)
  }
  update(shape: SectionShape, style: ViewStyle): void {
    writePolygons(this.face.geometry, [shape.polygon])
    this.outline.setPolyline(shape.polygon, true)
    this.face.material = this.materials.face(style.selected ? SELECTED_COLOR : style.color, style.opacity ?? 0.6)
    this.face.visible = style.faces !== false
    this.outline.material = style.selected ? this.materials.line(SELECTED_COLOR) : edgeMaterial(this.materials, style.color, style.lineStyle)
  }
  dispose(): void {
    this.face.geometry.dispose()
    this.outline.dispose()
  }
}

/** A distance measure: the shortest connection as a dashed line (other measures are a label only). */
export class MeasureView implements ObjectView {
  readonly root = new EdgeLines()
  constructor(private materials: MaterialCache) {}
  update(from: Vec3 | undefined, to: Vec3 | undefined, style: ViewStyle): void {
    this.root.visible = from !== undefined && to !== undefined && distance(from, to) > 1e-9
    if (!from || !to) return
    this.root.setPolyline([from, to])
    this.root.material = this.materials.dashed(style.selected ? SELECTED_COLOR : style.color)
  }
  dispose(): void {
    this.root.dispose()
  }
}
