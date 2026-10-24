import { isPoint, references, type GeometryObject, type ObjectId } from '../geometry/types'
import type { Vec3 } from '../geometry/vec3'

/** drAW3D documents; the family uses .drw (drAW), .drw2 (drAW2D) and .drw3 (drAW3D). */
export const FILE_EXTENSION = '.drw3'
export const FILE_FORMAT = 1
export const DEFAULT_FILE_NAME = `adsız${FILE_EXTENSION}`

/** Where the camera looks from; restored when the file opens. */
export interface CameraPose {
  position: Vec3
  target: Vec3
  /** Orthographic zoom (1 in perspective). */
  zoom: number
}

export interface DocumentFile {
  objects: GeometryObject[]
  camera?: CameraPose
}

export type ParseResult = ({ ok: true } & DocumentFile) | { ok: false; error: string }

const OBJECT_TYPES: ReadonlySet<string> = new Set([
  'point', 'line', 'segment', 'ray', 'plane', 'angle', 'sphere', 'prism', 'pyramid', 'cylinder', 'cone',
  'parameter', 'measure', 'regular', 'section',
])

export function serializeDocument(file: DocumentFile): string {
  return JSON.stringify({ app: 'drAW3D', format: FILE_FORMAT, objects: file.objects, ...(file.camera ? { camera: file.camera } : {}) })
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isVec = (value: unknown): value is Vec3 =>
  isRecord(value) && [value.x, value.y, value.z].every(coordinate => typeof coordinate === 'number' && Number.isFinite(coordinate))

function cameraOf(value: unknown): CameraPose | undefined {
  if (!isRecord(value) || !isVec(value.position) || !isVec(value.target)) return undefined
  const zoom = typeof value.zoom === 'number' && Number.isFinite(value.zoom) && value.zoom > 0 ? value.zoom : 1
  return { position: value.position, target: value.target, zoom }
}

/**
 * Read a .drw3 file. The structure is checked here (known types, unique IDs, references to
 * objects in the file, finite coordinates); the geometry itself is checked when it resolves.
 */
export function parseDocument(text: string): ParseResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Dosya okunamadı: geçerli bir drAW3D belgesi değil.' }
  }
  if (!isRecord(data) || data.app !== 'drAW3D' || !Array.isArray(data.objects)) {
    return { ok: false, error: 'Bu dosya bir drAW3D belgesi değil.' }
  }
  if (typeof data.format !== 'number' || data.format > FILE_FORMAT) {
    return { ok: false, error: 'Bu belge drAW3D’nin daha yeni bir sürümüyle kaydedilmiş.' }
  }
  const ids = new Set<ObjectId>()
  for (const object of data.objects as unknown[]) {
    if (!isRecord(object) || !OBJECT_TYPES.has(object.type as string) || typeof object.name !== 'string'
      || typeof object.color !== 'string' || !Number.isSafeInteger(object.id) || (object.id as number) < 0
      || ids.has(object.id as number)) {
      return { ok: false, error: 'Belgede tanınmayan ya da bozuk bir nesne var.' }
    }
    ids.add(object.id as number)
  }
  const objects = data.objects as GeometryObject[]
  for (const object of objects) {
    if (isPoint(object) && !isVec(object.position)) return { ok: false, error: `${object.name} noktasının koordinatları bozuk.` }
    const list = isPoint(object) || object.type === 'parameter' ? []
      : object.type === 'measure' || object.type === 'section' ? object.targets : object.points
    const constraint = isPoint(object) ? object.constraint as unknown : undefined
    if (!Array.isArray(list) || (constraint !== undefined && (!isRecord(constraint)
      || (constraint.type === 'construct' && !Array.isArray(constraint.sources))))) {
      return { ok: false, error: `${object.name} nesnesi bozuk.` }
    }
    const linked = references(object)
    if (object.ownerId !== undefined) linked.push(object.ownerId)
    if (linked.some(id => !ids.has(id))) return { ok: false, error: `${object.name} nesnesinin dayandığı bir nesne belgede yok.` }
  }
  return { ok: true, objects, camera: cameraOf(data.camera) }
}

/** The file name without its folder, for the title and messages. */
export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() || DEFAULT_FILE_NAME
}
