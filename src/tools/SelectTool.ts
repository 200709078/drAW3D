import * as THREE from "three"
import { BaseTool } from "./BaseTool"
import { Prism } from "../objects/Prism"
import { Pyramid } from "../objects/Pyramid"
import { Cone } from "../objects/Cone"
import { Cylinder } from "../objects/Cylinder"
import { getNearestSelectablePoint, getPointerIntersection, SELECTED_POINT_DRAG_RADIUS_PX } from "../interaction/Pointer"
import {
    getConstrainedPointDirection,
    movePointAlongLineSegmentFromPointer,
} from "../interaction/LineSegmentConstraint"


type SelectionRole = "free" | "locked" | "height" | "solid" | "constrained"
const HELPERS_ENABLED = true
const SELECTION_VISUALS_ENABLED = true
type SideCountController = {
    sideCount: number
    setSideCount: (n: number) => void
}

type UnFoldController = {
    unFoldAngle: number
    setUnFoldAngle: (angle: number) => void
    maxUnFoldAngle: number
}

type NumericChange = {
    owner: any
    before: number
}

export class SelectTool extends BaseTool {
    raycaster = new THREE.Raycaster()
    mouse = new THREE.Vector2()

    selectableObjects: THREE.Object3D[] = []

    selectedObject: THREE.Mesh | null = null
    originalMaterial: THREE.Material | THREE.Material[] | null = null
    originalMaterialColor: THREE.Color | null = null
    selectionOutline: THREE.LineSegments | null = null
    selectedOwner: any = null
    selectedSideCountController: SideCountController | null = null
    selectedUnFoldController: UnFoldController | null = null
    sideSliderContainer: HTMLElement | null = null
    sideSlider: HTMLInputElement | null = null
    sideValue: HTMLSpanElement | null = null

    unFoldControl: HTMLElement | null = null
    unFoldSlider: HTMLInputElement | null = null
    unFoldValue: HTMLSpanElement | null = null

    deleteControl: HTMLElement | null = null
    deleteButton: HTMLButtonElement | null = null
    showButton: HTMLButtonElement | null = null
    hideButton: HTMLButtonElement | null = null
    deleteButtonListenerAttached = false
    showButtonListenerAttached = false
    hideButtonListenerAttached = false
    hiddenObjects = new Set<THREE.Object3D>()

    isDragging = false
    verticalMove = false
    lastMouseY = 0
    pointerDownPosition = new THREE.Vector2()
    dragOffset = new THREE.Vector3()
    dragStartPositions: Array<{ object: THREE.Object3D, position: THREE.Vector3 }> = []
    heightDragStart: { owner: any, height: number } | null = null
    sideCountChange: NumericChange | null = null
    unFoldChange: NumericChange | null = null
    hasMoved = false
    activePointerType = "mouse"
    lastTapObject: THREE.Mesh | null = null
    lastTapTime = 0

    helperArrows: THREE.Group[] = []
    private readonly fallbackSelectedPointMaterial = new THREE.MeshStandardMaterial({
        color: 0xffaa00,
    })
    private readonly helperShaftGeometry = new THREE.CylinderGeometry(
        0.105,
        0.105,
        0.66,
        12
    )
    private readonly helperHeadGeometry = new THREE.ConeGeometry(0.14, 0.36, 16)
    private readonly helperArrowMaterials = new Map<number, THREE.MeshStandardMaterial>()
    private readonly selectionOutlineMaterial = new THREE.LineBasicMaterial({
        color: 0xffaa00,
        depthTest: false,
    })

    controls: any

    constructor(
        scene: THREE.Scene,
        camera: THREE.PerspectiveCamera,
        controls: any
    ) {
        super(scene, camera)
        this.controls = controls
        this.sideSliderContainer = document.getElementById("sideControl")
        this.sideSlider = document.getElementById("sideSlider") as HTMLInputElement
        this.sideValue = document.getElementById("sideValue") as HTMLSpanElement

        this.unFoldControl = document.getElementById("unFoldControl")
        this.unFoldSlider = document.getElementById("unFoldSlider") as HTMLInputElement
        this.unFoldValue = document.getElementById("unFoldValue") as HTMLSpanElement

        this.sideSlider?.addEventListener("input", () => {
            this.beginSideCountChange()
            const value = parseInt(this.sideSlider!.value)

            this.sideValue!.textContent = value.toString()
            this.selectedSideCountController?.setSideCount(value)
            this.updateUnFoldControl(this.selectedOwner)
            this.refreshSelectionOutline()
        })
        this.sideSlider?.addEventListener("change", () => {
            this.commitSideCountChange()
        })
        this.sideSlider?.addEventListener("pointerup", () => {
            this.commitSideCountChange()
        })

        this.unFoldSlider?.addEventListener("input", () => {
            this.beginUnFoldChange()
            const value = parseInt(this.unFoldSlider!.value)

            if (this.unFoldValue) {
                this.unFoldValue.textContent = value.toString()
            }

            this.selectedUnFoldController?.setUnFoldAngle(value)
        })
        this.unFoldSlider?.addEventListener("change", () => {
            this.commitUnFoldChange()
        })
        this.unFoldSlider?.addEventListener("pointerup", () => {
            this.commitUnFoldChange()
        })

        this.ensureActionControls()
        this.updateActionControls()
    }

    setSelectableObjects(objects: THREE.Object3D[]) {
        this.selectableObjects = objects
    }

    shouldHandleBeforeOrbitControls(event: PointerEvent) {
        return this.pickObject(event) !== null || this.shouldStartSelectedPointDrag(event)
    }

    deactivate() {
        this.isDragging = false
        this.controls.enabled = true
        this.clearSelection()
        document.body.style.cursor = "default"
    }

    onPointerDown(event: PointerEvent) {
        this.activePointerType = event.pointerType || "mouse"
        const hit = this.pickObject(event)
        const dragSelectedPoint = !hit && this.shouldStartSelectedPointDrag(event)
        this.pointerDownPosition.set(event.clientX, event.clientY)
        this.hasMoved = false

        if (!hit && !dragSelectedPoint) {
            this.clearSelection()
            document.body.style.cursor = "default"
            this.controls.enabled = true
            return
        }

        const target = hit ?? this.selectedObject!

        this.selectObject(target)
        this.updateHelperArrows()

        const role = this.getSelectionRole(target)

        if (role === "solid") {
            this.isDragging = false
            this.controls.enabled = true
            return
        }

        if (role === "locked") {
            this.isDragging = false
            return
        }

        this.isDragging = true
        this.lastMouseY = event.clientY
        this.dragOffset.set(0, 0, 0)
        this.dragStartPositions = this.getMoveObjects(target).map((object) => ({
            object,
            position: object.position.clone(),
        }))
        this.heightDragStart = role === "height" && target.userData.normalWheelController
            ? {
                owner: target.userData.normalWheelController,
                height: target.userData.normalWheelController.height,
            }
            : null

        if (role === "free" && !this.verticalMove) {
            const pointerPosition = this.getPointerPositionOnPlane(event)
            this.dragOffset.copy(target.position).sub(pointerPosition)
        }

    }

    onPointerMove(event: PointerEvent) {
        this.updateCursor(event)

        if (this.pointerDownPosition.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 4) {
            this.hasMoved = true
        }

        if (!this.isDragging || !this.selectedObject) {
            this.updateHelperArrowScale()
            return
        }

        const role = this.getSelectionRole(this.selectedObject)

        if (role === "locked" || role === "solid") return

        if (role === "height") {
            const dy = event.clientY - this.lastMouseY
            this.lastMouseY = event.clientY

            const controller = this.selectedObject.userData.normalWheelController

            if (controller) {
                controller.moveAlongNormal(-dy * 0.02)
            }

            this.updateHelperArrows()
            return
        }

        if (role === "constrained") {
            movePointAlongLineSegmentFromPointer(this.selectedObject, event, this.camera)
            this.updateDependents(this.selectedObject)
            this.updateHelperArrows()
            return
        }

        if (role === "free") {
            if (this.verticalMove) {
                const dy = event.clientY - this.lastMouseY
                this.lastMouseY = event.clientY

                this.selectedObject.position.y -= dy * 0.02

                this.syncPrismPairY(this.selectedObject)
                this.updateDependents(this.selectedObject)
                this.updateHelperArrows()
                return
            }

            const pos = this.getPointerPositionOnPlane(event)
            this.selectedObject.position.copy(pos.add(this.dragOffset))

            this.syncPrismPairY(this.selectedObject)
            this.updateDependents(this.selectedObject)
            this.updateHelperArrows()
        }
    }

    onPointerUp(event: PointerEvent) {
        const hit = this.pickObject(event)
        const movedObject = this.selectedObject
        const movedRole = movedObject ? this.getSelectionRole(movedObject) : null

        if (!this.hasMoved && hit && hit === this.selectedObject && this.getSelectionRole(hit) === "free") {
            const now = performance.now()

            if (this.lastTapObject === hit && now - this.lastTapTime < 350) {
                this.verticalMove = !this.verticalMove
                this.updateHelperArrows()
                this.lastTapObject = null
                this.lastTapTime = 0
            } else {
                this.lastTapObject = hit
                this.lastTapTime = now
            }
        }

        this.isDragging = false
        this.controls.enabled = true
        this.updateHelperArrowScale()

        if (this.hasMoved && movedObject && (movedRole === "free" || movedRole === "constrained")) {
            this.recordMoveAction()
        }

        if (this.hasMoved && movedObject && movedRole === "height") {
            this.recordHeightAction()
        }

        this.dragStartPositions = []
        this.heightDragStart = null
    }

    onMouseDown(event: MouseEvent) { this.onPointerDown(event as PointerEvent) }
    onMouseMove(event: MouseEvent) { this.onPointerMove(event as PointerEvent) }
    onMouseUp(event: MouseEvent) { this.onPointerUp(event as PointerEvent) }

    selectPoint(object: THREE.Mesh) {
        this.selectObject(object)
    }

    selectPointWithoutHelpers(object: THREE.Mesh) {
        this.selectObject(object)
    }

    private selectObject(object: THREE.Mesh, showHelpers = true) {
        if (this.selectedObject === object) {
            if (showHelpers) {
                this.updateHelperArrows()
            } else {
                this.clearHelperArrows()
            }
            return
        }

        this.clearHelperArrows()
        this.clearOwnerSelectionEffects()
        this.restoreOriginalMaterial()
        this.clearSelectionOutline()

        this.selectedObject = object
        this.selectedOwner = this.getSelectionOwner(object)

        if (this.getSelectionRole(this.selectedObject) === "solid") {
            if (SELECTION_VISUALS_ENABLED) {
                this.selectedOwner?.onSelect?.(this.selectedObject)
                this.addSelectionOutline(this.selectedObject)
            }
            this.updateSideCountControl(this.selectedOwner)
            this.updateUnFoldControl(this.selectedOwner)
            this.updateActionControls()
        } else if (this.selectedObject instanceof THREE.Mesh) {
            if (SELECTION_VISUALS_ENABLED) {
                this.originalMaterial = this.selectedObject.material
                this.originalMaterialColor = this.captureMaterialColor(this.selectedObject.material)

                if (!this.applyMaterialColor(this.selectedObject.material, 0xffaa00)) {
                    this.selectedObject.material = this.fallbackSelectedPointMaterial
                }
            }
            this.updateSideCountControl(null)
            this.updateUnFoldControl(null)
            this.updateActionControls()
        }

        if (showHelpers) {
            this.updateHelperArrows()
        }
    }

    clearSelection() {
        this.clearHelperArrows()
        this.clearOwnerSelectionEffects()
        this.restoreOriginalMaterial()
        this.clearSelectionOutline()
        this.selectedObject = null
        this.selectedOwner = null
        this.updateSideCountControl(null)
        this.updateUnFoldControl(null)
        this.updateActionControls()
        this.verticalMove = false
        this.controls.enabled = true
    }

    private restoreOriginalMaterial() {
        if (this.selectedObject instanceof THREE.Mesh && this.originalMaterial) {
            if (this.originalMaterialColor) {
                this.applyMaterialColor(this.selectedObject.material, this.originalMaterialColor)
            }

            this.selectedObject.material = this.originalMaterial
            this.originalMaterial = null
            this.originalMaterialColor = null
        }
    }

    private captureMaterialColor(material: THREE.Material | THREE.Material[]) {
        if (Array.isArray(material)) return null
        if (!("color" in material)) return null

        return (material as THREE.Material & { color: THREE.Color }).color.clone()
    }

    private applyMaterialColor(
        material: THREE.Material | THREE.Material[],
        color: THREE.ColorRepresentation
    ) {
        if (Array.isArray(material) || !("color" in material)) return false

        const colorMaterial = material as THREE.Material & { color: THREE.Color }
        colorMaterial.color.set(color)
        return true
    }

    private getSelectionRole(object: THREE.Object3D): SelectionRole {
        if (object.userData.selectableType === "solid") {
            return "solid"
        }

        return (
            object.userData.pointRole ??
            (
                object.userData.normalWheelController
                    ? "height"
                    : object.userData.lockMouseDrag
                        ? "locked"
                        : "free"
            )
        )
    }

    private getSelectionOwner(object: THREE.Object3D) {
        return object.userData.owner ?? null
    }

    private clearOwnerSelectionEffects() {
        this.selectedOwner?.onDeselect?.()
        this.selectedOwner = null
    }

    private updateSideCountControl(owner: any) {
        const controller = this.getSideCountController(owner)

        this.selectedSideCountController = controller

        if (!this.sideSliderContainer || !this.sideSlider || !this.sideValue) return

        if (!controller) {
            this.sideSlider.disabled = true
            this.sideSliderContainer.style.display = "none"
            this.sideSliderContainer.classList.remove("active")
            this.sideSliderContainer.classList.add("passive")
            return
        }

        this.sideSliderContainer.style.display = "block"

        const value = controller.sideCount.toString()

        this.sideSlider.value = value
        this.sideValue.textContent = value

        this.sideSlider.disabled = false
        this.sideSliderContainer.classList.add("active")
        this.sideSliderContainer.classList.remove("passive")
    }

    private updateUnFoldControl(owner: any) {
        if (!this.unFoldControl || !this.unFoldSlider) return

        const controller = this.getUnFoldController(owner)
        this.selectedUnFoldController = controller

        if (!controller) {
            this.unFoldSlider.disabled = true
            this.unFoldControl.style.display = "none"
            this.unFoldControl.classList.remove("active")
            this.unFoldControl.classList.add("passive")

            if (this.unFoldValue) {
                this.unFoldValue.textContent = "0"
            }

            return
        }

        this.unFoldControl.style.display = "block"
        this.unFoldControl.classList.add("active")
        this.unFoldControl.classList.remove("passive")

        const value = controller.unFoldAngle
        this.unFoldSlider.max = controller.maxUnFoldAngle.toString()
        this.unFoldSlider.value = value.toString()

        if (this.unFoldValue) {
            this.unFoldValue.textContent = value.toString()
        }

        this.unFoldSlider.disabled = false
    }

    private beginSideCountChange() {
        if (this.sideCountChange || !this.selectedOwner || !this.selectedSideCountController) return

        this.sideCountChange = {
            owner: this.selectedOwner,
            before: this.selectedSideCountController.sideCount,
        }
    }

    private commitSideCountChange() {
        if (!this.sideCountChange || !this.history) {
            this.sideCountChange = null
            return
        }

        const { owner, before } = this.sideCountChange
        const after = owner.sideCount
        this.sideCountChange = null

        if (before === after) return

        this.history.execute({
            name: "Kenar sayısı değiştir",
            undo: () => this.applySideCount(owner, before),
            redo: () => this.applySideCount(owner, after),
        })
    }

    private applySideCount(owner: any, value: number) {
        owner.setSideCount?.(value)

        if (this.selectedOwner === owner) {
            this.updateSideCountControl(owner)
            this.updateUnFoldControl(owner)
            this.refreshSelectionOutline()
        }
    }

    private beginUnFoldChange() {
        if (this.unFoldChange || !this.selectedOwner || !this.selectedUnFoldController) return

        this.unFoldChange = {
            owner: this.selectedOwner,
            before: this.selectedUnFoldController.unFoldAngle,
        }
    }

    private commitUnFoldChange() {
        if (!this.unFoldChange || !this.history) {
            this.unFoldChange = null
            return
        }

        const { owner, before } = this.unFoldChange
        const after = owner.unFoldAngle
        this.unFoldChange = null

        if (before === after) return

        this.history.execute({
            name: "Açınım değiştir",
            undo: () => this.applyUnFoldAngle(owner, before),
            redo: () => this.applyUnFoldAngle(owner, after),
        })
    }

    private applyUnFoldAngle(owner: any, value: number) {
        owner.setUnFoldAngle?.(value)

        if (this.selectedOwner === owner) {
            this.updateUnFoldControl(owner)
        }
    }

    private updateActionControls() {
        this.ensureActionControls()

        if (!this.deleteControl || !this.deleteButton || !this.showButton || !this.hideButton) return

        const canDelete = this.canDeleteSelected()
        const canHide = this.canHideSelected()
        const canShow = this.hiddenObjects.size > 0

        this.deleteControl.style.display = "flex"
        this.deleteButton.disabled = !canDelete
        this.hideButton.disabled = !canHide
        this.showButton.disabled = !canShow

        this.deleteButton.classList.toggle("active", canDelete)
        this.deleteButton.classList.toggle("passive", !canDelete)
        this.hideButton.classList.toggle("active", canHide)
        this.hideButton.classList.toggle("passive", !canHide)
        this.showButton.classList.toggle("active", canShow)
        this.showButton.classList.toggle("passive", !canShow)

        this.deleteButton.title = canDelete
            ? "Sil"
            : "Silinecek nesne seçilmedi"

        this.hideButton.title = canHide
            ? "Gizle"
            : "Gizlenecek nesne seçilmedi"

        this.showButton.title = canShow
            ? "Tümünü Göster"
            : "Gizli nesne yok"
    }
    private ensureActionControls() {
        this.deleteControl ??= document.getElementById("rightActionToolbar")
        this.deleteButton ??= document.getElementById("deleteButton") as HTMLButtonElement | null
        this.showButton ??= document.getElementById("showButton") as HTMLButtonElement | null
        this.hideButton ??= document.getElementById("hideButton") as HTMLButtonElement | null

        if (!this.deleteButton || this.deleteButtonListenerAttached) return

        this.deleteButton.addEventListener("click", () => {
            this.deleteSelected()
        })
        this.deleteButtonListenerAttached = true

        if (this.showButton && !this.showButtonListenerAttached) {
            this.showButton.addEventListener("click", () => {
                this.showHiddenObjects()
            })
            this.showButtonListenerAttached = true
        }

        if (this.hideButton && !this.hideButtonListenerAttached) {
            this.hideButton.addEventListener("click", () => {
                this.hideSelected()
            })
            this.hideButtonListenerAttached = true
        }
    }

    private canDeleteSelected() {
        if (!this.selectedObject) return false

        if (this.getSelectionRole(this.selectedObject) === "solid") {
            return true
        }

        if (!this.selectedObject.userData.pointRole) {
            return false
        }

        if (this.selectedObject.userData.pointRole === "constrained") {
            return false
        }

        if (
            this.selectedObject.userData.owner instanceof Prism ||
            this.selectedObject.userData.owner instanceof Pyramid ||
            this.selectedObject.userData.owner instanceof Cone ||
            this.selectedObject.userData.owner instanceof Cylinder
        ) {
            return false
        }

        return (this.selectedObject.userData.dependents?.length ?? 0) === 0
    }

    private canHideSelected() {
        return this.selectedObject !== null && this.selectedObject.visible
    }

    private hideSelected() {
        if (!this.selectedObject || !this.canHideSelected()) return

        const selected = this.selectedObject
        const owner = this.selectedOwner ?? this.getVisibilityOwner(selected)
        const objectsToHide = this.getObjectsForVisibilityAction(selected, owner)
        const changedObjects = objectsToHide.filter((object) => object.visible)

        this.clearSelection()

        if (changedObjects.length === 0) return

        const hide = () => {
            changedObjects.forEach((object) => {
                object.visible = false
                this.hiddenObjects.add(object)
            })
            this.updateActionControls()
        }

        const show = () => {
            changedObjects.forEach((object) => {
                object.visible = true
                this.hiddenObjects.delete(object)
            })
            this.updateActionControls()
        }

        hide()
        this.history?.execute({
            name: "Gizle",
            undo: show,
            redo: hide,
        })
    }

    private showHiddenObjects() {
        const objectsToShow = [...this.hiddenObjects].filter((object) => !object.visible)

        if (objectsToShow.length === 0) {
            this.hiddenObjects.clear()
            this.updateActionControls()
            return
        }

        const show = () => {
            objectsToShow.forEach((object) => {
                object.visible = true
                this.hiddenObjects.delete(object)
            })
            this.updateActionControls()
        }

        const hide = () => {
            objectsToShow.forEach((object) => {
                object.visible = false
                this.hiddenObjects.add(object)
            })
            this.updateActionControls()
        }

        show()
        this.history?.execute({
            name: "Tümünü göster",
            undo: hide,
            redo: show,
        })
    }

    private deleteSelected() {
        if (!this.selectedObject || !this.canDeleteSelected()) return

        const selected = this.selectedObject
        const owner = this.selectedOwner
        const deletion = selected.userData.selectableType === "solid" && owner
            ? this.createOwnerDeletion(owner)
            : {
                objects: [selected],
                owners: [],
            }

        this.clearSelection()

        if (deletion.objects.length === 0) return

        const action = this.history?.createDeleteAction("Sil", deletion.objects, deletion.owners)
        if (!action) return

        action.redo()
        this.history?.execute(action)
    }

    private createOwnerDeletion(owner: any) {
        const removedObjects = new Set<THREE.Object3D>()
        const candidatePoints = new Set<THREE.Object3D>()
        const owners = this.getOwnersForDeletion(owner)

        const ownedObjects = typeof owner.getOwnedObjectsForDeletion === "function"
            ? owner.getOwnedObjectsForDeletion()
            : Object.values(owner)

        ownedObjects.forEach((value: unknown) => {
            this.collectOwnedObjects(value, removedObjects, candidatePoints)
        })

        candidatePoints.forEach((point) => {
            const dependents = Array.isArray(point.userData.dependents)
                ? point.userData.dependents
                : []

            const remainingDependents = dependents.filter(
                (dependent: unknown) => !owners.includes(dependent)
            )

            if (remainingDependents.length === 0) {
                removedObjects.add(point)
            }
        })

        return {
            objects: [...removedObjects],
            owners,
        }
    }

    private getOwnersForDeletion(owner: any) {
        const owners = [owner]

        if (owner?.initialEdge) {
            owners.push(owner.initialEdge)
        }

        if (owner?.radiusSegmentObject) {
            owners.push(owner.radiusSegmentObject)
        }

        return owners
    }

    private getObjectsForVisibilityAction(selected: THREE.Object3D, owner: any) {
        if (owner && typeof owner.getOwnedObjectsForDeletion === "function") {
            return owner.getOwnedObjectsForDeletion() as THREE.Object3D[]
        }

        return [selected]
    }

    private getVisibilityOwner(object: THREE.Object3D) {
        if (object.userData.owner) {
            return object.userData.owner
        }

        const dependents = object.userData.dependents

        if (!Array.isArray(dependents)) return null

        return dependents.find(
            (dependent: any) => typeof dependent?.getOwnedObjectsForDeletion === "function"
        ) ?? null
    }

    private collectOwnedObjects(
        value: unknown,
        removedObjects: Set<THREE.Object3D>,
        candidatePoints: Set<THREE.Object3D>
    ) {
        if (value instanceof THREE.Object3D) {
            if (value.userData.pointRole) {
                candidatePoints.add(value)
            } else {
                removedObjects.add(value)
            }
            return
        }

        if (Array.isArray(value)) {
            value.forEach((item) => this.collectOwnedObjects(
                item,
                removedObjects,
                candidatePoints
            ))
        }
    }

    private getSideCountController(owner: any): SideCountController | null {
        if (
            owner &&
            typeof owner.sideCount === "number" &&
            typeof owner.setSideCount === "function"
        ) {
            return owner as SideCountController
        }

        return null
    }

    private getUnFoldController(owner: any): UnFoldController | null {
        if (
            (owner instanceof Prism || owner instanceof Pyramid || owner instanceof Cone || owner instanceof Cylinder) &&
            typeof owner.unFoldAngle === "number" &&
            typeof owner.setUnFoldAngle === "function"
        ) {
            return {
                unFoldAngle: owner.unFoldAngle,
                setUnFoldAngle: (angle: number) => owner.setUnFoldAngle(angle),
                maxUnFoldAngle:
                    owner instanceof Pyramid || owner instanceof Cone
                        ? owner.getMaxUnFoldAngle()
                        : 90,
            }
        }

        return null
    }

    private pickObject(event: PointerEvent | MouseEvent): THREE.Mesh | null {
        return (
            getNearestSelectablePoint(event, this.camera, this.selectableObjects) ??
            this.pickSolid(event)
        )
    }

    private pickSolid(event: PointerEvent | MouseEvent): THREE.Mesh | null {
        const solidMeshes = this.selectableObjects.filter((object): object is THREE.Mesh =>
            object instanceof THREE.Mesh &&
            object.visible &&
            object.userData.selectableType === "solid"
        )

        if (solidMeshes.length === 0) return null

        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1

        this.raycaster.setFromCamera(this.mouse, this.camera)

        return this.raycaster.intersectObjects(solidMeshes, false)[0]?.object as THREE.Mesh ?? null
    }

    private updateCursor(event: PointerEvent | MouseEvent) {
        document.body.style.cursor = this.pickObject(event) ? "pointer" : "default"
    }

    private addSelectionOutline(object: THREE.Mesh) {
        this.clearSelectionOutline()

        if (object.userData.selectionOutline === "none") {
            return
        }

        if (object.userData.selectionOutline === "box") {
            this.selectionOutline = new THREE.BoxHelper(object, 0xffaa00)
            this.selectionOutline.renderOrder = 999
            this.scene.add(this.selectionOutline)
            return
        }

        const geometry = new THREE.EdgesGeometry(object.geometry, 15)
        this.selectionOutline = new THREE.LineSegments(geometry, this.selectionOutlineMaterial)
        this.selectionOutline.renderOrder = 999
        object.add(this.selectionOutline)
    }

    private clearSelectionOutline() {
        if (!this.selectionOutline) return

        if (this.selectionOutline.parent) {
            this.selectionOutline.parent.remove(this.selectionOutline)
        }

        this.selectionOutline.geometry.dispose()

        const material = this.selectionOutline.material

        if (Array.isArray(material)) {
            material.forEach((item) => {
                if (item !== this.selectionOutlineMaterial) {
                    item.dispose()
                }
            })
        } else if (material !== this.selectionOutlineMaterial) {
            material.dispose()
        }

        this.selectionOutline = null
    }

    private refreshSelectionOutline() {
        if (
            !this.selectedObject ||
            this.getSelectionRole(this.selectedObject) !== "solid"
        ) {
            return
        }

        this.clearSelectionOutline()
        this.addSelectionOutline(this.selectedObject)
    }

    private getPointerPositionOnPlane(event: PointerEvent | MouseEvent) {
        const y = this.selectedObject ? this.selectedObject.position.y : 0

        return getPointerIntersection(event, this.camera, undefined, y)
    }

    private syncPrismPairY(object: THREE.Object3D) {
        const prismPair = object.userData.prismPair as THREE.Object3D | undefined

        if (!prismPair) return

        prismPair.position.y = object.position.y
        this.updateDependents(prismPair)
    }

    private getMoveObjects(object: THREE.Object3D) {
        const objects = [object]
        const prismPair = object.userData.prismPair as THREE.Object3D | undefined

        if (prismPair) {
            objects.push(prismPair)
        }

        return [...new Set(objects)]
    }

    private recordMoveAction() {
        if (!this.history || this.dragStartPositions.length === 0) return

        const positions = this.dragStartPositions
            .map(({ object, position }) => ({
                object,
                before: position,
                after: object.position.clone(),
            }))
            .filter(({ before, after }) => before.distanceTo(after) > 0.0001)

        if (positions.length === 0) return

        this.history.execute(
            this.history.createMoveAction("Taşı", positions)
        )
    }

    private recordHeightAction() {
        if (!this.history || !this.heightDragStart) return

        const { owner, height: before } = this.heightDragStart
        const after = owner.height

        if (typeof before !== "number" || typeof after !== "number") return
        if (Math.abs(before - after) < 0.0001) return

        this.history.execute({
            name: "Yükseklik değiştir",
            undo: () => this.applyHeight(owner, before),
            redo: () => this.applyHeight(owner, after),
        })
    }

    private applyHeight(owner: any, value: number) {
        owner.height = value
        owner.update?.()

        if (this.selectedOwner === owner || this.selectedObject?.userData.owner === owner) {
            this.updateHelperArrows()
            this.updateUnFoldControl(owner)
            this.refreshSelectionOutline()
        }
    }

    private updateDependents(object: THREE.Object3D) {
        object.userData.dependents?.forEach((dependent: any) => {
            dependent.update?.()
        })
    }

    private updateHelperArrows() {
        if (!HELPERS_ENABLED) {
            this.clearHelperArrows()
            return
        }

        this.clearHelperArrows()

        if (!this.selectedObject) {
            return
        }

        const role = this.getSelectionRole(this.selectedObject)

        if (role === "locked" || role === "solid") {
            return
        }

        if (role === "height") {
            const controller = this.selectedObject.userData.normalWheelController

            let direction = new THREE.Vector3(0, 1, 0)

            if (controller?.getHeightDirection) {
                direction = controller.getHeightDirection()
            }

            this.addDoubleHelperArrow(direction, 0x800080)
            this.updateHelperArrowScale()
            return
        }

        if (role === "constrained") {
            const directions = getConstrainedPointDirection(this.selectedObject)

            if (!directions) return

            directions.forEach((direction) => {
                this.addDoubleHelperArrow(direction, 0x0b6b3a)
            })
            this.updateHelperArrowScale()
            return
        }

        if (role === "free") {
            if (this.verticalMove) {
                this.addDoubleHelperArrow(new THREE.Vector3(0, 1, 0), 0xffaa00)
                this.updateHelperArrowScale()
                return
            }

            this.addDoubleHelperArrow(new THREE.Vector3(1, 0, 0), 0xffaa00)
            this.addDoubleHelperArrow(new THREE.Vector3(0, 0, 1), 0xffaa00)
            this.updateHelperArrowScale()
        }
    }

    private addDoubleHelperArrow(direction: THREE.Vector3, color: number) {
        const dir = direction.clone().normalize()
        const positiveArrow = this.createHelperArrow(dir, color)
        const negativeArrow = this.createHelperArrow(
            dir.clone().multiplyScalar(-1),
            color
        )

        this.helperArrows.push(positiveArrow, negativeArrow)

        this.selectedObject!.add(positiveArrow)
        this.selectedObject!.add(negativeArrow)
    }

    private createHelperArrow(direction: THREE.Vector3, color: number) {
        const dir = direction.clone().normalize()

        const group = new THREE.Group()

        const offset = 0.6
        const shaftLength = 0.66
        const headLength = 0.36

        const material = this.getHelperArrowMaterial(color)
        const shaft = new THREE.Mesh(this.helperShaftGeometry, material)
        const head = new THREE.Mesh(this.helperHeadGeometry, material)

        const quaternion = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            dir
        )

        shaft.quaternion.copy(quaternion)
        head.quaternion.copy(quaternion)

        shaft.position.copy(
            dir.clone().multiplyScalar(offset + shaftLength / 2)
        )

        head.position.copy(
            dir.clone().multiplyScalar(offset + shaftLength + headLength / 2)
        )

        group.add(shaft)
        group.add(head)

        return group
    }

    private getHelperArrowMaterial(color: number) {
        let material = this.helperArrowMaterials.get(color)

        if (!material) {
            material = new THREE.MeshStandardMaterial({ color })
            this.helperArrowMaterials.set(color, material)
        }

        return material
    }

    private updateHelperArrowScale() {
        this.helperArrows.forEach((arrow) => {
            arrow.scale.setScalar(1)
        })
    }

    private clearHelperArrows() {
        this.helperArrows.forEach((arrow) => {
            if (arrow.parent) {
                arrow.parent.remove(arrow)
            }
        })

        this.helperArrows = []
    }

    private shouldStartSelectedPointDrag(event: PointerEvent | MouseEvent) {
        if (!this.selectedObject || this.helperArrows.length === 0) return false

        return this.getScreenDistanceToSelectedPoint(event) <= SELECTED_POINT_DRAG_RADIUS_PX
    }

    private getScreenDistanceToSelectedPoint(event: PointerEvent | MouseEvent) {
        if (!this.selectedObject) return Infinity

        const projected = new THREE.Vector3()
        this.selectedObject.getWorldPosition(projected)
        projected.project(this.camera)

        const x = (projected.x * 0.5 + 0.5) * window.innerWidth
        const y = (-projected.y * 0.5 + 0.5) * window.innerHeight

        return Math.hypot(event.clientX - x, event.clientY - y)
    }
}
