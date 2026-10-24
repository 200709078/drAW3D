import { expect, test } from '@playwright/test'
import { evaluateNumber, expressionNames, renameInExpression } from '../src/commands/expressions'
import { matchingTemplates } from '../src/commands/language'
import { parseCommand } from '../src/commands/parser'

function parsed(source: string) {
  const result = parseCommand(source)
  if (!result.ok) throw new Error(result.error)
  return result
}

function error(source: string): string {
  const result = parseCommand(source)
  if (result.ok) throw new Error(`Hata bekleniyordu: ${source}`)
  return result.error
}

test('noktalar üç koordinatla yazılır; ad verilebilir', () => {
  expect(parsed('(1, 2.5, -3)')).toEqual({ ok: true, name: null, command: { kind: 'point', point: { x: 1, y: 2.5, z: -3 } } })
  expect(parsed('A=(0, sqrt(4), pi)').name).toBe('A')
  expect(parsed('A = (a, 0, 1)').command).toEqual({ kind: 'point', point: { x: { expression: 'a' }, y: 0, z: 1 } })
  expect(error('(1, 2)')).toBe('Nokta üç koordinatla yazılır: (x, y, z).')
})

test('komut adları büyük-küçük harf ve Türkçe işaretlerden bağımsızdır; İngilizce adlar da geçer', () => {
  for (const source of ['DoğruParçası(A,B)', 'dogruparcasi(A,B)', 'Segment(A, B)']) {
    expect(parsed(source).command).toEqual({ kind: 'segment', A: { kind: 'reference', name: 'A' }, B: { kind: 'reference', name: 'B' } })
  }
  expect(parsed('Işın((0,0,0),B)').command.kind).toBe('ray')
  expect(parsed('Düzlem(A,B,C)').command.kind).toBe('plane')
})

test('cisimlerde kenar sayısı ve yükseklik isteğe bağlıdır; ifadeler parametre adlarını taşır', () => {
  expect(parsed('Prizma(A,B)').command).toEqual({ kind: 'prism', A: { kind: 'reference', name: 'A' }, B: { kind: 'reference', name: 'B' } })
  expect(parsed('Piramit(A,B,n,2*h)').command).toEqual({
    kind: 'pyramid', A: { kind: 'reference', name: 'A' }, B: { kind: 'reference', name: 'B' },
    sides: { expression: 'n' }, height: { expression: '2*h' },
  })
  expect(parsed('Silindir(A,B,5)').command).toMatchObject({ kind: 'cylinder', height: 5 })
  expect(parsed('Koni(A,B)').command).toMatchObject({ kind: 'cone' })
  expect(error('Prizma(A,B,3,4,5)')).toBe('Bu komut 2–4 parametre alır.')
})

test('Küre ikinci parametresine göre noktadan geçer veya yarıçapla kurulur', () => {
  expect(parsed('Küre(A,B)').command).toMatchObject({ kind: 'sphere', through: { kind: 'reference', name: 'B' } })
  expect(parsed('Küre(A,(1,2,3))').command).toMatchObject({ kind: 'sphere', through: { kind: 'coordinates' } })
  expect(parsed('Küre(A,2.5)').command).toMatchObject({ kind: 'sphereRadius', radius: 2.5 })
  expect(parsed('Küre(A,2*r)').command).toMatchObject({ kind: 'sphereRadius', radius: { expression: '2*r' } })
  expect(error('Küre(A,-1)')).toBe('Yarıçap pozitif olmalı.')
})

test('ölçüm komutları ve iki parametreli Açı', () => {
  expect(parsed('Uzaklık(A,p)').command).toEqual({ kind: 'measure', measure: 'distance', targets: ['A', 'p'] })
  expect(parsed('Açı(a,p)').command).toEqual({ kind: 'measure', measure: 'angle', targets: ['a', 'p'] })
  expect(parsed('Açı(A,B,C)').command.kind).toBe('angle')
  expect(parsed('Hacim(prizma1)').command).toEqual({ kind: 'measure', measure: 'volume', targets: ['prizma1'] })
  expect(parsed('TabanAlanı(k)').command).toMatchObject({ measure: 'baseArea' })
  expect(parsed('YüzeyAlanı(k)').command).toMatchObject({ measure: 'surfaceArea' })
  expect(parsed('Uzunluk(s)').command).toMatchObject({ measure: 'length' })
  expect(parsed('Açınım(prizma1, 90)').command).toEqual({ kind: 'unfold', solid: 'prizma1', angle: 90 })
})

test('ad = sayı veya ifade bir parametredir', () => {
  expect(parsed('a=2').command).toEqual({ kind: 'parameter', name: 'a', value: 2 })
  expect(parsed('b = a + 1').command).toEqual({ kind: 'parameter', name: 'b', value: { expression: 'a + 1' } })
  expect(parsed('c = (1+2)*3').command).toEqual({ kind: 'parameter', name: 'c', value: 9 })
  expect(parsed('r = sqrt(2)').command).toMatchObject({ kind: 'parameter', value: Math.SQRT2 })
  expect(parsed('k: 3').command).toEqual({ kind: 'parameter', name: 'k', value: 3 })
  expect(parsed('s = DoğruParçası(A,B)')).toMatchObject({ name: 's', command: { kind: 'segment' } })
})

test('hatalı girişler açıklanır', () => {
  expect(error('Bilinmez(A)')).toBe('Bilinmeyen komut: Bilinmez')
  expect(error('Prizma')).toBe('Komut parametrelerini parantez içinde yazın.')
  expect(error('Doğru((0,0,0),(1,1,1)')).toBe('Parantezler dengeli olmalı.')
  expect(error('Doğru(A,)')).toBe('Boş komut parametresi kullanılamaz.')
  expect(error('x=2')).toBe('Ad olarak kullanılamaz: x')
  expect(error('(x, 0, 0)')).toBe('Sayısal değer x değişkenini içeremez.')
  expect(error('Doğru(A, 2B)')).toBe('Geçerli bir nesne adı kullanın: 2B')
  expect(error('merhaba')).toBe('Bir komut, nokta (x, y, z) veya ad = değer girin.')
})

test('sayısal ifadeler: parametreler, işlevler, güvenli ağaç', () => {
  expect(evaluateNumber('2*a+b^2', new Map([['a', 1], ['b', 3]]))).toBe(11)
  expect(evaluateNumber('ln(e)')).toBeCloseTo(1, 12)
  expect(evaluateNumber('log(2, 8)')).toBeCloseTo(3, 12)
  expect(() => evaluateNumber('a+1')).toThrow(ReferenceError)
  expect(() => evaluateNumber('sqrt(-1)')).toThrow('İfade sonlu bir gerçek sayı üretmelidir.')
  expect(() => evaluateNumber('[1,2]')).toThrow()
  expect(() => evaluateNumber('a=2')).toThrow()
  expect(() => evaluateNumber('import(x)')).toThrow()
  expect([...expressionNames('a*sin(b)+pi')]).toEqual(['a', 'b'])
  expect(renameInExpression('a+ab+a*2', 'a', 'k')).toBe('k+ab+k*2')
})

test('şablon önerileri her ad biçimiyle eşleşir', () => {
  expect(matchingTemplates('pri').map(entry => entry.command)).toEqual(['prism'])
  expect(matchingTemplates('uza').map(entry => entry.syntax)).toEqual(['Uzaklık(<Nesne>, <Nesne>)'])
  expect(matchingTemplates('dogru').map(entry => entry.command)).toEqual(['line', 'segment'])
  expect(matchingTemplates('')).toEqual([])
})
