import { measureOf, type ShapeMap } from '../document/dependencies'
import { defaultRange, parameterValues } from '../document/definitions'
import {
  POINTS_NEEDED, acceptsPoint, adoptCreatedPoints, buildConstruction, buildSphereWithRadius, clampSides, createContext,
  createPoint, type ConstructionKind,
} from '../document/constructions'
import { intersectionCount, type DerivedSource } from '../geometry/derived'
import { sectionOf } from '../geometry/section'
import {
  MIN_HEIGHT, isPoint, isUnfoldable, type ConstructConstraint, type SectionObject, type ConstructRule, type Construction, type DefinedField,
  type Definition, type GeometryObject, type LineObject, type MeasureObject, type ObjectId, type ParameterObject,
  type PlaneObject, type PointObject,
} from '../geometry/types'
import { evaluateNumber, isReservedName } from './expressions'
import { OBJECT_NAME } from './parser'
import type { Command, NumberArgument, PointArgument } from './types'

export interface PrepareContext {
  objects: readonly GeometryObject[]
  shapes: ShapeMap
  /** The next free ID; nothing is allocated in the document. */
  nextId: number
  color?: () => string
}

/** A change to an existing object (Açınım), applied by the caller. */
export interface ObjectUpdate {
  id: ObjectId
  apply(target: GeometryObject): void
}

export type PreparedCommand =
  | { ok: true; objects: GeometryObject[]; activeId: ObjectId; update?: ObjectUpdate }
  | { ok: false; error: string }

class CommandError extends Error {}

const isLine = (object: GeometryObject) => object.type === 'line' || object.type === 'segment' || object.type === 'ray'

/** A number argument's current value and, for an expression, the expression to keep. */
interface Evaluated {
  value: number
  expression?: string
}

/**
 * Build the objects of a command against a snapshot of the document without changing it:
 * a rejected command consumes no IDs, names or history. `name` is the name typed in front
 * of the command; it must not be in use.
 */
export function prepareCommand(name: string | null, command: Command, context: PrepareContext): PreparedCommand {
  try {
    return prepare(name, command, context)
  } catch (error) {
    if (error instanceof CommandError || error instanceof Error) return { ok: false, error: error.message }
    return { ok: false, error: 'Komut uygulanamadı.' }
  }
}

function prepare(name: string | null, command: Command, context: PrepareContext): PreparedCommand {
  const { objects } = context
  let nextId = context.nextId
  const construction = createContext(objects, () => nextId++, context.color)
  if (name !== null) {
    if (!OBJECT_NAME.test(name) || isReservedName(name)) throw new CommandError(`Ad olarak kullanılamaz: ${name}`)
    if (objects.some(object => object.name === name)) throw new CommandError(`Bu ad kullanılıyor: ${name}`)
    construction.reserve(name)
  }
  const parameters = parameterValues(objects)
  const created: GeometryObject[] = []
  const named = (object: GeometryObject) => {
    if (name !== null) object.name = name
    return object
  }
  const find = (reference: string) => objects.find(object => object.name === reference)

  function evaluate(argument: NumberArgument): Evaluated {
    if (typeof argument === 'number') return { value: argument }
    try {
      return { value: evaluateNumber(argument.expression, parameters), expression: argument.expression }
    } catch (error) {
      throw new CommandError(error instanceof Error ? error.message : 'Sayısal ifade hesaplanamadı.')
    }
  }

  function define(definition: Definition, field: DefinedField, evaluated: Evaluated): void {
    if (evaluated.expression !== undefined) definition[field] = evaluated.expression
  }

  function point(argument: PointArgument): PointObject {
    if (argument.kind === 'reference') {
      const object = find(argument.name)
      if (!object) throw new CommandError(`Bilinmeyen ad: ${argument.name}`)
      if (!isPoint(object)) throw new CommandError(`${argument.name} bir nokta değil.`)
      return object
    }
    const definition: Definition = {}
    const [x, y, z] = [evaluate(argument.x), evaluate(argument.y), evaluate(argument.z)]
    define(definition, 'x', x)
    define(definition, 'y', y)
    define(definition, 'z', z)
    const fresh = createPoint(construction, { x: x.value, y: y.value, z: z.value })
    if (Object.keys(definition).length) fresh.definition = definition
    created.push(fresh)
    return fresh
  }

  function construct(kind: ConstructionKind, args: PointArgument[], options: { sides?: number; height?: number; topRatio?: number } = {}): GeometryObject[] {
    const points = args.map(point)
    const positions: { x: number; y: number; z: number }[] = []
    for (const current of points) {
      if (!acceptsPoint(kind, positions, current.position)) {
        throw new CommandError(kind === 'plane' ? 'Düzlem için doğrusal olmayan üç nokta gerekir.' : 'Noktalar farklı olmalı.')
      }
      positions.push(current.position)
    }
    if (points.length !== POINTS_NEEDED[kind]) throw new CommandError('Nokta sayısı uygun değil.')
    const built = buildConstruction(construction, kind, points, options)
    adoptCreatedPoints(built, points.filter(candidate => created.includes(candidate)))
    named(mainOf(built))
    return built
  }

  /** The construction's own object: not a point and not one of its helpers. */
  function mainOf(built: readonly GeometryObject[]): GeometryObject {
    return built.find(object => object.type !== 'point' && object.ownerId === undefined)!
  }

  const result = (main: GeometryObject, extra: GeometryObject[] = []): PreparedCommand =>
    ({ ok: true, objects: [...created, ...(extra.includes(main) || created.includes(main) ? extra : [...extra, main])], activeId: main.id })

  function object(reference: string): GeometryObject {
    const found = find(reference)
    if (!found) throw new CommandError(`Bilinmeyen ad: ${reference}`)
    return found
  }

  function sourceOf(target: GeometryObject): DerivedSource {
    if (isPoint(target)) return { kind: 'point', position: target.position }
    const shape = context.shapes.get(target.id)
    if (!shape) throw new CommandError(`${target.name} şu an tanımsız.`)
    return shape
  }

  /** A visible constructed point (a midpoint, an intersection, a foot). */
  function derived(rule: ConstructRule, sources: ObjectId[], index?: number): PointObject {
    const constraint: ConstructConstraint = { type: 'construct', rule, sources }
    if (index !== undefined) constraint.index = index
    return createPoint(construction, { x: 0, y: 0, z: 0 }, constraint)
  }

  /** Objects of a constructed line or plane, in dependency order: hidden points first. */
  const constructed: GeometryObject[] = []

  function helper(ownerId: ObjectId, rule: ConstructRule, sources: ObjectId[], index?: number): ObjectId {
    const constraint: ConstructConstraint = { type: 'construct', rule, sources }
    if (index !== undefined) constraint.index = index
    const point: PointObject = {
      id: construction.allocateId(), type: 'point', name: construction.name('helper'), color: '#374151',
      position: { x: 0, y: 0, z: 0 }, constraint, ownerId,
    }
    constructed.push(point)
    return point.id
  }

  function constructedLine(kind: Construction['kind'], sources: ObjectId[], points: (owner: ObjectId) => ObjectId[]): LineObject {
    const id = construction.allocateId()
    const [a, b] = points(id) as [ObjectId, ObjectId]
    const line: LineObject = { id, type: 'line', name: construction.name('line'), color: construction.color(), points: [a, b], construction: { kind, sources } }
    named(line)
    constructed.push(line)
    return line
  }

  function constructedPlane(kind: Construction['kind'], sources: ObjectId[], points: (owner: ObjectId) => ObjectId[]): PlaneObject {
    const id = construction.allocateId()
    const [a, b, c] = points(id) as [ObjectId, ObjectId, ObjectId]
    const plane: PlaneObject = { id, type: 'plane', name: construction.name('plane'), color: construction.color(), points: [a, b, c], construction: { kind, sources } }
    named(plane)
    constructed.push(plane)
    return plane
  }

  switch (command.kind) {
    case 'point': {
      return result(named(point({ kind: 'coordinates', ...command.point })))
    }
    case 'line':
    case 'segment':
    case 'ray': {
      const built = construct(command.kind, [command.A, command.B])
      return result(mainOf(built), built)
    }
    case 'plane':
    case 'angle': {
      const built = construct(command.kind, [command.A, command.B, command.C])
      return result(mainOf(built), built)
    }
    case 'sphere': {
      // Küre(M, r) with a parameter r is a radius, not a second point.
      if (command.through.kind === 'reference' && find(command.through.name)?.type === 'parameter') {
        return prepare(name, { kind: 'sphereRadius', center: command.center, radius: { expression: command.through.name } }, context)
      }
      const built = construct('sphere', [command.center, command.through])
      return result(mainOf(built), built)
    }
    case 'sphereRadius': {
      const center = point(command.center)
      const radius = evaluate(command.radius)
      if (!(radius.value > 0)) throw new CommandError('Yarıçap pozitif olmalı.')
      const built = buildSphereWithRadius(construction, center, radius.value)
      const sphere = named(built[0]!)
      if (radius.expression !== undefined) sphere.definition = { radius: radius.expression }
      return result(sphere, built)
    }
    case 'prism':
    case 'pyramid':
    case 'cylinder':
    case 'cone': {
      const definition: Definition = {}
      const sides = 'sides' in command && command.sides !== undefined ? evaluate(command.sides) : undefined
      const height = command.height !== undefined ? evaluate(command.height) : undefined
      if (sides) {
        if (!Number.isFinite(sides.value) || sides.value < 3) throw new CommandError('Kenar sayısı en az 3 olmalı.')
        define(definition, 'sideCount', sides)
      }
      if (height) {
        if (!(height.value > 0)) throw new CommandError('Yükseklik pozitif olmalı.')
        define(definition, 'height', height)
      }
      const args = 'A' in command ? [command.A, command.B] : [command.center, command.rim]
      const built = construct(command.kind, args, {
        ...(sides ? { sides: clampSides(sides.value) } : {}),
        ...(height ? { height: Math.max(MIN_HEIGHT, height.value) } : {}),
      })
      const solid = mainOf(built)
      if (Object.keys(definition).length) solid.definition = definition
      return result(solid, built)
    }
    case 'frustum':
    case 'frustumCone': {
      const definition: Definition = {}
      const sides = command.kind === 'frustum' && command.sides !== undefined ? evaluate(command.sides) : undefined
      const height = command.height !== undefined ? evaluate(command.height) : undefined
      const ratio = command.ratio !== undefined ? evaluate(command.ratio) : undefined
      if (sides) {
        if (!Number.isFinite(sides.value) || sides.value < 3) throw new CommandError('Kenar sayısı en az 3 olmalı.')
        define(definition, 'sideCount', sides)
      }
      if (height) {
        if (!(height.value > 0)) throw new CommandError('Yükseklik pozitif olmalı.')
        define(definition, 'height', height)
      }
      if (ratio) {
        if (!(ratio.value > 0 && ratio.value < 1)) throw new CommandError('Üst oran 0 ile 1 arasında olmalı.')
        define(definition, 'topRatio', ratio)
      }
      const args = command.kind === 'frustum' ? [command.A, command.B] : [command.center, command.rim]
      const built = construct(command.kind, args, {
        ...(sides ? { sides: clampSides(sides.value) } : {}),
        ...(height ? { height: Math.max(MIN_HEIGHT, height.value) } : {}),
        ...(ratio ? { topRatio: ratio.value } : {}),
      })
      const solid = mainOf(built)
      if (Object.keys(definition).length) solid.definition = definition
      return result(solid, built)
    }
    case 'regular': {
      const built = construct(command.solid, [command.A, command.B])
      return result(mainOf(built), built)
    }
    case 'section': {
      const solid = object(command.solid)
      const plane = object(command.plane)
      if (!isUnfoldable(solid) && solid.type !== 'sphere') throw new CommandError(`${command.solid} bir cisim değil.`)
      if (plane.type !== 'plane') throw new CommandError(`${command.plane} bir düzlem değil.`)
      const [solidShape, planeShape] = [context.shapes.get(solid.id), context.shapes.get(plane.id)]
      if (!solidShape || planeShape?.kind !== 'plane' || (solidShape.kind !== 'polyhedron' && solidShape.kind !== 'round' && solidShape.kind !== 'sphere')
        || !sectionOf(solidShape, planeShape)) {
        throw new CommandError('Düzlem cismi kesmiyor.')
      }
      const section: SectionObject = {
        id: construction.allocateId(), type: 'section', name: name ?? construction.name('section'), color: '#e11d48',
        targets: [solid.id, plane.id],
      }
      return result(section, [section])
    }
    case 'unfold': {
      const solid = find(command.solid)
      if (!isUnfoldable(solid)) throw new CommandError(`${command.solid} açılabilen bir cisim değil.`)
      const angle = evaluate(command.angle)
      if (angle.value < 0) throw new CommandError('Açınım açısı negatif olamaz.')
      const net = command.net === undefined ? undefined : evaluate(command.net).value
      if (net !== undefined && !(solid.type === 'regular' && solid.solid === 'cube')) throw new CommandError('Açınım biçimi yalnız küpte seçilir.')
      if (net !== undefined && !(Number.isInteger(net) && net >= 1 && net <= 11)) throw new CommandError('Küpün açınım biçimi 1 ile 11 arasında olmalı.')
      return {
        ok: true, objects: [], activeId: solid.id,
        update: {
          id: solid.id,
          apply(target) {
            if (!isUnfoldable(target)) return
            if (net !== undefined && target.type === 'regular') target.net = net - 1
            target.unfold = angle.value
            if (angle.expression !== undefined) target.definition = { ...target.definition, unfold: angle.expression }
            else if (target.definition) {
              delete target.definition.unfold
              if (Object.keys(target.definition).length === 0) delete target.definition
            }
          },
        },
      }
    }
    case 'measure': {
      const targets = command.targets.map(reference => {
        const object = find(reference)
        if (!object) throw new CommandError(`Bilinmeyen ad: ${reference}`)
        return object.id
      })
      const object: MeasureObject = {
        id: construction.allocateId(), type: 'measure', name: name ?? construction.name(command.measure),
        color: '#1f2937', measure: command.measure, targets,
      }
      const outcome = measureOf(object, objects, context.shapes)
      if (!outcome.ok) throw new CommandError(outcome.error)
      return result(object, [object])
    }
    case 'midpoint': {
      if (!command.B) {
        const segment = command.A.kind === 'reference' ? find(command.A.name) : undefined
        if (segment?.type !== 'segment') throw new CommandError('OrtaNokta iki nokta veya bir doğru parçası ister.')
        return result(named(derived('midpoint', [segment.id])))
      }
      const [a, b] = [point(command.A), point(command.B)]
      return result(named(derived('midpoint', [a.id, b.id])))
    }
    case 'intersect': {
      const [first, second] = [object(command.first), object(command.second)]
      const [a, b] = [sourceOf(first), sourceOf(second)]
      if (a.kind === 'plane' && b.kind === 'plane') {
        const line = constructedLine('intersection', [first.id, second.id], (owner) => [
          helper(owner, 'planeMeet', [first.id, second.id], 0), helper(owner, 'planeMeet', [first.id, second.id], 1),
        ])
        return result(line, constructed)
      }
      const count = intersectionCount(a, b)
      if (count === 0) throw new CommandError('Bu nesnelerin kesişimi desteklenmiyor: doğru, düzlem ve küre seçin.')
      const points = Array.from({ length: count }, (_, index) => derived('intersect', [first.id, second.id], index))
      named(points[0]!)
      return { ok: true, objects: [...created, ...points], activeId: points[0]!.id }
    }
    case 'project': {
      const target = object(command.target)
      if (target.type !== 'plane' && !isLine(target)) throw new CommandError('İzdüşüm bir düzlem veya doğru ister.')
      const from = point(command.point)
      return result(named(derived('project', [from.id, target.id])))
    }
    case 'perpendicularLine':
    case 'parallelLine':
    case 'perpendicularPlane':
    case 'parallelPlane': {
      const target = object(command.target)
      const wanted = command.kind === 'perpendicularLine' ? 'Düzlem veya doğru' : command.kind === 'parallelPlane' ? 'Düzlem' : 'Doğru'
      const ok = command.kind === 'perpendicularLine' ? target.type === 'plane' || isLine(target)
        : command.kind === 'parallelPlane' ? target.type === 'plane' : isLine(target)
      if (!ok) throw new CommandError(`${wanted} seçin: ${command.target}`)
      const from = point(command.point)
      const sources = [from.id, target.id]
      const kind = command.kind.startsWith('perpendicular') ? 'perpendicular' : 'parallel'
      if (command.kind === 'perpendicularLine' || command.kind === 'parallelLine') {
        // Perpendicular to a line: through the foot of the perpendicular; otherwise one step along.
        const rule = command.kind === 'perpendicularLine' && isLine(target) ? 'project' : 'along'
        return result(constructedLine(kind, sources, owner => [from.id, helper(owner, rule, sources)]), constructed)
      }
      return result(constructedPlane(kind, sources, owner => [from.id, helper(owner, 'basis', sources, 0), helper(owner, 'basis', sources, 1)]), constructed)
    }
    case 'parameter': {
      if (!OBJECT_NAME.test(command.name) || isReservedName(command.name)) throw new CommandError(`Ad olarak kullanılamaz: ${command.name}`)
      const value = evaluate(command.value)
      const range = defaultRange(value.value)
      const parameter: ParameterObject = {
        id: construction.allocateId(), type: 'parameter', name: command.name, color: '#1f2937', value: value.value,
        min: Math.min(range.min, value.value), max: Math.max(range.max, value.value), step: range.step,
      }
      if (value.expression !== undefined) parameter.definition = { value: value.expression }
      return result(parameter, [parameter])
    }
  }
}
