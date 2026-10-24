import { isPoint, type ConstructRule, type DefinedField, type GeometryObject, type ObjectId } from '../geometry/types'
import { displayName, type CommandName } from './language'

/** Presentation only: whole numbers as they are, others with two decimals. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '∅'
  const integer = Math.round(value)
  return Math.abs(value - integer) < 1e-6 ? String(integer) : value.toFixed(2)
}

/** For editable text: enough digits to round-trip what the user sees, without float noise. */
export function exactNumber(value: number): string {
  const integer = Math.round(value)
  if (Math.abs(value - integer) < 1e-9) return String(integer)
  return String(Number(value.toFixed(4)))
}

/** Commands of the visible constructed points; the hidden ones are parts of lines and planes. */
const POINT_RULES: Readonly<Partial<Record<ConstructRule, CommandName>>> = {
  midpoint: 'midpoint', intersect: 'intersect', project: 'project',
}

const MEASURE_COMMANDS: Readonly<Record<string, CommandName>> = {
  length: 'length', distance: 'distance', angle: 'angle', baseArea: 'baseArea', surfaceArea: 'surfaceArea', volume: 'volume',
}

/**
 * The command that defines an object, with names for the objects it uses and expressions
 * for parameter-defined numbers. Parsing it gives the object back. Null for helpers and
 * for points a construction owns (a solid's vertices), which are not defined by text.
 */
export function definitionText(object: GeometryObject, objects: readonly GeometryObject[]): string | null {
  const nameOf = (id: ObjectId) => objects.find(candidate => candidate.id === id)?.name ?? '?'
  const field = (key: DefinedField, value: number) => object.definition?.[key] ?? exactNumber(value)
  const call = (kind: CommandName, args: (string | number)[]) => `${displayName(kind)}(${args.join(', ')})`
  if (isPoint(object)) {
    const constraint = object.constraint
    if (constraint?.type === 'construct') {
      if (object.ownerId !== undefined) return null
      const rule = POINT_RULES[constraint.rule]
      return rule ? call(rule, constraint.sources.map(nameOf)) : null
    }
    if (constraint && constraint.type !== 'on') return null
    const { x, y, z } = object.position
    return `(${field('x', x)}, ${field('y', y)}, ${field('z', z)})`
  }
  if (object.ownerId !== undefined) return null
  switch (object.type) {
    case 'line':
    case 'segment':
    case 'ray':
    case 'plane':
      if (object.construction) {
        const { kind, sources } = object.construction
        const command: CommandName = kind === 'intersection' ? 'intersect'
          : object.type === 'plane' ? (kind === 'perpendicular' ? 'perpendicularPlane' : 'parallelPlane')
            : kind === 'perpendicular' ? 'perpendicularLine' : 'parallelLine'
        return call(command, sources.map(nameOf))
      }
      return call(object.type, object.points.map(nameOf))
    case 'angle':
      return call(object.type, object.points.map(nameOf))
    case 'sphere':
      return object.radius === undefined
        ? call('sphere', object.points.map(nameOf))
        : call('sphere', [nameOf(object.points[0]), field('radius', object.radius)])
    case 'prism':
    case 'pyramid': {
      const args = [nameOf(object.points[0]), nameOf(object.points[1]), field('sideCount', object.sideCount), field('height', object.height)]
      return object.topRatio === undefined ? call(object.type, args) : call('frustum', [...args, field('topRatio', object.topRatio)])
    }
    case 'cylinder':
    case 'cone': {
      const args = [...object.points.map(nameOf), field('height', object.height)]
      return object.topRatio === undefined ? call(object.type, args) : call('frustumCone', [...args, field('topRatio', object.topRatio)])
    }
    case 'regular':
      return call(object.solid, [nameOf(object.points[0]), nameOf(object.points[1])])
    case 'section':
      return call('section', object.targets.map(nameOf))
    case 'measure':
      return call(MEASURE_COMMANDS[object.measure]!, object.targets.map(nameOf))
    case 'parameter':
      return object.definition?.value ?? exactNumber(object.value)
  }
}

/** `A = (1, 2, 0)`, `a = 2`, `s: DoğruParçası(A, B)`, `M: OrtaNokta(A, B)`. */
export function editLine(object: GeometryObject, objects: readonly GeometryObject[]): string | null {
  const definition = definitionText(object, objects)
  if (definition === null) return null
  const valueLike = (isPoint(object) && object.constraint?.type !== 'construct') || object.type === 'parameter'
  return valueLike ? `${object.name} = ${definition}` : `${object.name}: ${definition}`
}
