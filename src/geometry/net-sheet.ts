import type { PolyhedronShape, RoundShape, SolidShape } from './solids'
import { maxUnfoldAngle, unfoldSolid } from './unfold'
import { cross, dot, normalize, sub, type Vec3 } from './vec3'

export interface Point2 {
  x: number
  y: number
}

/**
 * A fully opened net drawn flat for cutting out, in the solid's units: fill regions, cut
 * lines (polylines), fold lines and the optional glue tabs (closed polygons, their outer
 * sides are among the cuts and their base among the folds).
 */
export interface NetSheet {
  faces: Point2[][]
  cuts: Point2[][]
  folds: [Point2, Point2][]
  tabs: Point2[][]
}

/** Glue tab depth in units (6 mm at full scale). */
const TAB_DEPTH = 0.6
const CIRCLE_SEGMENTS = 96

const p2 = (x: number, y: number): Point2 => ({ x, y })
const minus = (a: Point2, b: Point2): Point2 => p2(a.x - b.x, a.y - b.y)
const plus = (a: Point2, b: Point2, factor = 1): Point2 => p2(a.x + b.x * factor, a.y + b.y * factor)
const size = (a: Point2): number => Math.hypot(a.x, a.y)

function centroid2(points: readonly Point2[]): Point2 {
  const sum = points.reduce((total, point) => plus(total, point), p2(0, 0))
  return p2(sum.x / points.length, sum.y / points.length)
}

/** Even–odd test; points on the boundary may go either way. */
export function insidePolygon(point: Point2, polygon: readonly Point2[]): boolean {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index]!
    const b = polygon[previous]!
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** A trapezoid on the edge a→b, on the side away from `inside`. */
function tabOn(a: Point2, b: Point2, inside: Point2): Point2[] {
  const along = minus(b, a)
  const length = size(along)
  const direction = p2(along.x / length, along.y / length)
  let normal = p2(-direction.y, direction.x)
  if (normal.x * (inside.x - a.x) + normal.y * (inside.y - a.y) > 0) normal = p2(-normal.x, -normal.y)
  const depth = Math.min(TAB_DEPTH, length * 0.3)
  const inset = Math.min(depth, length * 0.35)
  return [a, plus(plus(a, direction, inset), normal, depth), plus(plus(b, direction, -inset), normal, depth), b]
}

export function flatNet(shape: SolidShape, withTabs: boolean): NetSheet {
  return shape.kind === 'polyhedron' ? flatPolyhedron(shape, withTabs) : flatRound(shape, withTabs)
}

const edgeKey = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`)

/**
 * The polyhedron's net at its largest angle, in the plane of its root face. Every edge the
 * net does not fold along is cut twice (once on each face); with tabs one of the two gets a
 * tab, preferring the one whose tab covers no face.
 */
function flatPolyhedron(shape: PolyhedronShape, withTabs: boolean): NetSheet {
  const net = unfoldSolid(shape, maxUnfoldAngle(shape))
  const root = net.faces[0]!
  const origin = root[0]!
  const u = normalize(sub(root[1]!, origin))!
  const normal = normalize(cross(sub(root[1]!, origin), sub(root[2]!, origin)))!
  const v = cross(normal, u)
  const flat = (point: Vec3) => p2(dot(sub(point, origin), u), dot(sub(point, origin), v))
  const faces = net.faces.map(face => face.map(flat))
  const folds = new Set((net.folds ?? []).map(([a, b]) => edgeKey(a, b)))
  const sheet: NetSheet = { faces, cuts: [], folds: [], tabs: [] }
  const folded = new Set<string>()
  const cutEdges = new Map<string, { a: Point2; b: Point2; face: number }[]>()
  faces.forEach((face, index) => {
    const vertices = net.faceVertices![index]!
    face.forEach((a, corner) => {
      const next = (corner + 1) % face.length
      const key = edgeKey(vertices[corner]!, vertices[next]!)
      const b = face[next]!
      if (folds.has(key)) {
        if (!folded.has(key)) sheet.folds.push([a, b])
        folded.add(key)
      } else {
        cutEdges.set(key, [...cutEdges.get(key) ?? [], { a, b, face: index }])
      }
    })
  })
  const covers = (tab: Point2[]) => {
    const probe = [centroid2(tab), tab[1]!, tab[2]!]
    return [...faces, ...sheet.tabs].some(region => probe.some(point => insidePolygon(point, region)))
  }
  for (const occurrences of cutEdges.values()) {
    let tabbed = -1
    let tab: Point2[] = []
    if (withTabs) {
      const candidates = occurrences.map(({ a, b, face }) => tabOn(a, b, centroid2(faces[face]!)))
      tabbed = Math.max(0, candidates.findIndex(candidate => !covers(candidate)))
      tab = candidates[tabbed]!
      sheet.tabs.push(tab)
    }
    occurrences.forEach(({ a, b }, index) => {
      if (index === tabbed) {
        sheet.folds.push([a, b])
        sheet.cuts.push(tab)
      } else {
        sheet.cuts.push([a, b])
      }
    })
  }
  return sheet
}

function arc(center: Point2, radius: number, from: number, to: number, segments = CIRCLE_SEGMENTS): Point2[] {
  const points: Point2[] = []
  for (let index = 0; index <= segments; index++) {
    const angle = from + (to - from) * index / segments
    points.push(p2(center.x + radius * Math.cos(angle), center.y + radius * Math.sin(angle)))
  }
  return points
}

/**
 * A cap disk touching the side at angle `contact` (seen from its center). With tabs it gets
 * teeth around its rim, except where a tooth would reach into the side, to glue under the
 * side's edge.
 */
function addCap(sheet: NetSheet, center: Point2, radius: number, contact: number, side: readonly Point2[], withTabs: boolean): void {
  const rim = arc(center, radius, contact, contact + 2 * Math.PI)
  sheet.faces.push(rim.slice(0, -1))
  if (!withTabs) {
    sheet.cuts.push(rim)
    return
  }
  const count = Math.max(8, Math.round(2 * Math.PI * radius / 1.2))
  const width = 2 * Math.PI / count
  const depth = Math.min(TAB_DEPTH * 0.8, radius * 0.3)
  const gap = width * 0.08
  const slant = Math.min(width * 0.25, depth / radius)
  const outline: Point2[] = []
  const at = (angle: number, distance: number) => p2(center.x + distance * Math.cos(angle), center.y + distance * Math.sin(angle))
  for (let index = 0; index < count; index++) {
    const from = contact + index * width
    const to = from + width
    // No teeth on the two slots beside the contact point.
    if (index === 0 || index === count - 1) {
      outline.push(...arc(center, radius, from, to, 4))
      continue
    }
    const start = at(from + gap, radius)
    const end = at(to - gap, radius)
    const tooth = [start, at(from + gap + slant, radius + depth), at(to - gap - slant, radius + depth), end]
    if (insidePolygon(tooth[1]!, side) || insidePolygon(tooth[2]!, side)) {
      outline.push(...arc(center, radius, from, to, 4))
      continue
    }
    outline.push(at(from, radius), ...tooth)
    sheet.tabs.push(tooth)
    sheet.folds.push([start, end])
  }
  outline.push(outline[0]!)
  sheet.cuts.push(outline)
}

/** The side's glued straight edge: a tab and a fold, or just a cut. */
function addSeam(sheet: NetSheet, a: Point2, b: Point2, inside: Point2, withTabs: boolean): void {
  if (!withTabs) {
    sheet.cuts.push([a, b])
    return
  }
  const tab = tabOn(a, b, inside)
  sheet.tabs.push(tab)
  sheet.folds.push([a, b])
  sheet.cuts.push(tab)
}

/**
 * Cylinders: the side rectangle with the disks on the middle of its long edges. Cones and
 * cut cones: the sector (band) around the full cone's apex, the base disk outside the
 * outer arc, a cut cone's top disk inside the inner arc. The same layout the scene opens to.
 */
function flatRound(shape: RoundShape, withTabs: boolean): NetSheet {
  const sheet: NetSheet = { faces: [], cuts: [], folds: [], tabs: [] }
  const { radius, height, topRadius } = shape
  if (shape.solid === 'cylinder') {
    const width = 2 * Math.PI * radius
    const corners = [p2(0, 0), p2(width, 0), p2(width, height), p2(0, height)]
    sheet.faces.push(corners)
    sheet.cuts.push([corners[1]!, corners[0]!, corners[3]!, corners[2]!])
    addSeam(sheet, corners[1]!, corners[2]!, p2(width / 2, height / 2), withTabs)
    addCap(sheet, p2(width / 2, -radius), radius, Math.PI / 2, corners, withTabs)
    addCap(sheet, p2(width / 2, height + radius), radius, -Math.PI / 2, corners, withTabs)
    return sheet
  }
  const fullHeight = topRadius > 0 ? height * radius / (radius - topRadius) : height
  const slant = Math.hypot(radius, fullHeight)
  const inner = slant * topRadius / radius
  const sector = 2 * Math.PI * radius / slant
  const apex = p2(0, 0)
  const [from, to] = [-Math.PI / 2 - sector / 2, -Math.PI / 2 + sector / 2]
  const outer = arc(apex, slant, from, to)
  const innerArc = inner > 0 ? arc(apex, inner, from, to) : [apex]
  const side = [...outer, ...[...innerArc].reverse()]
  sheet.faces.push(side)
  sheet.cuts.push(outer, [innerArc[0]!, outer[0]!])
  if (inner > 0) sheet.cuts.push(innerArc)
  const middle = p2(0, -(inner + slant) / 2)
  addSeam(sheet, innerArc[innerArc.length - 1]!, outer[outer.length - 1]!, middle, withTabs)
  addCap(sheet, p2(0, -(slant + radius)), radius, Math.PI / 2, side, withTabs)
  if (inner > 0) addCap(sheet, p2(0, -(inner - topRadius)), topRadius, -Math.PI / 2, side, withTabs)
  return sheet
}
