import { expect, test } from '@playwright/test'
import { GeometryDocument } from '../src/document/geometry-document'
import { equalModelGraphs } from '../src/document/graph-equality'
import { createObjectName } from '../src/document/names'
import { randomColor } from '../src/document/colors'
import type { PointObject } from '../src/geometry/types'
import { vec } from '../src/geometry/vec3'

function point(id: number, x = 0): PointObject {
  return { id, type: 'point', name: `P${id}`, color: '#0066ff', position: vec(x, 0, 0) }
}

test('geçmiş: işlem, geri al, yinele; etkisiz işlem geçmiş oluşturmaz ve yinele dalını korur', () => {
  const document = new GeometryDocument()
  document.append(point(document.allocateId()))
  expect(document.commit()).toBe(true)
  const moved = document.objects[0] as PointObject
  moved.position = vec(5, 0, 0)
  expect(document.commit()).toBe(true)
  expect(document.undo()).toBe(true)
  expect((document.objects[0] as PointObject).position.x).toBe(0)
  expect(document.canRedo).toBe(true)
  expect(document.commit()).toBe(false)
  expect(document.canRedo).toBe(true)
  expect(document.redo()).toBe(true)
  expect((document.objects[0] as PointObject).position.x).toBe(5)
  // Restored states are copies: editing them does not change the history.
  ;(document.objects[0] as PointObject).position = vec(9, 9, 9)
  document.undo()
  document.redo()
  expect((document.objects[0] as PointObject).position.x).toBe(5)
})

test('kimlikler geri alındıktan sonra da yeniden kullanılmaz', () => {
  const document = new GeometryDocument()
  document.append(point(document.allocateId()))
  document.commit()
  document.undo()
  expect(document.allocateId()).toBe(1)
  expect(() => document.append(point(0), point(0))).toThrow()
  expect(document.objects).toHaveLength(0)
})

test('geçmiş sınırı en eski durumları atar', () => {
  const document = new GeometryDocument({ historyLimit: 3 })
  for (let index = 0; index < 6; index++) {
    document.append(point(document.allocateId()))
    document.commit()
  }
  expect(document.undoDepth).toBe(3)
  while (document.undo()) { /* to the oldest kept state */ }
  expect(document.objects).toHaveLength(3)
  expect(() => new GeometryDocument({ historyLimit: 0 })).toThrow()
})

test('yarım çizim taslakları iptal edilir ve kaydedilemez', () => {
  const document = new GeometryDocument()
  document.append(point(document.allocateId()))
  document.commit()
  const draft = point(document.allocateId())
  document.append(draft)
  document.trackDraft(draft.id)
  document.activeId = draft.id
  expect(() => document.commit()).toThrow()
  expect(document.cancelDraft()).toBe(true)
  expect(document.objects).toHaveLength(1)
  expect(document.activeId).toBeNull()
})

test('düzenleme oturumu tek adım kaydedilir veya geri döndürülür', () => {
  const document = new GeometryDocument()
  document.append(point(document.allocateId()))
  document.commit()
  document.beginEdit()
  ;(document.objects[0] as PointObject).position = vec(1, 0, 0)
  ;(document.objects[0] as PointObject).position = vec(2, 0, 0)
  expect(document.cancelEdit()).toBe(true)
  expect((document.objects[0] as PointObject).position.x).toBe(0)
  document.beginEdit()
  ;(document.objects[0] as PointObject).position = vec(3, 0, 0)
  expect(document.commitEdit()).toBe(true)
  expect(document.undoDepth).toBe(2)
})

test('graf eşitliği -0 ve NaN değerlerini ayırır', () => {
  expect(equalModelGraphs({ a: [1, { b: NaN }] }, { a: [1, { b: NaN }] })).toBe(true)
  expect(equalModelGraphs({ a: 0 }, { a: -0 })).toBe(false)
  expect(equalModelGraphs({ a: 1 }, { a: 1, b: undefined })).toBe(false)
})

test('adlar türüne göre ve çakışmadan verilir', () => {
  expect(createObjectName('point', ['A', 'B'])).toBe('C')
  expect(createObjectName('segment', ['a'])).toBe('b')
  expect(createObjectName('angle', [])).toBe('α')
  expect(createObjectName('plane', ['p'])).toBe('q')
  expect(createObjectName('prism', ['prizma1'])).toBe('prizma2')
  expect(createObjectName('sphere', [])).toBe('küre1')
  const letters = Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ')
  expect(createObjectName('point', letters)).toBe('A1')
})

test('rastgele renkler koyulaştırılmış altıgen renklerdir', () => {
  expect(randomColor(() => 0.999)).toBe('#bfbfbf')
  expect(randomColor(() => 0)).toBe('#000000')
  expect(randomColor()).toMatch(/^#[0-9a-f]{6}$/)
})
