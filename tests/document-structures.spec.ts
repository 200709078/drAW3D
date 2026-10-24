import { expect, test } from '@playwright/test'
import { editLine } from '../src/commands/describe'
import { parseCommand } from '../src/commands/parser'
import { deleteObject, resolveAll } from '../src/document/editing'
import { GeometryDocument } from '../src/document/geometry-document'
import { redefineObject } from '../src/document/redefine'
import { submitCommand } from '../src/document/submit'
import { isInternalPoint, type GeometryObject, type LineObject, type PointObject } from '../src/geometry/types'
import { distance, vec, type Vec3 } from '../src/geometry/vec3'

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

function at(document: GeometryDocument, name: string): Vec3 {
  return named<PointObject>(document, name).position
}

function setup(): GeometryDocument {
  const document = new GeometryDocument()
  run(document, 'P=(2,6,2)', 'Q=(-2,0,-1)', 'p=Düzlem((0,3,0),(1,3,0),(0,3,1))', 'd=Doğru(P,Q)')
  return document
}

test('ayrıştırıcı yapı komutlarını tanır', () => {
  expect(parseCommand('OrtaNokta(A,B)')).toMatchObject({ ok: true, command: { kind: 'midpoint', B: { kind: 'reference' } } })
  expect(parseCommand('OrtaNokta(s)')).toMatchObject({ ok: true, command: { kind: 'midpoint', A: { name: 's' } } })
  expect(parseCommand('Kesiştir(d,p)')).toMatchObject({ ok: true, command: { kind: 'intersect', first: 'd', second: 'p' } })
  expect(parseCommand('izdusum(A,p)')).toMatchObject({ ok: true, command: { kind: 'project' } })
  expect(parseCommand('DikDüzlem((1,0,0),d)')).toMatchObject({ ok: true, command: { kind: 'perpendicularPlane', point: { kind: 'coordinates' } } })
  expect(parseCommand('ParalelDoğru(A)')).toEqual({ ok: false, error: 'Bu komut 2 parametre gerektirir.' })
})

test('orta nokta, kesişim ve izdüşüm kaynaklarını izler; sürüklenmez, silinebilir', () => {
  const document = setup()
  run(document, 'M=OrtaNokta(P,Q)', 'X=Kesiştir(d,p)', 'F=İzdüşüm(P,p)', 's=DoğruParçası(P,(2,0,2))', 'N=OrtaNokta(s)')
  expect(at(document, 'M')).toEqual(vec(0, 3, 0.5))
  expect(distance(at(document, 'X'), vec(0, 3, 0.5))).toBeLessThan(1e-9)
  expect(at(document, 'F')).toEqual(vec(2, 3, 2))
  expect(at(document, 'N')).toEqual(vec(2, 3, 2))
  expect(named<PointObject>(document, 'M').color).toBe('#374151')
  run(document, 'P=(4,6,2)')
  expect(at(document, 'M')).toEqual(vec(1, 3, 0.5))
  expect(at(document, 'F')).toEqual(vec(4, 3, 2))
  expect(editLine(named(document, 'M'), document.objects)).toBe('M: OrtaNokta(P, Q)')
  expect(editLine(named(document, 'X'), document.objects)).toBe('X: Kesiştir(d, p)')
  expect(deleteObject(document, named(document, 'M').id)).toBe(true)
  // Deleting the plane deletes what is built on it.
  expect(deleteObject(document, named(document, 'p').id)).toBe(true)
  expect(document.objects.map(object => object.name)).not.toContain('X')
  expect(document.objects.map(object => object.name)).not.toContain('F')
})

test('kesişim yoksa nokta tanımsızdır ve geri gelir; doğru-kürede iki nokta', () => {
  const document = setup()
  run(document, 'X=Kesiştir(d,p)', 'Küre((6,3,0),2)', 'k=Doğru((2,3,0),(8,3,0))', 'Kesiştir(k,küre1)')
  const created = document.objects.filter((object): object is PointObject => object.type === 'point'
    && object.constraint?.type === 'construct' && object.constraint.sources.includes(named(document, 'küre1').id))
  expect(created.map(point => point.position)).toEqual([vec(4, 3, 0), vec(8, 3, 0)])
  // Move the line along the plane: it no longer meets it.
  run(document, 'Q=(-2,6,-1)')
  resolveAll(document)
  expect(named(document, 'X').geometryValid).toBe(false)
  run(document, 'Q=(-2,0,-1)')
  expect(named(document, 'X').geometryValid).toBeUndefined()
  expect(submitCommand(document, 'Kesiştir(küre1,küre1)')).toEqual({ ok: false, error: 'Bu nesnelerin kesişimi desteklenmiyor: doğru, düzlem ve küre seçin.' })
})

test('dik ve paralel doğru ve düzlemler; iki düzlemin kesişim doğrusu', () => {
  const document = setup()
  run(document, 'n=DikDoğru(P,p)', 'm=ParalelDoğru((0,6,-4),d)', 'q=ParalelDüzlem(Q,p)', 'r=Düzlem((0,0,0),(1,0,0),(0,1,1))',
    'k=Kesiştir(p,r)', 'u=DikDüzlem((6,0,6),d)', 'w=DikDoğru((1,0,0),d)')
  const shapes = resolveAll(document)
  const direction = (name: string) => {
    const shape = shapes.get(named(document, name).id)
    if (shape?.kind !== 'line') throw new Error(name)
    return shape.direction
  }
  const normal = (name: string) => {
    const shape = shapes.get(named(document, name).id)
    if (shape?.kind !== 'plane') throw new Error(name)
    return shape.normal
  }
  expect(Math.abs(direction('n').y)).toBeCloseTo(1, 12)
  const dDirection = direction('d')
  const mDirection = direction('m')
  expect(Math.abs(mDirection.x * dDirection.x + mDirection.y * dDirection.y + mDirection.z * dDirection.z)).toBeCloseTo(1, 12)
  expect(Math.abs(normal('q').y)).toBeCloseTo(1, 12)
  // p (y = 3) and r (y = z) meet in the line y = z = 3 along x.
  expect(Math.abs(direction('k').x)).toBeCloseTo(1, 12)
  const kLine = shapes.get(named(document, 'k').id)
  expect(kLine?.kind === 'line' && kLine.a.y).toBeCloseTo(3, 9)
  expect(Math.abs(normal('u').x * dDirection.x + normal('u').y * dDirection.y + normal('u').z * dDirection.z)).toBeCloseTo(1, 12)
  const w = direction('w')
  expect(w.x * dDirection.x + w.y * dDirection.y + w.z * dDirection.z).toBeCloseTo(0, 12)
  expect(editLine(named(document, 'n'), document.objects)).toBe('n: DikDoğru(P, p)')
  expect(editLine(named(document, 'u'), document.objects)).toMatch(/^u: DikDüzlem\([A-Z], d\)$/)
  expect(editLine(named(document, 'k'), document.objects)).toBe('k: Kesiştir(p, r)')
  // The hidden points are owned by their line or plane and go with it.
  const internal = document.objects.filter(isInternalPoint)
  expect(internal.length).toBe(1 + 1 + 2 + 2 + 2 + 1)
  expect(deleteObject(document, named(document, 'u').id)).toBe(true)
  expect(document.objects.filter(isInternalPoint).length).toBe(internal.length - 2)
  expect(submitCommand(document, 'ParalelDüzlem(P,d)')).toEqual({ ok: false, error: 'Düzlem seçin: d' })
})

test('yapılar yeniden tanımlanır; eski gizli noktalar temizlenir', () => {
  const document = setup()
  run(document, 'n=DikDoğru(P,p)', 'M=OrtaNokta(P,Q)')
  const line = named<LineObject>(document, 'n')
  const before = document.objects.filter(isInternalPoint).map(point => point.id)
  expect(redefineObject(document, resolveAll(document), line, 'n: ParalelDoğru(Q, d)')).toEqual({ ok: true })
  expect(line.construction).toEqual({ kind: 'parallel', sources: [named(document, 'Q').id, named(document, 'd').id] })
  const after = document.objects.filter(isInternalPoint).map(point => point.id)
  expect(after).toHaveLength(1)
  expect(before.some(id => after.includes(id))).toBe(false)
  expect(redefineObject(document, resolveAll(document), line, 'n: DoğruParçası(P, Q)')).toEqual({ ok: true })
  expect(line.type).toBe('segment')
  expect(line.construction).toBeUndefined()
  expect(document.objects.filter(isInternalPoint)).toHaveLength(0)
  const midpoint = named<PointObject>(document, 'M')
  expect(redefineObject(document, resolveAll(document), midpoint, 'M: İzdüşüm(P, p)')).toEqual({ ok: true })
  resolveAll(document)
  expect(midpoint.position).toEqual(vec(2, 3, 2))
  expect(redefineObject(document, resolveAll(document), midpoint, 'M: (1, 2, 3)')).toEqual({ ok: false, error: 'Tanım aynı türde bir nesne üretmelidir.' })
})
