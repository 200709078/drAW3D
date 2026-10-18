import * as THREE from "three"
import { BaseTool } from "./BaseTool"
import { createPoint } from "../objects/Point"
import {
    getObjectPointHit,
    LINE_SEGMENT_POINT_COLOR,
    removeObjectPointConstraint,
    setObjectPointConstraint,
} from "../interaction/LineSegmentConstraint"
import { CONSTRAINED_POINT_SIZE, getNearestSelectablePoint, getPointerIntersection, getPointerPointSize, PREVIEW_POINT_SIZE, shouldShowPointerPreview, updatePointCursor } from "../interaction/Pointer"

export class PointTool extends BaseTool {
    points: THREE.Mesh[] = []
    preview: THREE.Mesh
    selectableObjects: THREE.Object3D[]

    constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, selectableObjects: THREE.Object3D[]) {
        super(scene, camera)
        this.selectableObjects = selectableObjects
        this.points = []
        const geo = new THREE.SphereGeometry(PREVIEW_POINT_SIZE, 16, 16)
        const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 })

        this.preview = new THREE.Mesh(geo, mat)
    }

    onPointerMove(event: PointerEvent) {
        updatePointCursor(event, this.camera, this.selectableObjects)

        if (!shouldShowPointerPreview(event)) {
            this.preview.visible = false
            return
        }

        const objectHit = getObjectPointHit(event, this.camera, this.selectableObjects)

        this.preview.position.copy(
            objectHit?.position ?? getPointerIntersection(event, this.camera)
        )
        this.preview.visible = true

        if (objectHit) {
            document.body.style.cursor = "pointer"
        }
    }

    onPointerDown(event: PointerEvent) {
        const existingPoint = getNearestSelectablePoint(
            event,
            this.camera,
            this.selectableObjects
        )

        if (existingPoint) {
            this.selectPoint(existingPoint)
            this.complete({ clearSelection: false })
            return
        }

        const objectHit = getObjectPointHit(event, this.camera, this.selectableObjects)

        if (objectHit) {
            const point = createPoint(
                objectHit.position,
                Math.max(getPointerPointSize(event), CONSTRAINED_POINT_SIZE),
                LINE_SEGMENT_POINT_COLOR
            )

            setObjectPointConstraint(point, objectHit.constraint)
            this.scene.add(point)
            this.points.push(point)
            this.selectableObjects.push(point)
            this.recordConstrainedPointCreation(point)
            this.complete()
            return
        }

        const point = createPoint(
            getPointerIntersection(event, this.camera),
            getPointerPointSize(event)
        )

        this.scene.add(point)
        this.points.push(point)
        this.selectableObjects.push(point)
        this.recordCreation("Nokta olustur", [point])
        this.complete()
    }

    onClick(event: MouseEvent) { this.onPointerDown(event as PointerEvent) }
    onMouseMove(_event: MouseEvent) { }

    activate() {
        this.preview.visible = false

        if (!this.preview.parent) {
            this.scene.add(this.preview)
        }
    }

    deactivate() {
        this.preview.visible = false

        if (this.preview.parent) {
            this.scene.remove(this.preview)
        }
    }

    reset() {
        this.preview.visible = false
    }

    private recordConstrainedPointCreation(point: THREE.Mesh) {
        const parent = point.parent ?? this.scene
        const constraint = point.userData.constraint

        if (!this.history || !constraint) {
            this.recordCreation("Nesne uzerinde nokta olustur", [point])
            return
        }

        this.history.execute({
            name: "Nesne uzerinde nokta olustur",
            undo: () => {
                removeObjectPointConstraint(point)
                const index = this.selectableObjects.indexOf(point)
                if (index >= 0) this.selectableObjects.splice(index, 1)
                point.parent?.remove(point)
            },
            redo: () => {
                setObjectPointConstraint(point, constraint)

                if (!point.parent) {
                    parent.add(point)
                }

                if (!this.selectableObjects.includes(point)) {
                    this.selectableObjects.push(point)
                }
            },
        })
    }
}
