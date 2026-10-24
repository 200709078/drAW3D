import { expect, test } from '@playwright/test'
import {
  acceptsPoint, adoptCreatedPoints, buildConstruction, createContext, createPoint, vertexSlots, type ConstructionKind,
} from '../src/document/constructions'
import { planDeletion, resolveDocument } from '../src/document/dependencies'
import {
  canDelete, deleteObject, hasHidden, hideObject, selectionTarget, setSideCount, showAll,
} from '../src/document/editing'
import { GeometryDocument } from '../src/document/geometry-document'
import { partsOf } from '../src/geometry/parts'
import type { GeometryObject, PointObject, PolyhedronObject, RoundObject } from '../src/geometry/types'
import { distance, vec, type Vec3 } from '../src/geometry/vec3'

function context(document: GeometryDocument) {
  return createContext(document.objects, () => document.allocateId(), () => '#123456')
}

function addPoint(document: GeometryDocument, position: Vec3): PointObject {
  const point = createPoint(context(document), position)
  document.append(point)
  return point
}

/** Build a construction from new free points, as the tools do, and resolve. */
function construct(document: GeometryDocument, kind: ConstructionKind, positions: Vec3[], sides = 4): GeometryObject[] {
  const points = positions.map(position => addPoint(document, position))
  const objects = buildConstruction(context(document), kind, points, { sides })
  adoptCreatedPoints(objects, points)
  document.append(...objects)
  resolveDocument(document.objects)
  document.commit()
  return objects
}

function pointsOf(document: GeometryDocument): PointObject[] {
  return document.objects.filter((object): object is PointObject => object.type === 'point')
}

test('prizma: C noktası, AB kenarı, yükseklik noktası ve kilitli köşeler oluşur', () => {
  const document = new GeometryDocument()
  const objects = construct(document, 'prism', [vec(0, 0, 0), vec(4, 0, 0)])
  const prism = objects.find(object => object.type === 'prism') as PolyhedronObject
  expect(prism.height).toBe(4)
  expect(prism.sideCount).toBe(4)
  const helpers = document.objects.filter(object => object.ownerId === prism.id)
  // A, B (adopted), C, edge AB, height point, 2 base + 3 top vertices.
  expect(helpers).toHaveLength(2 + 1 + 1 + 1 + 5)
  const height = pointsOf(document).find(point => point.constraint?.type === 'height')!
  expect(distance(height.position, vec(0, 4, 0))).toBeLessThan(1e-9)
  const vertices = pointsOf(document).filter(point => point.constraint?.type === 'vertex')
  expect(vertices.map(point => point.color)).toEqual(Array(5).fill('#808080'))
  for (const vertex of vertices) expect([0, 4]).toContain(Math.round(vertex.position.y))
})

test('bağımlı geometri noktayla birlikte güncellenir; tanımsızken gizlenir ve geri gelir', () => {
  const document = new GeometryDocument()
  construct(document, 'prism', [vec(0, 0, 0), vec(4, 0, 0)])
  const [a, b] = pointsOf(document)
  b!.position = vec(6, 0, 0)
  resolveDocument(document.objects)
  const height = pointsOf(document).find(point => point.constraint?.type === 'height')!
  expect(height.position.y).toBeCloseTo(4, 9)
  const prism = document.objects.find(object => object.type === 'prism')!
  // B onto A: no base, so the prism and its derived points are undefined.
  b!.position = a!.position
  resolveDocument(document.objects)
  expect(prism.geometryValid).toBe(false)
  expect(height.geometryValid).toBe(false)
  const corner = pointsOf(document).find(point => point.constraint?.type === 'vertex')!
  const kept = corner.position
  b!.position = vec(2, 0, 0)
  resolveDocument(document.objects)
  expect(prism.geometryValid).toBeUndefined()
  expect(height.geometryValid).toBeUndefined()
  expect(corner.geometryValid).toBeUndefined()
  expect(distance(corner.position, kept)).toBeGreaterThan(1)
})

test('nesneye bağlı nokta nesneyi izler', () => {
  const document = new GeometryDocument()
  const [segment] = construct(document, 'segment', [vec(0, 0, 0), vec(4, 0, 0)])
  const point = createPoint(context(document), vec(1, 0, 0), { type: 'on', ownerId: segment!.id, part: 0, params: [0.25] })
  document.append(point)
  resolveDocument(document.objects)
  expect(point.color).toBe('#0b6b3a')
  pointsOf(document)[1]!.position = vec(8, 0, 0)
  resolveDocument(document.objects)
  expect(distance(point.position, vec(2, 0, 0))).toBeLessThan(1e-9)
})

test('kenar sayısı azalınca kaybolan yüzdeki nokta en yakın parçaya geçer', () => {
  const document = new GeometryDocument()
  const objects = construct(document, 'prism', [vec(0, 0, 0), vec(4, 0, 0)], 8)
  const prism = objects.find(object => object.type === 'prism') as PolyhedronObject
  const shapes = resolveDocument(document.objects)
  const lastFace = partsOf(shapes.get(prism.id)!).length - 1
  const point = createPoint(context(document), vec(0, 0, 0), { type: 'on', ownerId: prism.id, part: lastFace, params: [0, 0] })
  document.append(point)
  resolveDocument(document.objects)
  setSideCount(document, context(document), prism.id, 3)
  const resolved = resolveDocument(document.objects)
  const parts = partsOf(resolved.get(prism.id)!)
  expect(parts).toHaveLength(9 + 5)
  expect((point.constraint as { part: number }).part).toBeLessThan(parts.length)
  expect(point.geometryValid).toBeUndefined()
})

test('kenar sayısı köşe noktalarını ekler, kullanılmayanları siler, kullanılanları saklar', () => {
  const document = new GeometryDocument()
  const objects = construct(document, 'pyramid', [vec(0, 0, 0), vec(4, 0, 0)], 6)
  const pyramid = objects.find(object => object.type === 'pyramid') as PolyhedronObject
  const vertices = () => pointsOf(document).filter(point => point.constraint?.type === 'vertex')
  expect(vertices()).toHaveLength(vertexSlots('pyramid', 6).length)
  const last = vertices().find(point => point.constraint?.type === 'vertex' && point.constraint.index === 5)!
  const user = addPoint(document, vec(9, 0, 9))
  document.append({ id: document.allocateId(), type: 'segment', name: 's', color: '#000000', points: [last.id, user.id] })
  setSideCount(document, context(document), pyramid.id, 4)
  resolveDocument(document.objects)
  // Indexes 2 and 3 and the center remain; index 5 stays for the segment but is undefined.
  expect(vertices().map(point => point.geometryValid === false)).toEqual([false, false, true, false])
  const segment = document.objects.find(object => object.name === 's')!
  expect(segment.geometryValid).toBe(false)
  setSideCount(document, context(document), pyramid.id, 7)
  resolveDocument(document.objects)
  expect(vertices().filter(point => point.geometryValid !== false)).toHaveLength(vertexSlots('pyramid', 7).length)
  expect(segment.geometryValid).toBeUndefined()
  expect(setSideCount(document, context(document), pyramid.id, 7)).toBe(false)
  expect(setSideCount(document, context(document), pyramid.id, 99)).toBe(true)
  expect(pyramid.sideCount).toBe(20)
})

test('silme: yardımcılar ve bağımlılar gider, başka nesnenin kullandığı kendi noktası kalır', () => {
  const document = new GeometryDocument()
  const objects = construct(document, 'prism', [vec(0, 0, 0), vec(4, 0, 0)])
  const prism = objects.find(object => object.type === 'prism')!
  const [a, b] = pointsOf(document)
  const far = addPoint(document, vec(9, 0, 9))
  const line = buildConstruction(context(document), 'line', [a!, far])
  document.append(...line)
  const onFace = createPoint(context(document), vec(0, 0, 0), { type: 'on', ownerId: prism.id, part: 13, params: [0, 0] })
  document.append(onFace)
  resolveDocument(document.objects)
  const plan = planDeletion(document.objects, [prism.id])
  expect(plan.remove).toContain(b!.id)
  expect(plan.remove).toContain(onFace.id)
  expect(plan.remove).not.toContain(a!.id)
  expect(plan.release).toEqual([a!.id])
  expect(deleteObject(document, prism.id)).toBe(true)
  expect(document.get(a!.id)!.ownerId).toBeUndefined()
  expect(document.objects.map(object => object.id).sort((x, y) => x - y))
    .toEqual([a!.id, far.id, line[0]!.id].sort((x, y) => x - y))
})

test('silinebilirlik: cismin parçaları tek başına silinemez', () => {
  const document = new GeometryDocument()
  const objects = construct(document, 'cylinder', [vec(0, 0, 0), vec(2, 0, 0)])
  const cylinder = objects.find(object => object.type === 'cylinder') as RoundObject
  expect(cylinder.height).toBe(4)
  expect(canDelete(cylinder)).toBe(true)
  for (const helper of document.objects.filter(object => object.ownerId === cylinder.id)) {
    expect(canDelete(helper)).toBe(false)
    expect(selectionTarget(document, helper.id)!.id).toBe(helper.type === 'point' ? helper.id : cylinder.id)
  }
  const free = addPoint(document, vec(5, 0, 5))
  expect(canDelete(free)).toBe(true)
  expect(deleteObject(document, document.objects.find(object => object.type === 'segment')!.id)).toBe(false)
})

test('gizle yardımcılarıyla birlikte gizler, tümünü göster geri getirir', () => {
  const document = new GeometryDocument()
  const objects = construct(document, 'sphere', [vec(0, 0, 0), vec(0, 2, 0)])
  const sphere = objects.find(object => object.type === 'sphere')!
  expect(hideObject(document, sphere.id)).toBe(true)
  expect(document.objects.filter(object => object.hidden).map(object => object.type).sort())
    .toEqual(['point', 'point', 'segment', 'sphere'])
  expect(hasHidden(document)).toBe(true)
  expect(showAll(document)).toBe(true)
  expect(hasHidden(document)).toBe(false)
  expect(showAll(document)).toBe(false)
})

test('yapılar farklı noktalar ister, düzlem doğrusal olmayan üç nokta ister', () => {
  expect(acceptsPoint('segment', [vec(0, 0, 0)], vec(0, 0, 0.0001))).toBe(false)
  expect(acceptsPoint('segment', [vec(0, 0, 0)], vec(1, 0, 0))).toBe(true)
  expect(acceptsPoint('plane', [vec(0, 0, 0), vec(1, 0, 0)], vec(3, 0, 0))).toBe(false)
  expect(acceptsPoint('plane', [vec(0, 0, 0), vec(1, 0, 0)], vec(3, 0, 1))).toBe(true)
  expect(acceptsPoint('angle', [vec(0, 0, 0), vec(1, 0, 0)], vec(3, 0, 0))).toBe(true)
})
