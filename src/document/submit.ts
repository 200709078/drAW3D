import { parseCommand } from '../commands/parser'
import { prepareCommand } from '../commands/prepare'
import type { ObjectId } from '../geometry/types'
import { resolveAll } from './editing'
import type { GeometryDocument } from './geometry-document'
import { redefineObject } from './redefine'

export type SubmitResult = { ok: true; activeId: ObjectId } | { ok: false; error: string }

/**
 * Apply a line typed in the command input as one history step. A name in use redefines
 * that object (`A=(1,2,3)` moves A, `a=3` sets a); nothing changes when an error is returned.
 */
export function submitCommand(document: GeometryDocument, source: string): SubmitResult {
  const parsed = parseCommand(source)
  if (!parsed.ok) return parsed
  const shapes = resolveAll(document)
  const existing = parsed.name === null ? undefined : document.objects.find(object => object.name === parsed.name)
  let activeId: ObjectId
  if (existing) {
    const result = redefineObject(document, shapes, existing, source)
    if (!result.ok) return result
    activeId = existing.id
  } else {
    const prepared = prepareCommand(parsed.name, parsed.command, { objects: document.objects, shapes, nextId: document.nextId })
    if (!prepared.ok) return prepared
    if (prepared.update) {
      const target = document.get(prepared.update.id)
      if (target) prepared.update.apply(target)
    }
    document.append(...prepared.objects)
    activeId = prepared.activeId
  }
  resolveAll(document)
  document.commit()
  document.activeId = activeId
  return { ok: true, activeId }
}
