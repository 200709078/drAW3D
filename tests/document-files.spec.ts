import { expect, test } from '@playwright/test'
import { measureOf } from '../src/document/dependencies'
import { deleteObject, resolveAll } from '../src/document/editing'
import { FILE_EXTENSION, parseDocument, serializeDocument } from '../src/document/file-format'
import { GeometryDocument } from '../src/document/geometry-document'
import { equalModelGraphs } from '../src/document/graph-equality'
import { submitCommand } from '../src/document/submit'
import type { GeometryObject, MeasureObject, PolyhedronObject, RegularObject, RoundObject } from '../src/geometry/types'
import { vec } from '../src/geometry/vec3'

function run(document: GeometryDocument, ...sources: string[]): void {
  for (const source of sources) {
    const result = submitCommand(document, source)
    if (!result.ok) throw new Error(`${source}: ${result.error}`)
  }
}

function named<T extends GeometryObject>(document: GeometryDocument, name: string): T {
  const object = document.objects.find(item => item.name === name)
  if (!object) throw new Error(`Nesne yok: ${name}`)
  return object as T
}

function value(document: GeometryDocument, name: string): number {
  const outcome = measureOf(named<MeasureObject>(document, name), document.objects, resolveAll(document))
  if (!outcome.ok) throw new Error(outcome.error)
  return outcome.result.value
}

test.describe('yeni cisim komutları', () => {
  test('Küp bir kenardan kurulur; köşeleri kilitli noktalardır, cisimle silinir', () => {
    const document = new GeometryDocument()
    run(document, 'Küp((0,0,0),(2,0,0))', 'Hacim(küp1)', 'YüzeyAlanı(küp1)')
    const cube = named<RegularObject>(document, 'küp1')
    expect(cube).toMatchObject({ type: 'regular', solid: 'cube' })
    const corners = document.objects.filter(object => object.type === 'point' && object.constraint?.type === 'vertex')
    expect(corners).toHaveLength(6)
    expect(value(document, 'hacim1')).toBeCloseTo(8, 9)
    expect(value(document, 'yüzeyAlanı1')).toBeCloseTo(24, 9)
    expect(deleteObject(document, cube.id)).toBe(true)
    expect(document.objects.filter(object => object.type !== 'point')).toHaveLength(0)
  })

  test('diğer düzgün çokyüzlüler ve hacimleri', () => {
    const document = new GeometryDocument()
    run(document, 'Dörtyüzlü((0,0,0),(1,0,0))', 'Sekizyüzlü((3,0,0),(4,0,0))', 'Onikiyüzlü((6,0,0),(7,0,0))',
      'Yirmiyüzlü((9,0,0),(10,0,0))', 'Hacim(dörtyüzlü1)', 'Hacim(sekizyüzlü1)', 'Hacim(onikiyüzlü1)', 'Hacim(yirmiyüzlü1)')
    expect(value(document, 'hacim1')).toBeCloseTo(1 / (6 * Math.SQRT2), 9)
    expect(value(document, 'hacim2')).toBeCloseTo(Math.SQRT2 / 3, 9)
    expect(value(document, 'hacim3')).toBeCloseTo((15 + 7 * Math.sqrt(5)) / 4, 9)
    expect(value(document, 'hacim4')).toBeCloseTo(5 * (3 + Math.sqrt(5)) / 12, 9)
  })

  test('KesikPiramit ve KesikKoni oranla kurulur; oran parametreye bağlanabilir', () => {
    const document = new GeometryDocument()
    run(document, 'KesikPiramit((0,0,0),(2,0,0),4,3,0.5)', 'Hacim(kesikPiramit1)')
    expect(named<PolyhedronObject>(document, 'kesikPiramit1')).toMatchObject({ type: 'pyramid', topRatio: 0.5, sideCount: 4 })
    expect(value(document, 'hacim1')).toBeCloseTo(7, 9)
    run(document, 'k=0.5', 'KesikKoni((5,0,0),(7,0,0),3,k)', 'Hacim(kesikKoni1)')
    const cone = named<RoundObject>(document, 'kesikKoni1')
    expect(cone).toMatchObject({ type: 'cone', topRatio: 0.5 })
    expect(value(document, 'hacim2')).toBeCloseTo(7 * Math.PI, 9)
    run(document, 'k=0.25')
    resolveAll(document)
    expect(cone.topRatio).toBe(0.25)
  })

  test('Açınım küpün 11 biçiminden birini seçer; başka cisimde biçim verilemez', () => {
    const document = new GeometryDocument()
    run(document, 'Küp((0,0,0),(2,0,0))', 'Açınım(küp1, 90, 3)')
    expect(named<RegularObject>(document, 'küp1')).toMatchObject({ net: 2, unfold: 90 })
    run(document, 'Prizma((5,0,0),(7,0,0))')
    const result = submitCommand(document, 'Açınım(prizma1, 90, 3)')
    expect(result.ok).toBe(false)
    expect(submitCommand(document, 'Açınım(küp1, 90, 12)').ok).toBe(false)
  })

  test('Kesit cismi düzlemle keser, alanı ölçülür; kesmeyen düzlem bildirilir', () => {
    const document = new GeometryDocument()
    run(document, 'Küp((0,0,0),(2,0,0))', 'p=Düzlem((0,1,0),(1,1,0),(0,1,1))', 'Kesit(küp1, p)', 'Alan(kesit1)')
    expect(named(document, 'kesit1').type).toBe('section')
    expect(value(document, 'alan1')).toBeCloseTo(4, 9)
    run(document, 'q=Düzlem((0,9,0),(1,9,0),(0,9,1))')
    const missing = submitCommand(document, 'Kesit(küp1, q)')
    expect(missing).toEqual({ ok: false, error: expect.stringContaining('kesmiyor') })
  })
})

test.describe('.drw3 dosyaları', () => {
  test('kaydedilen belge aynen açılır, kamera da', () => {
    const document = new GeometryDocument()
    run(document, 'k=0.4', 'KesikKoni((0,0,0),(2,0,0),3,k)', 'Küp((5,0,0),(7,0,0))', 'Açınım(küp1, 45, 4)',
      'p=Düzlem((0,1,0),(1,1,0),(0,1,1))', 'Kesit(küp1, p)', 'Hacim(kesikKoni1)')
    resolveAll(document)
    const camera = { position: vec(1, 2, 3), target: vec(0, 0, 0), zoom: 1 }
    const text = serializeDocument({ objects: document.objects as GeometryObject[], camera })
    expect(JSON.parse(text)).toMatchObject({ app: 'drAW3D', format: 1 })
    const parsed = parseDocument(text)
    if (!parsed.ok) throw new Error(parsed.error)
    expect(parsed.camera).toEqual(camera)
    const opened = new GeometryDocument()
    opened.append(...parsed.objects)
    resolveAll(opened)
    expect(equalModelGraphs(opened.objects, document.objects)).toBe(true)
    // New objects get fresh IDs after the file's.
    expect(opened.nextId).toBe(document.nextId)
    expect(FILE_EXTENSION).toBe('.drw3')
  })

  test('bozuk, başka uygulamanın ya da yeni sürümün dosyası reddedilir', () => {
    const error = (text: string) => {
      const result = parseDocument(text)
      return result.ok ? null : result.error
    }
    expect(error('{')).toContain('geçerli')
    expect(error(JSON.stringify({ app: 'drAW2D', format: 1, objects: [] }))).toContain('drAW3D belgesi değil')
    expect(error(JSON.stringify({ app: 'drAW3D', format: 2, objects: [] }))).toContain('daha yeni')
    const point = { id: 0, type: 'point', name: 'A', color: '#000000', position: { x: 0, y: 0, z: 0 } }
    expect(error(JSON.stringify({ app: 'drAW3D', format: 1, objects: [point, { ...point }] }))).toContain('bozuk')
    expect(error(JSON.stringify({ app: 'drAW3D', format: 1, objects: [{ ...point, type: 'kutu' }] }))).toContain('tanınmayan')
    const segment = { id: 1, type: 'segment', name: 'a', color: '#000000', points: [0, 7] }
    expect(error(JSON.stringify({ app: 'drAW3D', format: 1, objects: [point, segment] }))).toContain('dayandığı')
    expect(error(JSON.stringify({ app: 'drAW3D', format: 1, objects: [{ ...point, position: { x: 'a', y: 0, z: 0 } }] })))
      .toContain('koordinat')
  })

  test('otomatik kaydın geri yüklenmesi geçmişi buradan başlatır', () => {
    const document = new GeometryDocument()
    run(document, 'Küp((0,0,0),(2,0,0))')
    const restored = new GeometryDocument()
    restored.reset(structuredClone(document.objects as GeometryObject[]))
    expect(restored.objects).toHaveLength(document.objects.length)
    expect(restored.canUndo).toBe(false)
    run(restored, 'A=(5,5,5)')
    restored.undo()
    expect(restored.objects).toHaveLength(document.objects.length)
  })
})
