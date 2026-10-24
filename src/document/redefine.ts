import { definitionText } from '../commands/describe'
import { evaluateNumber, isReservedName, renameInExpression } from '../commands/expressions'
import { OBJECT_NAME, parseCommand } from '../commands/parser'
import { prepareCommand } from '../commands/prepare'
import { partsOf } from '../geometry/parts'
import {
  isFigure, isInternalPoint, isPoint, isSolid, isUnfoldable, type Definition, type GeometryObject, type ObjectId, type ParameterObject,
  type PointObject,
} from '../geometry/types'
import { createContext } from './constructions'
import { definitionNames, parameterValues } from './definitions'
import { collectDependents, dependencyOrder, type ShapeMap } from './dependencies'
import { syncVertexPoints } from './editing'
import type { GeometryDocument } from './geometry-document'

/** `A = (1,2,3)`, `s: DoğruParçası(A,B)`: a name in front of the definition. */
const LEADING_NAME = /^\s*([\p{L}_][\p{L}\p{N}_]*)\s*[:=]\s*([\s\S]+)$/u

/** Types that can replace each other in place. */
const FAMILIES: readonly (readonly string[])[] = [
  ['line', 'segment', 'ray'], ['prism', 'pyramid'], ['cylinder', 'cone'],
]

export type RedefineResult = { ok: true } | { ok: false; error: string }

export function splitEditText(text: string): { name: string | null; definition: string } {
  const match = text.match(LEADING_NAME)
  if (!match) return { name: null, definition: text.trim() }
  return { name: match[1]!, definition: match[2]!.trim() }
}

const compact = (text: string) => text.replace(/\s+/g, '')

function compatible(from: string, to: string): boolean {
  return from === to || FAMILIES.some(family => family.includes(from) && family.includes(to))
}

/** Does the parameter named `from` use `target`, directly or through other parameters? */
function parameterUses(objects: readonly GeometryObject[], from: string, target: string): boolean {
  const byName = new Map(objects.filter(object => object.type === 'parameter').map(object => [object.name, object]))
  const seen = new Set<string>()
  const stack = [from]
  while (stack.length) {
    const name = stack.pop()!
    if (name === target) return true
    if (seen.has(name)) continue
    seen.add(name)
    const parameter = byName.get(name)
    if (parameter) stack.push(...definitionNames(parameter))
  }
  return false
}

function setDefinition(object: GeometryObject, definition: Definition | undefined, keep: (keyof Definition)[] = []): void {
  const next: Definition = { ...definition }
  for (const field of keep) if (object.definition?.[field] !== undefined) next[field] = object.definition[field]
  if (Object.keys(next).length) object.definition = next
  else delete object.definition
}

type Change = () => void

function redefineParameter(objects: readonly GeometryObject[], parameter: ParameterObject, definition: string): Change {
  const parsed = parseCommand(`${parameter.name}=${definition}`)
  if (!parsed.ok || parsed.command.kind !== 'parameter') throw new Error('Parametre bir sayı veya parametrelerden oluşan bir ifade olmalı.')
  const value = parsed.command.value
  if (typeof value === 'number') {
    return () => {
      parameter.value = value
      parameter.min = Math.min(parameter.min, value)
      parameter.max = Math.max(parameter.max, value)
      delete parameter.definition
    }
  }
  const others = objects.filter(object => object !== parameter)
  for (const name of definitionNames({ ...parameter, definition: { value: value.expression } })) {
    if (name === parameter.name || parameterUses(objects, name, parameter.name)) throw new Error('Döngüsel parametre tanımı kullanılamaz.')
  }
  const evaluated = evaluateNumber(value.expression, parameterValues(others))
  return () => {
    parameter.value = evaluated
    parameter.definition = { value: value.expression }
  }
}

function redefinePoint(objects: readonly GeometryObject[], shapes: ShapeMap, point: PointObject, definition: string): Change {
  const parsed = parseCommand(definition)
  if (!parsed.ok) throw new Error(parsed.error)
  if (parsed.command.kind !== 'point') throw new Error('Nokta (x, y, z) biçiminde yazılır.')
  const parameters = parameterValues(objects)
  const coordinates = parsed.command.point
  const next: Definition = {}
  const values = (['x', 'y', 'z'] as const).map(axis => {
    const argument = coordinates[axis]
    if (typeof argument === 'number') return argument
    next[axis] = argument.expression
    return evaluateNumber(argument.expression, parameters)
  })
  const position = { x: values[0]!, y: values[1]!, z: values[2]! }
  const constraint = point.constraint
  if (constraint?.type === 'on') {
    // Typed coordinates move a point on an object along that object.
    const part = shapes.get(constraint.ownerId) ? partsOf(shapes.get(constraint.ownerId)!)[constraint.part] : undefined
    if (!part) throw new Error('Noktanın bağlı olduğu nesne tanımsız.')
    return () => { constraint.params = part.project(position) }
  }
  return () => {
    point.position = position
    setDefinition(point, next)
  }
}

function redefineFigure(document: GeometryDocument, shapes: ShapeMap, target: GeometryObject, definition: string): Change {
  const parsed = parseCommand(definition)
  if (!parsed.ok) throw new Error(parsed.error)
  if (parsed.name !== null) throw new Error('Tanımın içinde ad kullanılamaz.')
  const command = parsed.command
  if (command.kind === 'unfold' || command.kind === 'parameter' || command.kind === 'point') {
    throw new Error('Tanım aynı türde bir nesne üretmelidir.')
  }
  const prepared = prepareCommand(null, command, { objects: document.objects, shapes, nextId: document.nextId })
  if (!prepared.ok) throw new Error(prepared.error)
  const fresh = prepared.objects.find(object => object.id === prepared.activeId)!
  if (!compatible(target.type, fresh.type)) throw new Error('Tanım aynı türde bir nesne üretmelidir.')
  if (target.type === 'sphere' && fresh.type === 'sphere' && (target.radius === undefined) !== (fresh.radius === undefined)) {
    throw new Error('Küre aynı biçimde (nokta veya yarıçapla) tanımlanmalı.')
  }
  // The new definition may not use the object itself or anything built on it.
  const forbidden = collectDependents(document.objects, [target.id])
  forbidden.add(target.id)
  const uses = fresh.type === 'measure' || fresh.type === 'section' ? fresh.targets : isFigure(fresh) ? [...fresh.points] : []
  const constructedFrom = 'construction' in fresh && fresh.construction ? fresh.construction.sources : []
  if ([...uses, ...constructedFrom].some(id => forbidden.has(id))) throw new Error('Nesne kendisine veya ona bağlı bir nesneye başvuramaz.')
  // New points typed as coordinates come along; the construction's other helpers are not needed.
  const created = prepared.objects.filter((object): object is PointObject => isPoint(object) && uses.includes(object.id))
  const ownHelpers = document.objects.filter(object => object.ownerId === target.id)
  const ownSegment = ownHelpers.find(object => object.type === 'segment')
  const sizeGiven = 'height' in command && command.height !== undefined
  return () => {
    for (const point of created) {
      if (point.ownerId === fresh.id) point.ownerId = target.id
    }
    document.append(...created)
    const record = target as unknown as Record<string, unknown>
    record.type = fresh.type
    if (target.type === 'measure' && fresh.type === 'measure') {
      target.measure = fresh.measure
      target.targets = fresh.targets
      return
    }
    if (target.type === 'section' && fresh.type === 'section') {
      target.targets = fresh.targets
      return
    }
    if (!isFigure(target) || !isFigure(fresh)) return
    if ((target.type === 'prism' || target.type === 'pyramid') && (fresh.type === 'prism' || fresh.type === 'pyramid')) {
      // The side point C stays: it is the solid's own helper, not part of the text.
      target.points = [fresh.points[0], fresh.points[1], target.points[2]]
      target.sideCount = fresh.sideCount
    } else if (target.type === 'regular' && fresh.type === 'regular') {
      target.points = [fresh.points[0], fresh.points[1], target.points[2]]
      target.solid = fresh.solid
      if (fresh.solid !== 'cube') delete target.net
    } else {
      record.points = [...fresh.points]
    }
    if (isSolid(target) && isSolid(fresh) && sizeGiven) target.height = fresh.height
    // A cut pyramid or cone stays cut only when the text says so.
    if (isSolid(target) && isSolid(fresh)) {
      if (fresh.topRatio === undefined) delete target.topRatio
      else target.topRatio = fresh.topRatio
    }
    if (target.type === 'sphere' && fresh.type === 'sphere' && fresh.radius !== undefined) target.radius = fresh.radius
    setDefinition(target, fresh.definition, ['unfold'])
    if (ownSegment && ownSegment.type === 'segment') {
      const handle = ownHelpers.find(object => isPoint(object) && object.constraint?.type === 'height')
      ownSegment.points = target.type === 'sphere' && target.radius !== undefined && handle
        ? [target.points[0], handle.id] : [target.points[0], target.points[1]!]
    }
    if (isUnfoldable(target)) syncVertexPoints(document, createContext(document.objects, () => document.allocateId()), target.id)
    // A constructed line or plane: the new hidden points replace the old ones.
    if ('construction' in fresh && fresh.construction) record.construction = fresh.construction
    else delete record.construction
    for (const helper of ownHelpers) {
      if (isInternalPoint(helper) && !(target.points as readonly ObjectId[]).includes(helper.id)) document.remove(helper.id)
    }
  }
}

/** A constructed point takes a new construction (`OrtaNokta(A, C)`, `Kesiştir(d, q)`). */
function redefineDerived(document: GeometryDocument, shapes: ShapeMap, target: PointObject, definition: string): Change {
  const parsed = parseCommand(definition)
  if (!parsed.ok) throw new Error(parsed.error)
  const command = parsed.command
  if (parsed.name !== null || (command.kind !== 'midpoint' && command.kind !== 'intersect' && command.kind !== 'project')) {
    throw new Error('Tanım aynı türde bir nesne üretmelidir.')
  }
  const prepared = prepareCommand(null, command, { objects: document.objects, shapes, nextId: document.nextId })
  if (!prepared.ok) throw new Error(prepared.error)
  const fresh = prepared.objects.find(object => object.id === prepared.activeId)
  if (!isPoint(fresh) || fresh.constraint?.type !== 'construct') throw new Error('Tanım aynı türde bir nesne üretmelidir.')
  const constraint = { ...fresh.constraint }
  const forbidden = collectDependents(document.objects, [target.id])
  forbidden.add(target.id)
  if (constraint.sources.some(id => forbidden.has(id))) throw new Error('Nesne kendisine veya ona bağlı bir nesneye başvuramaz.')
  // The second intersection of a line and a sphere stays the second one.
  const previous = target.constraint
  if (previous?.type === 'construct' && previous.rule === 'intersect' && constraint.rule === 'intersect' && previous.index !== undefined) {
    constraint.index = previous.index
  }
  const created = prepared.objects.filter((object): object is PointObject => isPoint(object) && constraint.sources.includes(object.id))
  return () => {
    document.append(...created)
    target.constraint = constraint
  }
}

/**
 * Apply a card's edited text: `name: definition`. A changed name renames the object (and
 * every expression that uses a renamed parameter); a changed definition replaces its values
 * in place, keeping its identity, color, helpers and every reference to it. Nothing
 * changes when an error is returned.
 */
export function redefineObject(document: GeometryDocument, shapes: ShapeMap, target: GeometryObject, text: string): RedefineResult {
  const current = definitionText(target, document.objects)
  if (current === null) return { ok: false, error: 'Bu nesne düzenlenemez.' }
  const edit = splitEditText(text)
  if (!edit.definition) return { ok: false, error: 'Bir tanım girin.' }
  const name = edit.name ?? target.name
  if (name !== target.name) {
    if (!OBJECT_NAME.test(name) || isReservedName(name)) return { ok: false, error: `Ad olarak kullanılamaz: ${name}` }
    if (document.objects.some(object => object !== target && object.name === name)) {
      return { ok: false, error: `Bu ad başka bir nesnede kullanılıyor: ${name}` }
    }
  }
  let change: Change | null = null
  if (compact(edit.definition) !== compact(current)) {
    try {
      if (target.type === 'parameter') change = redefineParameter(document.objects, target, edit.definition)
      else if (isPoint(target) && target.constraint?.type === 'construct') change = redefineDerived(document, shapes, target, edit.definition)
      else if (isPoint(target)) change = redefinePoint(document.objects, shapes, target, edit.definition)
      else change = redefineFigure(document, shapes, target, edit.definition)
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Tanım uygulanamadı.' }
    }
  }
  change?.()
  if (name !== target.name) {
    const previous = target.name
    target.name = name
    if (target.type === 'parameter') {
      for (const object of document.objects) {
        if (!object.definition) continue
        for (const [field, expression] of Object.entries(object.definition)) {
          object.definition[field as keyof Definition] = renameInExpression(expression, previous, name)
        }
      }
    }
  }
  document.arrange(dependencyOrder(document.objects))
  return { ok: true }
}
