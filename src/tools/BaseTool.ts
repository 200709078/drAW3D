import * as THREE from "three"
import type { HistoryManager } from "../history/HistoryManager"
export type ToolCompleteOptions = {
    clearSelection?: boolean
}

export class BaseTool {
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    onComplete: ((options?: ToolCompleteOptions) => void) | null = null
    onPointSelect: ((point: THREE.Mesh) => void) | null = null
    history: HistoryManager | null = null

    constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
        this.scene = scene
        this.camera = camera
    }
    setCompleteHandler(handler: (options?: ToolCompleteOptions) => void) {
        this.onComplete = handler
    }
    setPointSelectHandler(handler: (point: THREE.Mesh) => void) {
        this.onPointSelect = handler
    }
    setHistoryManager(history: HistoryManager) {
        this.history = history
    }
    protected recordCreation(name: string, objects: THREE.Object3D[], owners: unknown[] = []) {
        if (objects.length === 0) return

        this.history?.execute(
            this.history.createObjectAction(name, objects, owners)
        )
    }
    protected complete(options?: ToolCompleteOptions) {
        this.onComplete?.(options)
    }
    protected selectPoint(point: THREE.Mesh) {
        this.onPointSelect?.(point)
    }
    onPointerDown(_event: PointerEvent) { }
    onPointerMove(_event: PointerEvent) { }
    onPointerUp(_event: PointerEvent) { }
    onPointerCancel(_event: PointerEvent) {
        this.onPointerUp(_event)
    }
    onMouseMove(_event: MouseEvent) { }
    onClick(_event: MouseEvent) { }
    onMouseDown(_event: MouseEvent) { }
    onMouseUp(_event: MouseEvent) { }
    onKeyDown(_event: KeyboardEvent) { }
    onDoubleClick(_event: MouseEvent) { }

    reset() { }
    cancel() {
        this.reset()
    }
    activate() { }
    deactivate() { }
}
