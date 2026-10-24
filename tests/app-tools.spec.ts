import { expect, test } from '@playwright/test'
import type { Projector } from '../src/app/camera-state'
import { hitPart, nearestPoint } from '../src/app/hit-test'
import { SelectController } from '../src/app/select-tool'
import { ToolController, previewShape, type ToolAction } from '../src/app/tools'
import { resolveDocument, type ShapeMap } from '../src/document/dependencies'
import { GeometryDocument } from '../src/document/geometry-document'
import type { GeometryObject, PointObject, PolyhedronObject } from '../src/geometry/types'
import { distance, vec } from '../src/geometry/vec3'
import { front, frontSpot, spot, topDown } from './fixtures/top-down'

function setup(projector: Projector = topDown) {
  const document = new GeometryDocument()
  let shapes: ShapeMap = new Map()
  const finished: boolean[] = []
  const refresh = () => { shapes = resolveDocument(document.objects) }
  const tools = new ToolController({
    document, projector, shapes: () => shapes, refresh,
    selectPoint: id => { document.activeId = id },
    finished: keep => {
      finished.push(keep)
      if (!keep) document.activeId = null
      tools.setTool('select')
    },
  })
  const select = new SelectController({ document, projector, shapes: () => shapes, refresh })
  const use = (action: ToolAction) => tools.setTool(action)
  const click = (x: number, z: number) => {
    tools.pointerDown(spot(x, z), 'mouse')
    refresh()
  }
  return { document, tools, select, use, click, finished, refresh, shapes: () => shapes }
}

const types = (objects: readonly GeometryObject[]) => objects.map(object => object.type)
const points = (objects: readonly GeometryObject[]) =>
  objects.filter((object): object is PointObject => object.type === 'point')

test('her yapı aracı iki tıklamada nesnesini kurar ve seçim aracına döner', () => {
  for (const [action, main] of [
    ['line', 'line'], ['segment', 'segment'], ['ray', 'ray'], ['sphere', 'sphere'],
    ['prism', 'prism'], ['pyramid', 'pyramid'], ['cylinder', 'cylinder'], ['cone', 'cone'],
  ] as const) {
    const app = setup()
    app.use(action)
    app.click(0, 0)
    expect(app.document.hasDraft).toBe(true)
    expect(app.document.undoDepth).toBe(0)
    app.click(4, 0)
    expect(types(app.document.objects)).toContain(main)
    expect(app.document.hasDraft).toBe(false)
    expect(app.document.undoDepth).toBe(1)
    expect(app.tools.action).toBe('select')
    expect(app.finished).toEqual([false])
  }
})

test('üç noktalı araçlar: düzlem doğrusal noktayı reddeder, açı köşeyi ortada alır', () => {
  const app = setup()
  app.use('plane')
  app.click(0, 0)
  app.click(2, 0)
  app.click(4, 0)
  expect(app.tools.stagedCount).toBe(2)
  app.click(0, 3)
  expect(types(app.document.objects)).toEqual(['point', 'point', 'point', 'plane'])
  app.use('angle')
  app.click(5, 0)
  app.click(8, 0)
  app.click(8, 4)
  const angle = app.document.objects.find(object => object.type === 'angle')!
  const vertex = app.document.get((angle as { points: number[] }).points[1]!) as PointObject
  expect(distance(vertex.position, vec(8, 0, 0))).toBeLessThan(1e-9)
})

test('aynı noktaya ikinci tıklama yok sayılır; var olan noktalar kullanılır', () => {
  const app = setup()
  app.use('segment')
  app.click(0, 0)
  app.click(0, 0)
  expect(points(app.document.objects)).toHaveLength(1)
  app.click(3, 0)
  app.use('ray')
  app.click(0, 0.2)
  app.click(3, 0)
  expect(points(app.document.objects)).toHaveLength(2)
  expect(types(app.document.objects)).toEqual(['point', 'point', 'segment', 'ray'])
})

test('Escape yarım çizimi ve yeni noktalarını atar', () => {
  const app = setup()
  app.use('prism')
  app.click(0, 0)
  expect(app.document.objects).toHaveLength(1)
  expect(app.tools.cancel()).toBe(true)
  expect(app.document.objects).toHaveLength(0)
  expect(app.tools.cancel()).toBe(false)
})

test('nokta aracı: boşta serbest, nesne üzerinde bağlı nokta; var olan nokta seçilir', () => {
  const app = setup()
  app.use('segment')
  app.click(0, 0)
  app.click(6, 0)
  app.use('point')
  app.click(3, 0.2)
  const onSegment = points(app.document.objects).at(-1)!
  expect(onSegment.constraint?.type).toBe('on')
  expect(distance(onSegment.position, vec(3, 0, 0))).toBeLessThan(1e-9)
  app.click(3, 5)
  expect(points(app.document.objects).at(-1)!.constraint).toBeUndefined()
  expect(app.tools.action).toBe('point')
  app.click(0, 0)
  expect(app.tools.action).toBe('select')
  expect(app.document.activeId).toBe(points(app.document.objects)[0]!.id)
  expect(app.finished).toEqual([false, true])
})

test('yapı araçları nesne üzerine tıklanınca bağlı nokta kullanır', () => {
  const app = setup()
  app.use('prism')
  app.click(0, 0)
  app.click(4, 0)
  app.use('segment')
  // The prism's top face, seen from above.
  app.click(2, -2)
  app.click(10, 0)
  const segment = app.document.objects.find(object => object.type === 'segment' && object.ownerId === undefined)!
  const start = app.document.get((segment as { points: number[] }).points[0]!) as PointObject
  expect(start.constraint?.type).toBe('on')
  expect(start.position.y).toBeCloseTo(4, 9)
})

test('dokunma nişan alır, parmak kalkınca işler; ikinci parmak iptal eder', () => {
  const app = setup()
  app.use('segment')
  app.tools.pointerDown(spot(0, 0), 'touch')
  expect(app.document.objects).toHaveLength(0)
  app.tools.pointerMove(spot(1, 1), 'touch')
  expect(app.tools.preview()!.cursor).toEqual(expect.objectContaining({ x: 1, z: 1 }))
  app.tools.pointerUp(spot(1, 1), 'touch')
  expect(points(app.document.objects)[0]!.position).toEqual(expect.objectContaining({ x: 1, z: 1 }))
  app.tools.pointerDown(spot(5, 5), 'touch')
  app.tools.abortGesture()
  app.tools.pointerUp(spot(5, 5), 'touch')
  expect(app.document.objects).toHaveLength(1)
  expect(app.tools.preview()).toBeNull()
})

test('önizleme son noktayla kurulacak şekli gösterir', () => {
  const app = setup()
  app.use('cylinder')
  app.click(0, 0)
  app.tools.pointerMove(spot(2, 0), 'mouse')
  const preview = app.tools.preview()!
  expect(preview.shape?.kind).toBe('round')
  expect(preview.cursor).toEqual(expect.objectContaining({ x: 2, z: 0 }))
  expect(previewShape('plane', [vec(0, 0, 0), vec(1, 0, 0)], 4)?.kind).toBe('line')
  expect(previewShape('prism', [vec(0, 0, 0), vec(0, 0, 0)], 4)).toBeNull()
})

test('seçim: serbest nokta yatay sürüklenir, tek adım kaydedilir, Escape geri alır', () => {
  const app = setup()
  app.use('segment')
  app.click(0, 0)
  app.click(4, 0)
  const [a] = points(app.document.objects)
  expect(app.select.pointerDown(spot(0, 0), 'mouse')).toBe(true)
  expect(app.document.activeId).toBe(a!.id)
  app.select.pointerMove(spot(1, 1))
  app.select.pointerMove(spot(2, 3))
  expect(distance((app.document.get(a!.id) as PointObject).position, vec(2, 0, 3))).toBeLessThan(1e-9)
  app.select.pointerUp()
  expect(app.document.undoDepth).toBe(2)
  expect(app.select.pointerDown(spot(2, 3), 'mouse')).toBe(true)
  app.select.pointerMove(spot(6, 6))
  expect(app.select.cancelDrag()).toBe(true)
  expect(distance((app.document.objects[0] as PointObject).position, vec(2, 0, 3))).toBeLessThan(1e-9)
  expect(app.document.undoDepth).toBe(2)
})

test('seçim: nesneye ve boşluğa basmak kameraya bırakılır', () => {
  const app = setup()
  app.use('plane')
  app.click(0, 0)
  app.click(4, 0)
  app.click(0, 4)
  const plane = app.document.objects.find(object => object.type === 'plane')!
  expect(app.select.pointerDown(spot(1, 1), 'mouse')).toBe(false)
  expect(app.document.activeId).toBe(plane.id)
  expect(app.select.pointerDown(spot(40, 40), 'mouse')).toBe(false)
  expect(app.document.activeId).toBeNull()
})

test('seçili noktanın yakınından sürüklemek onu taşır; kilitli köşe taşınmaz', () => {
  const app = setup()
  app.use('prism')
  app.click(0, 0)
  app.click(4, 0)
  const vertex = points(app.document.objects).find(point => point.constraint?.type === 'vertex')!
  const before = vertex.position
  expect(app.select.pointerDown(spot(vertex.position.x, vertex.position.z), 'mouse')).toBe(true)
  app.select.pointerMove(spot(9, 9))
  app.select.pointerUp()
  expect((app.document.get(vertex.id) as PointObject).position).toEqual(before)
  const free = points(app.document.objects).find(point => point.constraint === undefined && point.ownerId === undefined)
    ?? points(app.document.objects)[0]!
  app.select.pointerDown(spot(free.position.x, free.position.z), 'mouse')
  app.select.pointerUp()
  // 40 px from the selected point: within its 70 px grab radius.
  expect(app.select.pointerDown(spot(free.position.x - 2, free.position.z + 0.1), 'mouse')).toBe(true)
  app.select.pointerMove(spot(-3, 3))
  app.select.pointerUp()
  expect(distance((app.document.get(free.id) as PointObject).position, vec(-1, 0, 3))).toBeLessThan(0.11)
})

test('nesneye bağlı nokta yalnızca nesnesi üzerinde kayar', () => {
  const app = setup()
  app.use('segment')
  app.click(0, 0)
  app.click(6, 0)
  app.use('point')
  app.click(3, 0)
  app.use('select')
  const onSegment = points(app.document.objects).at(-1)!
  expect(app.select.pointerDown(spot(3, 0), 'mouse')).toBe(true)
  app.select.pointerMove(spot(5, 4))
  app.select.pointerUp()
  expect(distance((app.document.get(onSegment.id) as PointObject).position, vec(5, 0, 0))).toBeLessThan(1e-9)
  app.select.pointerDown(spot(5, 0), 'mouse')
  app.select.pointerMove(spot(50, 0))
  app.select.pointerUp()
  expect(distance((app.document.get(onSegment.id) as PointObject).position, vec(6, 0, 0))).toBeLessThan(1e-9)
  expect(app.select.arrows()!.directions).toHaveLength(1)
})

test('çift tıklama dikey taşımayı açar; yükseklik noktası cismin yüksekliğini değiştirir', () => {
  const app = setup(front)
  const document = app.document
  app.use('prism')
  app.tools.pointerDown(frontSpot(0, 0), 'mouse')
  app.refresh()
  // From the front the ground is edge-on: build the prism from a top-down setup instead.
  expect(document.objects).toHaveLength(0)
  const top = setup()
  top.use('prism')
  top.click(0, 0)
  top.click(4, 0)
  const view = new SelectController({ document: top.document, projector: front, shapes: top.shapes, refresh: top.refresh })
  expect(view.pointerDown(frontSpot(0, 4), 'mouse')).toBe(true)
  view.pointerMove(frontSpot(0, 7))
  view.pointerUp()
  const prism = top.document.objects.find(object => object.type === 'prism') as PolyhedronObject
  expect(prism.height).toBeCloseTo(7, 9)
  expect(view.arrows()!.directions[0]!.y).toBeCloseTo(1, 9)
  view.pointerDown(frontSpot(0, -50), 'mouse')
  // Below the base the height stops at its minimum instead of flipping the prism.
  view.pointerDown(frontSpot(0, 7), 'mouse')
  view.pointerMove(frontSpot(0, -5))
  view.pointerUp()
  expect(prism.height).toBe(0.05)
  const c = points(top.document.objects).find(point => point.ownerId === prism.id && point.constraint === undefined
    && distance(point.position, vec(2, 0, 4)) < 1e-6)!
  expect(view.pointerDown(frontSpot(c.position.x, 0), 'mouse')).toBe(true)
  view.pointerUp()
  view.pointerDown(frontSpot(c.position.x, 0), 'mouse')
  view.pointerUp()
  expect(view.verticalPointId).toBe(c.id)
  expect(view.arrows()!.directions).toEqual([vec(0, 1, 0)])
  view.pointerDown(frontSpot(c.position.x, 0), 'mouse')
  view.pointerMove(frontSpot(c.position.x, 2))
  view.pointerUp()
  expect((top.document.get(c.id) as PointObject).position.y).toBeCloseTo(2, 9)
})

test('isabet: noktalar tolerans içinde; kenarlar yüzlerden önce; yardımcılar sahiplerine aittir', () => {
  const app = setup()
  app.use('prism')
  app.click(0, 0)
  app.click(4, 0)
  const objects = app.document.objects
  expect(nearestPoint(objects, topDown, spot(0.4, 0), 10)?.position).toEqual(expect.objectContaining({ x: expect.closeTo(0, 6) }))
  expect(nearestPoint(objects, topDown, spot(0.6, 0), 10)).toBeNull()
  const edge = hitPart(objects, app.shapes(), topDown, spot(2, 0.3), 10)!
  const prism = objects.find(object => object.type === 'prism')!
  expect(edge.ownerId).toBe(prism.id)
  expect(edge.part).toBeLessThan(12)
  const face = hitPart(objects, app.shapes(), topDown, spot(2, -2), 10)!
  expect(face.part).toBe(13)
  expect(face.position.y).toBeCloseTo(4, 9)
  const hidden = objects.find(object => object.type === 'prism')!
  hidden.hidden = true
  expect(hitPart(objects, app.shapes(), topDown, spot(2, -2), 10)).toBeNull()
})

test('isabet: üst üste binen kenarlardan kameraya yakın olan, yüzün arkasındaki kenar değil', () => {
  const app = setup()
  app.use('prism')
  app.click(0, 0)
  app.click(4, 0)
  const objects = app.document.objects
  // From above, the top edge (y = 4) hides the base edge right below it.
  const edge = hitPart(objects, app.shapes(), topDown, spot(2, -3.8), 10)!
  expect(edge.position.y).toBeCloseTo(4, 9)
  expect(edge.part).toBe(4 + 2)
  // A back edge seen through a face is not picked: the face is.
  const view = front
  const behind = hitPart(objects, app.shapes(), view, frontSpot(2, 0.2), 10)!
  expect(behind.position.z).toBeCloseTo(0, 9)
})
