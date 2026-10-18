import * as THREE from "three"
import { updateConstraintFromPointPosition } from "../interaction/LineSegmentConstraint"

export type HistoryAction = {
  name: string
  undo: () => void
  redo: () => void
}

type ObjectState = {
  object: THREE.Object3D
  parent: THREE.Object3D
  selectable: boolean
}

type DependencyState = {
  object: THREE.Object3D
  dependents: unknown[]
}

export class HistoryManager {
  private undoStack: HistoryAction[] = []
  private redoStack: HistoryAction[] = []
  private listeners: Array<() => void> = []
  private scene: THREE.Scene
  private selectableObjects: THREE.Object3D[]

  constructor(
    scene: THREE.Scene,
    selectableObjects: THREE.Object3D[]
  ) {
    this.scene = scene
    this.selectableObjects = selectableObjects
  }

  get canUndo() {
    return this.undoStack.length > 0
  }

  get canRedo() {
    return this.redoStack.length > 0
  }

  onChange(listener: () => void) {
    this.listeners.push(listener)
    listener()
  }

  execute(action: HistoryAction) {
    this.undoStack.push(action)
    this.redoStack = []
    this.notify()
  }

  undo() {
    const action = this.undoStack.pop()
    if (!action) return

    action.undo()
    this.redoStack.push(action)
    this.notify()
  }

  redo() {
    const action = this.redoStack.pop()
    if (!action) return

    action.redo()
    this.undoStack.push(action)
    this.notify()
  }

  createObjectAction(name: string, objects: THREE.Object3D[], owners: unknown[] = []) {
    const uniqueObjects = this.uniqueObjects(objects)
    const objectStates = this.createObjectStates(uniqueObjects)
    const dependencies = this.createDependencyStates(owners)

    return {
      name,
      undo: () => {
        this.removeObjects(objectStates)
        this.removeDependencies(dependencies, owners)
      },
      redo: () => {
        this.restoreObjects(objectStates)
        this.restoreDependencies(dependencies)
      },
    }
  }

  createMoveAction(
    name: string,
    positions: Array<{
      object: THREE.Object3D
      before: THREE.Vector3
      after: THREE.Vector3
    }>
  ) {
    return {
      name,
      undo: () => this.applyPositions(positions, "before"),
      redo: () => this.applyPositions(positions, "after"),
    }
  }

  createDeleteAction(name: string, objects: THREE.Object3D[], owners: unknown[] = []) {
    const uniqueObjects = this.uniqueObjects(objects)
    const objectStates = this.createObjectStates(uniqueObjects)
    const dependencies = this.createDependencyStates(owners)

    return {
      name,
      undo: () => {
        this.restoreObjects(objectStates)
        this.restoreDependencies(dependencies)
      },
      redo: () => {
        this.removeObjects(objectStates)
        this.removeDependencies(dependencies, owners)
      },
    }
  }

  private applyPositions(
    positions: Array<{
      object: THREE.Object3D
      before: THREE.Vector3
      after: THREE.Vector3
    }>,
    key: "before" | "after"
  ) {
    positions.forEach(({ object, before, after }) => {
      object.position.copy(key === "before" ? before : after)
      updateConstraintFromPointPosition(object)
      object.userData.dependents?.forEach((dependent: any) => dependent.update?.())
    })
  }

  private createObjectStates(objects: THREE.Object3D[]) {
    return objects.map((object) => ({
      object,
      parent: object.parent ?? this.scene,
      selectable: this.selectableObjects.includes(object),
    }))
  }

  private createDependencyStates(owners: unknown[]) {
    if (owners.length === 0) return []

    return this.selectableObjects
      .filter((object) => {
        const dependents = object.userData.dependents
        return Array.isArray(dependents) && owners.some((owner) => dependents.includes(owner))
      })
      .map((object) => ({
        object,
        dependents: [...object.userData.dependents],
      }))
  }

  private restoreDependencies(dependencies: DependencyState[]) {
    dependencies.forEach(({ object, dependents }) => {
      object.userData.dependents = [...dependents]
      object.userData.dependents.forEach((dependent: any) => dependent.update?.())
    })
  }

  private removeDependencies(dependencies: DependencyState[], owners: unknown[]) {
    dependencies.forEach(({ object }) => {
      const dependents = object.userData.dependents
      if (!Array.isArray(dependents)) return

      object.userData.dependents = dependents.filter(
        (dependent: unknown) => !owners.includes(dependent)
      )
      object.userData.dependents.forEach((dependent: any) => dependent.update?.())
    })
  }

  private restoreObjects(states: ObjectState[]) {
    states.forEach(({ object, parent, selectable }) => {
      if (!object.parent) {
        parent.add(object)
      }

      if (selectable && !this.selectableObjects.includes(object)) {
        this.selectableObjects.push(object)
      }
    })
  }

  private removeObjects(states: ObjectState[]) {
    states.forEach(({ object }) => {
      this.removeSelectableObject(object)
      object.parent?.remove(object)
    })
  }

  private removeSelectableObject(object: THREE.Object3D) {
    for (let i = this.selectableObjects.length - 1; i >= 0; i--) {
      if (this.selectableObjects[i] === object) {
        this.selectableObjects.splice(i, 1)
      }
    }
  }

  private uniqueObjects(objects: THREE.Object3D[]) {
    return [...new Set(objects)]
  }

  private notify() {
    this.listeners.forEach((listener) => listener())
  }
}
