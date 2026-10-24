import { expect, test } from '@playwright/test'
import { prepareCommand } from '../src/commands/prepare'
import { parseCommand } from '../src/commands/parser'
import { collectDependents } from '../src/document/dependencies'
import { deleteObject, resolveAll } from '../src/document/editing'
import { GeometryDocument } from '../src/document/geometry-document'
import { submitCommand } from '../src/document/submit'
import { equalModelGraphs } from '../src/document/graph-equality'
import type {
  GeometryObject, ParameterObject, PointObject, PolyhedronObject, SphereObject,
} from '../src/geometry/types'
import { distance, vec } from '../src/geometry/vec3'

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

test('koordinatlı noktalar ve adlar; her komut tek geçmiş adımıdır', () => {
  const document = new GeometryDocument()
  run(document, '(1, 2, 3)', 'K=(0, 0, 4)', 'DoğruParçası(A, K)')
  expect(named<PointObject>(document, 'A').position).toEqual(vec(1, 2, 3))
  expect(document.objects.map(object => object.type)).toEqual(['point', 'point', 'segment'])
  expect(document.undoDepth).toBe(3)
  // Coordinates in a command create their own points.
  run(document, 'Doğru((0,0,0),(1,0,0))')
  expect(document.objects.filter(object => object.type === 'point')).toHaveLength(4)
})

test('hatalı komut belgeyi, kimlikleri ve geçmişi değiştirmez', () => {
  const document = new GeometryDocument()
  run(document, 'A=(0,0,0)')
  const before = structuredClone(document.objects)
  const nextId = document.nextId
  for (const source of ['DoğruParçası(A, Z)', 'Düzlem((0,0,0),(1,0,0),(2,0,0))', 'DoğruParçası(A,(0,0,0))',
    'Uzunluk(A)', 'Hacim(A)', 'Prizma(A,(1,0,0),2)', 'Küre(A,b)', 'Açınım(A,30)', '(a,0,0)']) {
    const result = submitCommand(document, source)
    expect(result.ok, source).toBe(false)
  }
  expect(equalModelGraphs(document.objects, before)).toBe(true)
  expect(document.nextId).toBe(nextId)
  expect(document.undoDepth).toBe(1)
})

test('hata iletileri', () => {
  const document = new GeometryDocument()
  run(document, 'A=(0,0,0)', 's=DoğruParçası(A,(3,0,0))')
  const error = (source: string) => {
    const result = submitCommand(document, source)
    return result.ok ? null : result.error
  }
  expect(error('DoğruParçası(A, Z)')).toBe('Bilinmeyen ad: Z')
  expect(error('Doğru(A, s)')).toBe('s bir nokta değil.')
  expect(error('Düzlem(A,(1,0,0),(2,0,0))')).toBe('Düzlem için doğrusal olmayan üç nokta gerekir.')
  expect(error('Uzunluk(A)')).toBe('Uzunluk bir doğru parçası ister.')
  expect(error('Hacim(s)')).toBe('Bu ölçüm bir cisim ister.')
  expect(error('Açınım(s,10)')).toBe('s açılabilen bir cisim değil.')
  expect(error('B=(1,1,q)')).toBe('Bilinmeyen ad: q')
})

test('parametreye bağlı prizma kaydırıcıyla değişir, köşe noktaları da', () => {
  const document = new GeometryDocument()
  run(document, 'n=5', 'h=2', 'A=(0,0,0)', 'B=(3,0,0)', 'Prizma(A,B,n,2*h)')
  const prism = named<PolyhedronObject>(document, 'prizma1')
  expect(prism.sideCount).toBe(5)
  expect(prism.height).toBe(4)
  expect(prism.definition).toEqual({ sideCount: 'n', height: '2*h' })
  const vertices = () => document.objects.filter(object => object.type === 'point'
    && object.constraint?.type === 'vertex' && object.geometryValid !== false)
  expect(vertices()).toHaveLength(3 + 4)
  named<ParameterObject>(document, 'n').value = 8
  named<ParameterObject>(document, 'h').value = 0.5
  resolveAll(document)
  expect(prism.sideCount).toBe(8)
  expect(prism.height).toBe(1)
  expect(vertices()).toHaveLength(6 + 7)
  // Parameters out of range are clamped to a usable solid.
  named<ParameterObject>(document, 'n').value = 1.2
  resolveAll(document)
  expect(prism.sideCount).toBe(3)
})

test('parametre ifadeleri birbirine bağlanır; değişince bağlılar izler', () => {
  const document = new GeometryDocument()
  run(document, 'a=2', 'b=a*3', 'P=(b, 0, a)')
  expect(named<ParameterObject>(document, 'b').value).toBe(6)
  expect(named<PointObject>(document, 'P').position).toEqual(vec(6, 0, 2))
  run(document, 'a=1')
  expect(named<PointObject>(document, 'P').position).toEqual(vec(3, 0, 1))
  // Deleting a parameter deletes what is defined with it.
  const a = named<ParameterObject>(document, 'a')
  expect([...collectDependents(document.objects, [a.id])].map(id => document.get(id)!.name).sort()).toEqual(['P', 'b'])
  expect(deleteObject(document, a.id)).toBe(true)
  expect(document.objects).toHaveLength(0)
})

test('yarıçapla küre: ikinci nokta yerine tepede boyut noktası; parametreyle büyür', () => {
  const document = new GeometryDocument()
  run(document, 'r=2', 'M=(0,1,0)', 'Küre(M, r)')
  const sphere = named<SphereObject>(document, 'küre1')
  expect(sphere.points).toHaveLength(1)
  expect(sphere.radius).toBe(2)
  expect(sphere.definition).toEqual({ radius: 'r' })
  const handle = document.objects.find((object): object is PointObject => object.type === 'point' && object.constraint?.type === 'height')!
  expect(handle.position).toEqual(vec(0, 3, 0))
  run(document, 'r=3')
  expect(handle.position).toEqual(vec(0, 4, 0))
  run(document, 'Küre((5,0,0), 1.5)')
  expect(named<SphereObject>(document, 'küre2').radius).toBe(1.5)
  expect(named<SphereObject>(document, 'küre2').definition).toBeUndefined()
})

test('Açınım var olan cismi açar; ifadeyle açınım parametreyi izler', () => {
  const document = new GeometryDocument()
  run(document, 'Prizma((0,0,0),(2,0,0))', 'Açınım(prizma1, 60)')
  const prism = named<PolyhedronObject>(document, 'prizma1')
  expect(prism.unfold).toBe(60)
  run(document, 'a=30', 'Açınım(prizma1, 3*a)')
  expect(prism.unfold).toBe(90)
  run(document, 'a=100')
  // Clamped to where the net lies flat.
  expect(prism.unfold).toBe(90)
  run(document, 'Açınım(prizma1, 0)')
  expect(prism.definition).toEqual(undefined)
})

test('ölçümler var olan nesnelere başvurur; adı verilebilir', () => {
  const document = new GeometryDocument()
  run(document, 'A=(0,0,0)', 'p=Düzlem((0,2,0),(1,2,0),(0,2,1))', 'd=Uzaklık(A,p)', 'Silindir((5,0,0),(6,0,0),3)', 'Hacim(silindir1)')
  expect(named(document, 'd').type).toBe('measure')
  expect(named(document, 'hacim1')).toMatchObject({ type: 'measure', measure: 'volume' })
  // A measure is deleted with what it measures.
  expect(deleteObject(document, named(document, 'p').id)).toBe(true)
  expect(document.objects.some(object => object.name === 'd')).toBe(false)
})

test('hazırlama belgeyi değiştirmez ve kimlik ayırmaz', () => {
  const document = new GeometryDocument()
  run(document, 'A=(0,0,0)')
  const command = parseCommand('Prizma(A,(2,0,0),6)')
  if (!command.ok) throw new Error(command.error)
  const prepared = prepareCommand(command.name, command.command, { objects: document.objects, shapes: resolveAll(document), nextId: document.nextId })
  expect(prepared.ok).toBe(true)
  expect(document.objects).toHaveLength(1)
  expect(document.nextId).toBe(1)
  if (prepared.ok) {
    const ids = prepared.objects.map(object => object.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(Math.min(...ids)).toBe(1)
  }
})

test('kullanılan ad yeniden tanımlar: nokta taşınır, cisim izler', () => {
  const document = new GeometryDocument()
  run(document, 'A=(0,0,0)', 'B=(2,0,0)', 'Prizma(A,B)')
  run(document, 'A=(-1,0,0)')
  const prism = named<PolyhedronObject>(document, 'prizma1')
  const shapes = resolveAll(document)
  const shape = shapes.get(prism.id)
  expect(shape?.kind === 'polyhedron' && distance(shape.base[0]!, vec(-1, 0, 0))).toBe(0)
  expect(document.objects.filter(object => object.type === 'prism')).toHaveLength(1)
})
