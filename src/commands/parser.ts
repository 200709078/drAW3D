import { evaluateNumber, isReservedName } from './expressions'
import { commandKind, type CommandName } from './language'
import type { Command, NumberArgument, ParseCommandResult, PointArgument } from './types'

const openings = new Map([['(', ')'], ['[', ']'], ['{', '}']])
const closings = new Set(openings.values())

/** Object names: letters, digits and underscores, starting with a letter. */
export const OBJECT_NAME = /^[\p{L}_][\p{L}\p{N}_]*$/u
/** `A = ...`, `s: ...` — a name in front of a definition. */
const LEADING_NAME = /^\s*([\p{L}_][\p{L}\p{N}_]*)\s*[:=]\s*([\s\S]+)$/u

/** Split only outside balanced brackets; empty and trailing arguments are errors. */
export function splitTopLevel(source: string, separator = ','): string[] {
  if (!source.trim()) return []
  const stack: string[] = []
  const parts: string[] = []
  let start = 0
  for (let index = 0; index < source.length; index++) {
    const char = source[index]!
    const closing = openings.get(char)
    if (closing) stack.push(closing)
    else if (closings.has(char)) {
      if (stack.pop() !== char) throw new Error('Parantezler dengeli olmalı.')
    } else if (char === separator && stack.length === 0) {
      const part = source.slice(start, index).trim()
      if (!part) throw new Error('Boş komut parametresi kullanılamaz.')
      parts.push(part)
      start = index + 1
    }
  }
  if (stack.length) throw new Error('Parantezler dengeli olmalı.')
  const last = source.slice(start).trim()
  if (!last) throw new Error('Boş komut parametresi kullanılamaz.')
  parts.push(last)
  return parts
}

function enclosed(source: string): boolean {
  if (!source.startsWith('(') || !source.endsWith(')')) return false
  let depth = 0
  for (let index = 0; index < source.length; index++) {
    if (source[index] === '(') depth++
    else if (source[index] === ')' && --depth === 0) return index === source.length - 1
  }
  return false
}

function reference(source: string): string {
  if (!OBJECT_NAME.test(source)) throw new Error(`Geçerli bir nesne adı kullanın: ${source}`)
  return source
}

/**
 * Constants are evaluated here. An expression with unknown names may use parameters;
 * the document resolves it when the command is prepared.
 */
export function numberArgument(source: string): NumberArgument {
  try {
    return evaluateNumber(source)
  } catch (error) {
    if (!(error instanceof ReferenceError) || /değişkenini/.test(error.message)) throw error
    return { expression: source.trim() }
  }
}

function coordinates(source: string): PointArgument | null {
  if (!enclosed(source)) return null
  const parts = splitTopLevel(source.slice(1, -1))
  if (parts.length !== 3) throw new Error('Nokta üç koordinatla yazılır: (x, y, z).')
  return { kind: 'coordinates', x: numberArgument(parts[0]!), y: numberArgument(parts[1]!), z: numberArgument(parts[2]!) }
}

function pointArgument(source: string): PointArgument {
  return coordinates(source) ?? { kind: 'reference', name: reference(source) }
}

function optionalNumber(args: string[], index: number): NumberArgument | undefined {
  return args[index] === undefined ? undefined : numberArgument(args[index]!)
}

function count(args: string[], min: number, max = min): void {
  if (args.length < min || args.length > max) {
    throw new Error(min === max ? `Bu komut ${min} parametre gerektirir.` : `Bu komut ${min}–${max} parametre alır.`)
  }
}

function named(kind: CommandName, args: string[]): Command {
  switch (kind) {
    case 'line':
    case 'segment':
    case 'ray':
      count(args, 2)
      return { kind, A: pointArgument(args[0]!), B: pointArgument(args[1]!) }
    case 'plane':
      count(args, 3)
      return { kind, A: pointArgument(args[0]!), B: pointArgument(args[1]!), C: pointArgument(args[2]!) }
    case 'angle':
      count(args, 2, 3)
      // Two arguments: the angle between two lines or planes.
      if (args.length === 2) return { kind: 'measure', measure: 'angle', targets: args.map(reference) }
      return { kind, A: pointArgument(args[0]!), B: pointArgument(args[1]!), C: pointArgument(args[2]!) }
    case 'sphere': {
      count(args, 2)
      const center = pointArgument(args[0]!)
      const second = args[1]!
      // A bare name may be a point or a parameter radius: the document decides.
      if (enclosed(second) || OBJECT_NAME.test(second)) return { kind, center, through: pointArgument(second) }
      const radius = numberArgument(second)
      if (typeof radius === 'number' && radius <= 0) throw new Error('Yarıçap pozitif olmalı.')
      return { kind: 'sphereRadius', center, radius }
    }
    case 'prism':
    case 'pyramid':
      count(args, 2, 4)
      return {
        kind, A: pointArgument(args[0]!), B: pointArgument(args[1]!),
        ...(args[2] === undefined ? {} : { sides: numberArgument(args[2]) }),
        ...(args[3] === undefined ? {} : { height: numberArgument(args[3]) }),
      }
    case 'cylinder':
    case 'cone': {
      count(args, 2, 3)
      const height = optionalNumber(args, 2)
      return { kind, center: pointArgument(args[0]!), rim: pointArgument(args[1]!), ...(height === undefined ? {} : { height }) }
    }
    case 'unfold':
      count(args, 2, 3)
      return {
        kind, solid: reference(args[0]!), angle: numberArgument(args[1]!),
        ...(args[2] === undefined ? {} : { net: numberArgument(args[2]) }),
      }
    case 'frustum':
      count(args, 2, 5)
      return {
        kind, A: pointArgument(args[0]!), B: pointArgument(args[1]!),
        ...(args[2] === undefined ? {} : { sides: numberArgument(args[2]) }),
        ...(args[3] === undefined ? {} : { height: numberArgument(args[3]) }),
        ...(args[4] === undefined ? {} : { ratio: numberArgument(args[4]) }),
      }
    case 'frustumCone':
      count(args, 2, 4)
      return {
        kind, center: pointArgument(args[0]!), rim: pointArgument(args[1]!),
        ...(args[2] === undefined ? {} : { height: numberArgument(args[2]) }),
        ...(args[3] === undefined ? {} : { ratio: numberArgument(args[3]) }),
      }
    case 'tetrahedron':
    case 'cube':
    case 'octahedron':
    case 'dodecahedron':
    case 'icosahedron':
      count(args, 2)
      return { kind: 'regular', solid: kind, A: pointArgument(args[0]!), B: pointArgument(args[1]!) }
    case 'section':
      count(args, 2)
      return { kind, solid: reference(args[0]!), plane: reference(args[1]!) }
    case 'length':
    case 'baseArea':
    case 'surfaceArea':
    case 'volume':
      count(args, 1)
      return { kind: 'measure', measure: kind, targets: [reference(args[0]!)] }
    case 'distance':
      count(args, 2)
      return { kind: 'measure', measure: kind, targets: args.map(reference) }
    case 'midpoint':
      count(args, 1, 2)
      if (args.length === 1) return { kind, A: { kind: 'reference', name: reference(args[0]!) } }
      return { kind, A: pointArgument(args[0]!), B: pointArgument(args[1]!) }
    case 'intersect':
      count(args, 2)
      return { kind, first: reference(args[0]!), second: reference(args[1]!) }
    case 'project':
    case 'perpendicularLine':
    case 'parallelLine':
    case 'perpendicularPlane':
    case 'parallelPlane':
      count(args, 2)
      return { kind, point: pointArgument(args[0]!), target: reference(args[1]!) }
  }
}

function parseDefinition(source: string): Command {
  if (!source) throw new Error('Bir komut veya nokta girin.')
  // Validate the brackets of the whole input before reading any part of it.
  splitTopLevel(source)
  const call = source.match(/^([\p{L}_][\p{L}\p{N}_]*)\s*\(/u)
  if (call) {
    const kind = commandKind(call[1]!)
    if (!kind) throw new Error(`Bilinmeyen komut: ${call[1]}`)
    const opening = source.indexOf('(')
    let depth = 0
    let end = -1
    for (let index = opening; index < source.length; index++) {
      if (source[index] === '(') depth++
      else if (source[index] === ')' && --depth === 0) { end = index; break }
    }
    if (end !== source.length - 1) throw new Error('Komuttan sonra fazladan ifade bulunuyor.')
    return named(kind, splitTopLevel(source.slice(opening + 1, -1)))
  }
  if (commandKind(source)) throw new Error('Komut parametrelerini parantez içinde yazın.')
  const point = coordinates(source)
  if (point?.kind === 'coordinates') return { kind: 'point', point: { x: point.x, y: point.y, z: point.z } }
  throw new Error('Bir komut, nokta (x, y, z) veya ad = değer girin.')
}

function parse(source: string): { name: string | null; command: Command } {
  const text = source.trim()
  const assignment = text.match(LEADING_NAME)
  if (!assignment) return { name: null, command: parseDefinition(text) }
  const name = assignment[1]!
  const body = assignment[2]!.trim()
  if (isReservedName(name)) throw new Error(`Ad olarak kullanılamaz: ${name}`)
  // `ad = sayı veya ifade` is a parameter; anything else is a named object.
  if (!/^[\p{L}_][\p{L}\p{N}_]*\s*\(/u.test(body) && !body.startsWith('(')) {
    return { name, command: { kind: 'parameter', name, value: numberArgument(body) } }
  }
  if (body.startsWith('(') && !enclosed(body)) return { name, command: { kind: 'parameter', name, value: numberArgument(body) } }
  if (enclosed(body) && splitTopLevel(body.slice(1, -1)).length === 1) {
    return { name, command: { kind: 'parameter', name, value: numberArgument(body) } }
  }
  if (/^[\p{L}_][\p{L}\p{N}_]*\s*\(/u.test(body) && !commandKind(body.match(/^[\p{L}_][\p{L}\p{N}_]*/u)![0])) {
    // A function call such as sqrt(2) is a number.
    return { name, command: { kind: 'parameter', name, value: numberArgument(body) } }
  }
  return { name, command: parseDefinition(body) }
}

/** No document access: successful results are plain data. */
export function parseCommand(input: string): ParseCommandResult {
  try {
    const { name, command } = parse(input)
    return { ok: true, name, command }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Komut çözümlenemedi.' }
  }
}
