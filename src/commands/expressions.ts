import type { MathNode } from 'mathjs'
import { math } from '../math'

/**
 * Numbers in commands: constants and expressions over parameters (`2*a+1`, `sqrt(r)`).
 * The syntax tree is checked before anything is evaluated: only scalar arithmetic, the
 * listed functions, the constants e and pi and parameter names are allowed.
 */

const maxLength = 2_000
const maxNodes = 1_024
const maxDepth = 64
const constants = new Set(['e', 'pi'])
const arithmetic = new Set(['add', 'subtract', 'multiply', 'divide', 'pow', 'mod'])
const unaryNumeric = new Set(['unaryPlus', 'unaryMinus'])

// Scalar functions with their argument counts; combinatorics and exact-number constructors
// are left out because their work is not bounded by the size of the expression.
const functions: Readonly<Record<string, readonly [number, number]>> = {
  abs: [1, 1], acos: [1, 1], asin: [1, 1], atan: [1, 1], atan2: [2, 2], cbrt: [1, 1], ceil: [1, 1],
  cos: [1, 1], cosh: [1, 1], cot: [1, 1], exp: [1, 1], floor: [1, 1], log: [1, 2], log10: [1, 1],
  log2: [1, 1], max: [1, maxNodes], min: [1, maxNodes], nthRoot: [1, 2], round: [1, 2], sign: [1, 1],
  sin: [1, 1], sinh: [1, 1], sqrt: [1, 1], tan: [1, 1], tanh: [1, 1], hypot: [1, maxNodes], mod: [2, 2],
}

const reservedNames = new Set(['x', 'y', 'z', 'e', 'i', 'pi', 'E', 'PI', 'tau', 'true', 'false', 'ln'])

/** Names that expressions already give a meaning to and objects cannot take. */
export function isReservedName(name: string): boolean {
  return reservedNames.has(name) || Object.hasOwn(functions, name)
}

interface Checked {
  node: MathNode
  /** Parameter names the expression uses. */
  names: Set<string>
}

const cache = new Map<string, Checked>()

function check(source: string): Checked {
  const text = source.trim()
  const cached = cache.get(text)
  if (cached) return cached
  if (!text) throw new SyntaxError('Sayısal ifade boş olamaz.')
  if (text.length > maxLength) throw new RangeError('Sayısal ifade çok uzun.')
  let node: MathNode
  try {
    node = math.parse(text)
  } catch (error) {
    throw new SyntaxError('Sayısal ifade okunamadı.', { cause: error })
  }
  const names = new Set<string>()
  let visits = 0
  const visit = (current: MathNode, depth: number): MathNode => {
    if (++visits > maxNodes || depth > maxDepth) throw new RangeError('Sayısal ifade çok karmaşık.')
    if (math.isConstantNode(current)) {
      if (typeof current.value !== 'number' || !Number.isFinite(current.value)) throw new TypeError('Yalnız sayısal sabitler kullanılabilir.')
      return current
    }
    if (math.isSymbolNode(current)) {
      if (constants.has(current.name)) return current
      if (current.name === 'E' || current.name === 'PI') return new math.SymbolNode(current.name === 'E' ? 'e' : 'pi')
      if (/^[xyz]$/.test(current.name)) throw new ReferenceError(`Sayısal değer ${current.name} değişkenini içeremez.`)
      names.add(current.name)
      return current
    }
    if (math.isParenthesisNode(current)) return new math.ParenthesisNode(visit(current.content, depth + 1))
    if (math.isOperatorNode(current)) {
      const ok = (arithmetic.has(current.fn) && current.args.length === 2) || (unaryNumeric.has(current.fn) && current.args.length === 1)
      if (!ok) throw new TypeError(`Desteklenmeyen işlem: ${current.op}`)
      return new math.OperatorNode(current.op, current.fn, current.args.map(child => visit(child, depth + 1)), current.implicit)
    }
    if (math.isFunctionNode(current)) {
      if (!math.isSymbolNode(current.fn)) throw new TypeError('Fonksiyon adı bir simge olmalıdır.')
      const name = current.fn.name === 'ln' ? 'log' : current.fn.name
      const arity = Object.hasOwn(functions, name) ? functions[name] : undefined
      if (!arity || current.args.length < arity[0] || current.args.length > arity[1] || (current.fn.name === 'ln' && current.args.length !== 1)) {
        throw new TypeError(`Bilinmeyen fonksiyon veya geçersiz bağımsız değişken sayısı: ${current.fn.name}`)
      }
      return new math.FunctionNode(new math.SymbolNode(name), current.args.map(child => visit(child, depth + 1)))
    }
    throw new TypeError(`Bu matematik yapısı kullanılamaz: ${current.type}`)
  }
  const checked = { node: visit(node, 0), names }
  if (cache.size > 500) cache.clear()
  cache.set(text, checked)
  return checked
}

/** Parameter names an expression uses; empty for invalid text. */
export function expressionNames(source: string): Set<string> {
  try {
    return check(source).names
  } catch {
    return new Set()
  }
}

/**
 * Evaluate with the given parameter values. Unknown names throw a ReferenceError, so a
 * caller can tell "uses a name" from "is not a number".
 */
export function evaluateNumber(source: string, parameters: ReadonlyMap<string, number> = new Map()): number {
  const { node, names } = check(source)
  for (const name of names) if (!parameters.has(name)) throw new ReferenceError(`Bilinmeyen ad: ${name}`)
  let value: unknown
  try {
    value = node.evaluate(Object.fromEntries([...names].map(name => [name, parameters.get(name)!])))
  } catch (error) {
    throw new RangeError('Sayısal ifade hesaplanamadı.', { cause: error })
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    if (math.isComplex(value) && value.im === 0 && Number.isFinite(value.re)) return value.re
    throw new RangeError('İfade sonlu bir gerçek sayı üretmelidir.')
  }
  return value
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The expression with every use of the name `from` replaced by `to`. */
export function renameInExpression(source: string, from: string, to: string): string {
  return source.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(from)}(?![\\p{L}\\p{N}_])`, 'gu'), to)
}
