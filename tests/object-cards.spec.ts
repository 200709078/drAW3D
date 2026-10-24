import { expect, test } from '@playwright/test'
import { applyStyle, describeCard, editText, styleSpec, type CardContext } from '../src/app/object-cards'
import { resolveAll } from '../src/document/editing'
import { GeometryDocument } from '../src/document/geometry-document'
import { submitCommand } from '../src/document/submit'
import type { GeometryObject } from '../src/geometry/types'

function setup(...sources: string[]) {
  const document = new GeometryDocument()
  for (const source of sources) {
    const result = submitCommand(document, source)
    if (!result.ok) throw new Error(`${source}: ${result.error}`)
  }
  const context = (): CardContext => ({ objects: document.objects, shapes: resolveAll(document) })
  const object = (name: string) => document.objects.find(item => item.name === name) as GeometryObject
  return { document, context, card: (name: string) => describeCard(object(name), context()), object }
}

test('kartlar tanımı ve değerleri gösterir', () => {
  const { card } = setup('A=(0,0,0)', 'B=(3,0,4)', 's=DoğruParçası(A,B)', 'p=Düzlem((0,2,0),(1,2,0),(0,2,1))',
    'q=Düzlem((0,0,0),(1,0,0),(0,1,1))', 'Açı((3,0,0),A,(0,0,3))', 'Küre(A,1)', 'Prizma(A,(2,0,0))', 'Koni((5,0,0),(6,0,0),3)',
    'Hacim(prizma1)', 'a=2', 'b=a/4')
  expect(card('A')).toMatchObject({ input: 'A = (0, 0, 0)', output: [], valueFirst: false })
  expect(card('s')).toMatchObject({ input: 's: DoğruParçası(A, B)', output: ['Uzunluk = 5'] })
  expect(card('p').output).toEqual(['y = 2'])
  expect(card('q').output).toEqual(['y − z = 0'])
  expect(card('α')).toMatchObject({ output: ['α = 90°'], valueFirst: true })
  expect(card('küre1').output).toEqual(['r = 1', 'Yüzey alanı = 12.57', 'Hacim = 4.19'])
  expect(card('prizma1')).toMatchObject({
    input: 'prizma1: Prizma(A, L, 4, 2)', output: ['Taban alanı = 4', 'Yüzey alanı = 24', 'Hacim = 8'],
  })
  expect(card('prizma1').sliders.map(slider => [slider.field, slider.label, slider.max])).toEqual([['sideCount', 'Kenar', 20], ['unfold', 'Açınım', 90]])
  expect(card('koni1').output[0]).toBe('r = 1, h = 3')
  expect(card('koni1').sliders.map(slider => slider.field)).toEqual(['unfold'])
  expect(card('hacim1')).toMatchObject({ input: 'hacim1: Hacim(prizma1)', output: ['hacim1 = 8'], valueFirst: true })
  expect(card('a')).toMatchObject({ input: 'a = 2', output: [], parameter: { min: -5, max: 5, step: 0.1 } })
  expect(card('a').sliders).toEqual([{ field: 'value', min: -5, max: 5, step: 0.1, value: 2, label: '' }])
  expect(card('b')).toMatchObject({ input: 'b: a/4', output: ['b = 0.50'], valueFirst: true, sliders: [] })
})

test('tanımsız nesnenin değeri ∅; nesneye bağlı noktanın kartı nesnesini söyler', () => {
  const { document, card, object, context } = setup('A=(0,0,0)', 'B=(2,0,0)', 's=DoğruParçası(A,B)')
  const segment = object('s')
  document.append({ id: document.allocateId(), type: 'point', name: 'P', color: '#0b6b3a', position: { x: 1, y: 0, z: 0 },
    constraint: { type: 'on', ownerId: segment.id, part: 0, params: [0.5] } })
  expect(card('P').output).toEqual(['s üzerinde'])
  submitCommand(document, 'B=(0,0,0)')
  expect(describeCard(object('s'), context()).output).toEqual(['∅'])
  expect(editText(object('s'), context())).toBe('s: DoğruParçası(A, B)')
})

test('görünüm ayarları türe göre sunulur; varsayılana dönmek alanı siler', () => {
  const { object } = setup('A=(0,0,0)', 's=DoğruParçası(A,(1,0,0))', 'Prizma(A,(0,0,2))', 'Küre(A,1)', 'a=1', 'Uzaklık(A,s)')
  expect(styleSpec(object('A'))).toMatchObject({ size: { caption: 'Boyut' }, lineStyle: null, opacity: null, faces: null })
  expect(styleSpec(object('s'))).toMatchObject({ size: { caption: 'Kalınlık' }, lineStyle: 'solid', opacity: null })
  expect(styleSpec(object('prizma1'))).toMatchObject({ size: null, lineStyle: 'solid', opacity: 0.55, faces: true, edges: true })
  expect(styleSpec(object('küre1'))).toMatchObject({ opacity: 0.55, faces: null, edges: null })
  expect(styleSpec(object('a'))).toBeNull()
  const prism = object('prizma1')
  expect(applyStyle(prism, { opacity: 0.3, faces: false, lineStyle: 'dashed', labelVisible: true })).toBe(true)
  expect(prism).toMatchObject({ opacity: 0.3, facesHidden: true, lineStyle: 'dashed', labelVisible: true })
  expect(applyStyle(prism, { opacity: 0.55, faces: true, lineStyle: 'solid', labelVisible: false })).toBe(true)
  for (const field of ['opacity', 'facesHidden', 'lineStyle', 'labelVisible']) expect(field in prism).toBe(false)
  expect(applyStyle(prism, { lineStyle: 'solid' })).toBe(false)
  const segment = object('s')
  applyStyle(segment, { size: 2.04 })
  expect(segment.size).toBe(2.04)
  applyStyle(segment, { size: 1 })
  expect('size' in segment).toBe(false)
})
