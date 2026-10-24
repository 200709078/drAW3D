import { evaluateNumber, expressionNames } from '../commands/expressions'
import {
  MAX_SIDES, MIN_HEIGHT, MIN_SIDES, isPoint, type DefinedField, type GeometryObject, type ObjectId, type ParameterObject,
} from '../geometry/types'

/** Parameter names used by an object's definition expressions. */
export function definitionNames(object: GeometryObject): Set<string> {
  const names = new Set<string>()
  for (const expression of Object.values(object.definition ?? {})) {
    for (const name of expressionNames(expression)) names.add(name)
  }
  return names
}

export function parameterValues(objects: readonly GeometryObject[]): Map<string, number> {
  const values = new Map<string, number>()
  for (const object of objects) {
    if (object.type === 'parameter' && object.geometryValid !== false) values.set(object.name, object.value)
  }
  return values
}

/** Parameters ordered so that each comes after the parameters its expression uses; cycles are left out. */
function parameterOrder(objects: readonly GeometryObject[]): { ordered: ParameterObject[]; cyclic: Set<ObjectId> } {
  const byName = new Map<string, ParameterObject>()
  for (const object of objects) if (object.type === 'parameter') byName.set(object.name, object)
  const ordered: ParameterObject[] = []
  const state = new Map<ParameterObject, 'visiting' | 'done'>()
  const cyclic = new Set<ObjectId>()
  const visit = (parameter: ParameterObject): boolean => {
    const current = state.get(parameter)
    if (current === 'done') return true
    if (current === 'visiting') return false
    state.set(parameter, 'visiting')
    let ok = true
    for (const name of definitionNames(parameter)) {
      const dependency = byName.get(name)
      if (dependency && !visit(dependency)) ok = false
    }
    state.set(parameter, 'done')
    if (!ok) cyclic.add(parameter.id)
    ordered.push(parameter)
    return ok
  }
  for (const parameter of byName.values()) visit(parameter)
  return { ordered, cyclic }
}

/** Keep a field's value meaningful; null when the value cannot be used. */
function fieldValue(field: DefinedField, value: number): number | null {
  switch (field) {
    case 'sideCount': return Math.min(MAX_SIDES, Math.max(MIN_SIDES, Math.round(value)))
    case 'height': return Math.max(MIN_HEIGHT, value)
    case 'radius': return value > 0 ? value : null
    case 'unfold': return Math.max(0, value)
    case 'topRatio': return value > 0 && value < 1 ? value : null
    default: return value
  }
}

/**
 * Evaluate every definition with the current parameter values and write the results into
 * the models. Returns the objects whose definition cannot be evaluated now; they keep
 * their last values and are not drawn until it can.
 */
export function evaluateDefinitions(objects: readonly GeometryObject[]): Set<ObjectId> {
  const failed = new Set<ObjectId>()
  const { ordered, cyclic } = parameterOrder(objects)
  const values = new Map<string, number>()
  for (const parameter of ordered) {
    const expression = parameter.definition?.value
    if (expression === undefined) {
      values.set(parameter.name, parameter.value)
      continue
    }
    try {
      if (cyclic.has(parameter.id)) throw new Error('Döngüsel tanım')
      parameter.value = evaluateNumber(expression, values)
      values.set(parameter.name, parameter.value)
    } catch {
      failed.add(parameter.id)
    }
  }
  for (const object of objects) {
    if (object.type === 'parameter' || !object.definition) continue
    const record = object as unknown as Record<string, unknown>
    try {
      for (const [field, expression] of Object.entries(object.definition) as [DefinedField, string][]) {
        const value = fieldValue(field, evaluateNumber(expression, values))
        if (value === null) throw new RangeError('Değer kullanılamaz')
        if (isPoint(object) && (field === 'x' || field === 'y' || field === 'z')) {
          if (object.position[field] !== value) object.position = { ...object.position, [field]: value }
        } else if (record[field] !== value) {
          record[field] = value
        }
      }
    } catch {
      failed.add(object.id)
    }
  }
  return failed
}

/** Drop the expression of a field the user sets directly (dragging, a slider). */
export function releaseField(object: GeometryObject, ...fields: DefinedField[]): void {
  if (!object.definition) return
  for (const field of fields) delete object.definition[field]
  if (Object.keys(object.definition).length === 0) delete object.definition
}

export type RangeResult = { ok: true } | { ok: false; error: string }

/** Slider bounds; the value is kept inside them. */
export function setParameterRange(parameter: ParameterObject, min: number, max: number, step: number): RangeResult {
  if (![min, max, step].every(Number.isFinite) || min >= max || step <= 0 || step > max - min) {
    return { ok: false, error: 'En küçük değer en büyükten küçük, adım pozitif ve aralıktan küçük olmalı.' }
  }
  parameter.min = min
  parameter.max = max
  parameter.step = step
  parameter.value = Math.min(max, Math.max(min, parameter.value))
  return { ok: true }
}

/** Default slider bounds around a value. */
export function defaultRange(value: number): { min: number; max: number; step: number } {
  return { min: Math.min(-5, Math.floor(value)), max: Math.max(5, Math.ceil(value)), step: 0.1 }
}
