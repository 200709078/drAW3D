import type { MeasureKind, RegularKind } from '../geometry/types'

/**
 * A number as typed: a constant evaluated by the parser, or an expression naming
 * parameters, which only the document can evaluate.
 */
export type NumberArgument = number | { expression: string }

export type PointArgument =
  | { kind: 'coordinates'; x: NumberArgument; y: NumberArgument; z: NumberArgument }
  | { kind: 'reference'; name: string }

export type Command =
  | { kind: 'point'; point: { x: NumberArgument; y: NumberArgument; z: NumberArgument } }
  | { kind: 'line' | 'segment' | 'ray'; A: PointArgument; B: PointArgument }
  | { kind: 'plane' | 'angle'; A: PointArgument; B: PointArgument; C: PointArgument }
  /** Küre(M, N) through a point, or Küre(M, r) with a radius; a bare name is decided by the document. */
  | { kind: 'sphere'; center: PointArgument; through: PointArgument }
  | { kind: 'sphereRadius'; center: PointArgument; radius: NumberArgument }
  | { kind: 'prism' | 'pyramid'; A: PointArgument; B: PointArgument; sides?: NumberArgument; height?: NumberArgument }
  | { kind: 'cylinder' | 'cone'; center: PointArgument; rim: PointArgument; height?: NumberArgument }
  /** KesikPiramit / KesikKoni: `ratio` is the top's size over the base's (0–1). */
  | { kind: 'frustum'; A: PointArgument; B: PointArgument; sides?: NumberArgument; height?: NumberArgument; ratio?: NumberArgument }
  | { kind: 'frustumCone'; center: PointArgument; rim: PointArgument; height?: NumberArgument; ratio?: NumberArgument }
  | { kind: 'regular'; solid: RegularKind; A: PointArgument; B: PointArgument }
  /** Kesit(cisim, düzlem). */
  | { kind: 'section'; solid: string; plane: string }
  /** Açınım(cisim, açı[, biçim]): opens an existing solid; a cube also takes one of its 11 nets (1–11). */
  | { kind: 'unfold'; solid: string; angle: NumberArgument; net?: NumberArgument }
  | { kind: 'measure'; measure: MeasureKind; targets: string[] }
  /** OrtaNokta(A, B) of two points, or OrtaNokta(s) of a segment (`B` absent, `A` a reference). */
  | { kind: 'midpoint'; A: PointArgument; B?: PointArgument }
  /** Kesiştir(a, b): points, or the line where two planes meet. */
  | { kind: 'intersect'; first: string; second: string }
  /** A point and a line or plane: the foot of the perpendicular, or a line/plane through the point. */
  | { kind: 'project' | 'perpendicularLine' | 'parallelLine' | 'perpendicularPlane' | 'parallelPlane'; point: PointArgument; target: string }
  /** `a=2` defines a slider; `b=a+1` a number that depends on other parameters. */
  | { kind: 'parameter'; name: string; value: NumberArgument }

export type ParseCommandResult =
  | { ok: true; name: string | null; command: Command }
  | { ok: false; error: string }
