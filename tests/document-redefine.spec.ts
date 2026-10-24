import { expect, test } from '@playwright/test'
import { definitionText, editLine } from '../src/commands/describe'
import { resolveAll } from '../src/document/editing'
import { GeometryDocument } from '../src/document/geometry-document'
import { equalModelGraphs } from '../src/document/graph-equality'
import { redefineObject, splitEditText } from '../src/document/redefine'
import { submitCommand } from '../src/document/submit'
import type { GeometryObject, LineObject, ParameterObject, PointObject, PolyhedronObject } from '../src/geometry/types'
import { vec } from '../src/geometry/vec3'

function run(document: GeometryDocument, ...sources: string[]): void {
  for (const source of sources) {
    const result = submitCommand(document, source)
    if (!result.ok) throw new Error(`${source}: ${result.error}`)
  }
}

function named<T extends GeometryObject>(document: GeometryDocument, name: string): T {
  return document.objects.find(item => item.name === name) as T
}

function redefine(document: GeometryDocument, name: string, text: string) {
  return redefineObject(document, resolveAll(document), named(document, name), text)
}

test('düzenleme metni ad ve tanımdır; çözümleyici aynı nesneyi geri verir', () => {
  const document = new GeometryDocument()
  run(document, 'n=5', 'A=(0,0,0)', 'B=(3,0,0)', 'Prizma(A,B,n)', 'k=Küre(A, 2)', 'Uzaklık(A,B)', 's=Işın(A,B)')
  expect(editLine(named(document, 'prizma1'), document.objects)).toBe('prizma1: Prizma(A, B, n, 3)')
  expect(editLine(named(document, 'k'), document.objects)).toBe('k: Küre(A, 2)')
  expect(editLine(named(document, 'A'), document.objects)).toBe('A = (0, 0, 0)')
  expect(editLine(named(document, 'n'), document.objects)).toBe('n = 5')
  expect(editLine(named(document, 'uzaklık1'), document.objects)).toBe('uzaklık1: Uzaklık(A, B)')
  expect(editLine(named(document, 's'), document.objects)).toBe('s: Işın(A, B)')
  // Helpers are not defined by text.
  const edge = document.objects.find(object => object.ownerId !== undefined && object.type === 'segment')!
  expect(definitionText(edge, document.objects)).toBeNull()
  expect(splitEditText('A = (1,2,3)')).toEqual({ name: 'A', definition: '(1,2,3)' })
  expect(splitEditText('Doğru(A,B)')).toEqual({ name: null, definition: 'Doğru(A,B)' })
})

test('aynı aileden türe geçiş yerinde olur, kimlik ve bağlılar korunur', () => {
  const document = new GeometryDocument()
  run(document, 'A=(0,0,0)', 'B=(4,0,0)', 's=DoğruParçası(A,B)', 'Uzunluk(s)')
  const id = named(document, 's').id
  expect(redefine(document, 's', 's: Işın(B, A)')).toEqual({ ok: true })
  const ray = named<LineObject>(document, 's')
  expect(ray.id).toBe(id)
  expect(ray.type).toBe('ray')
  expect(ray.points).toEqual([named(document, 'B').id, named(document, 'A').id])
  // The length measure of a ray is undefined, not deleted.
  resolveAll(document)
  expect(named(document, 'uzunluk1').geometryValid).toBe(false)
  expect(redefine(document, 's', 's: Düzlem(A,B,(0,0,1))')).toEqual({ ok: false, error: 'Tanım aynı türde bir nesne üretmelidir.' })
})

test('prizmanın tanımı değişir: yeni kenar sayısı, yeni nokta, piramide geçiş', () => {
  const document = new GeometryDocument()
  run(document, 'A=(0,0,0)', 'B=(3,0,0)', 'Prizma(A,B)')
  const prism = named<PolyhedronObject>(document, 'prizma1')
  const sidePoint = prism.points[2]
  expect(redefine(document, 'prizma1', 'prizma1: Prizma(A, (0,0,3), 6, 2)')).toEqual({ ok: true })
  expect(prism.sideCount).toBe(6)
  expect(prism.height).toBe(2)
  expect(prism.points[2]).toBe(sidePoint)
  const created = document.get(prism.points[1]) as PointObject
  expect(created.position).toEqual(vec(0, 0, 3))
  // The new point comes before the prism, so resolving in document order works.
  const order = document.objects.map(object => object.id)
  expect(order.indexOf(created.id)).toBeLessThan(order.indexOf(prism.id))
  const edge = document.objects.find((object): object is LineObject => object.type === 'segment' && object.ownerId === prism.id)!
  expect(edge.points).toEqual([prism.points[0], prism.points[1]])
  expect(redefine(document, 'prizma1', 'Piramit(A, B, 4)')).toEqual({ ok: true })
  expect(prism.type).toBe('pyramid')
  resolveAll(document)
  const roles = document.objects.flatMap(object => object.type === 'point' && object.constraint?.type === 'vertex'
    && object.geometryValid !== false ? [object.constraint.role] : [])
  expect(roles.sort()).toEqual(['base', 'base', 'center'])
})

test('nesne kendi köşesine veya ona bağlı bir nesneye başvuramaz', () => {
  const document = new GeometryDocument()
  run(document, 'A=(0,0,0)', 'B=(3,0,0)', 'Prizma(A,B)')
  const vertex = document.objects.find(object => object.type === 'point' && object.constraint?.type === 'vertex')!
  const before = structuredClone(document.objects)
  expect(redefine(document, 'prizma1', `Prizma(A, ${vertex.name})`)).toEqual({ ok: false, error: 'Nesne kendisine veya ona bağlı bir nesneye başvuramaz.' })
  expect(equalModelGraphs(document.objects, before)).toBe(true)
})

test('nokta yeni koordinatlar alır; nesneye bağlı nokta nesnesi üzerine iner', () => {
  const document = new GeometryDocument()
  run(document, 'a=1', 'A=(0,0,0)', 'B=(4,0,0)', 's=DoğruParçası(A,B)')
  expect(redefine(document, 'A', 'A = (a, 2, 0)')).toEqual({ ok: true })
  expect(named<PointObject>(document, 'A').definition).toEqual({ x: 'a' })
  resolveAll(document)
  expect(named<PointObject>(document, 'A').position).toEqual(vec(1, 2, 0))
  // A point on the segment, moved by typed coordinates, stays on it.
  const segment = named(document, 's')
  document.append({ id: document.allocateId(), type: 'point', name: 'P', color: '#0b6b3a', position: vec(2, 1, 0),
    constraint: { type: 'on', ownerId: segment.id, part: 0, params: [0.5] } })
  resolveAll(document)
  expect(redefine(document, 'P', 'P = (6, -1, 0)')).toEqual({ ok: true })
  resolveAll(document)
  expect(named<PointObject>(document, 'P').position).toEqual(vec(4, 0, 0))
})

test('parametre: değer, ifade, döngü engeli, ad değişince ifadeler izler', () => {
  const document = new GeometryDocument()
  run(document, 'a=1', 'b=a+1', 'Prizma((0,0,0),(2,0,0),b+2)')
  expect(redefine(document, 'a', 'a = 7')).toEqual({ ok: true })
  expect(named<ParameterObject>(document, 'a').max).toBe(7)
  expect(redefine(document, 'a', 'a = b*2')).toEqual({ ok: false, error: 'Döngüsel parametre tanımı kullanılamaz.' })
  expect(redefine(document, 'a', 'a = q')).toEqual({ ok: false, error: 'Bilinmeyen ad: q' })
  expect(redefine(document, 'a', 'k = 3')).toEqual({ ok: true })
  expect(named<ParameterObject>(document, 'b').definition).toEqual({ value: 'k+1' })
  expect(named<PolyhedronObject>(document, 'prizma1').definition).toEqual({ sideCount: 'b+2' })
  resolveAll(document)
  expect(named<PolyhedronObject>(document, 'prizma1').sideCount).toBe(6)
  expect(redefine(document, 'k', 'x = 3')).toEqual({ ok: false, error: 'Ad olarak kullanılamaz: x' })
  expect(redefine(document, 'k', 'b = 3')).toEqual({ ok: false, error: 'Bu ad başka bir nesnede kullanılıyor: b' })
})
