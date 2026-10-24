import type { GeometryObject, ObjectId, ObjectReference } from '../geometry/types'
import { equalModelGraphs } from './graph-equality'

export interface DocumentOptions {
  /** Maximum number of undoable edits; the oldest retained state becomes the base. */
  historyLimit?: number
}

/** Mutable working models with private, bounded snapshots. No DOM, scene or camera state.
 * Model fields are edited in place; structural changes and history navigation go through
 * this owner. IDs never repeat during a session.
 */
export class GeometryDocument {
  readonly historyLimit: number
  private working: GeometryObject[] = []
  private snapshots: GeometryObject[][] = [[]]
  private cursor = 0
  private allocatedThrough = 0
  private selected: ObjectReference = null
  private drafts = new Set<ObjectId>()
  private editing = false

  constructor(options: DocumentOptions = {}) {
    this.historyLimit = options.historyLimit ?? 100
    if (!Number.isSafeInteger(this.historyLimit) || this.historyLimit < 1) {
      throw new RangeError('Geçmiş sınırı pozitif bir tam sayı olmalı.')
    }
  }

  get objects(): readonly GeometryObject[] { return this.working }
  get nextId(): number { return this.allocatedThrough }
  get canUndo(): boolean { return this.cursor > 0 }
  get canRedo(): boolean { return this.cursor + 1 < this.snapshots.length }
  get undoDepth(): number { return this.cursor }
  get redoDepth(): number { return this.snapshots.length - this.cursor - 1 }
  get hasDraft(): boolean { return this.drafts.size > 0 }
  get isEditing(): boolean { return this.editing }
  get activeId(): ObjectReference { return this.selected }
  set activeId(id: ObjectReference) {
    this.selected = id !== null && this.working.some(object => object.id === id) ? id : null
  }

  get(id: ObjectReference): GeometryObject | undefined {
    return id === null ? undefined : this.working.find(object => object.id === id)
  }

  allocateId(): ObjectId {
    if (!Number.isSafeInteger(this.allocatedThrough + 1)) throw new RangeError('Nesne kimliği sınırına ulaşıldı.')
    return this.allocatedThrough++
  }

  /** Validate the whole batch before changing document membership or the allocator. */
  append(...objects: GeometryObject[]): void {
    const occupied = new Set(this.working.map(object => object.id))
    let nextId = this.allocatedThrough
    for (const object of objects) {
      const id = object.id
      if (!Number.isSafeInteger(id) || id < 0 || !Number.isSafeInteger(id + 1) || occupied.has(id)) {
        throw new Error('Kalıcı nesnenin kimliği geçersiz veya yinelenmiş.')
      }
      occupied.add(id)
      nextId = Math.max(nextId, id + 1)
    }
    this.working.push(...objects)
    this.allocatedThrough = nextId
  }

  remove(id: ObjectId): boolean {
    const index = this.working.findIndex(object => object.id === id)
    if (index < 0) return false
    this.working.splice(index, 1)
    this.drafts.delete(id)
    if (this.selected === id) this.selected = null
    return true
  }

  clear(): boolean {
    const changed = this.working.length > 0
    this.working = []
    this.selected = null
    this.drafts.clear()
    this.editing = false
    return changed
  }

  trackDraft(id: ObjectId): void {
    if (!this.working.some(object => object.id === id)) throw new Error('Geçici çizim nesnesi belgede bulunamadı.')
    this.drafts.add(id)
  }

  isDraft(id: ObjectId): boolean { return this.drafts.has(id) }

  cancelDraft(): boolean {
    if (!this.drafts.size) return false
    this.working = this.working.filter(object => !this.drafts.has(object.id))
    if (this.selected !== null && this.drafts.has(this.selected)) this.selected = null
    this.drafts.clear()
    return true
  }

  /** Only a completed construction promotes its staged points to permanent state. */
  finishDraft(): void { this.drafts.clear() }

  beginEdit(): void { this.editing = true }
  commitEdit(): boolean {
    if (!this.editing) return false
    return this.commit()
  }
  cancelEdit(): boolean {
    if (!this.editing) return false
    this.restore()
    return true
  }

  commit(): boolean {
    if (this.hasDraft) throw new Error('Yarım çizim tamamlanmadan geçmişe kaydedilemez.')
    // Compare the graph once. No serialization, no clone and no redo truncation on no-op.
    if (equalModelGraphs(this.working, this.snapshots[this.cursor])) {
      this.editing = false
      return false
    }
    const snapshot = structuredClone(this.working)
    this.snapshots.splice(this.cursor + 1)
    this.snapshots.push(snapshot)
    const excess = this.snapshots.length - this.historyLimit - 1
    if (excess > 0) this.snapshots.splice(0, excess)
    this.cursor = this.snapshots.length - 1
    this.editing = false
    return true
  }

  undo(): boolean {
    const navigated = this.canUndo
    if (navigated) this.cursor--
    this.restore()
    return navigated
  }

  redo(): boolean {
    const navigated = this.canRedo
    if (navigated) this.cursor++
    this.restore()
    return navigated
  }

  private restore(): void {
    this.working = structuredClone(this.snapshots[this.cursor]!)
    this.selected = null
    this.drafts.clear()
    this.editing = false
  }
}
