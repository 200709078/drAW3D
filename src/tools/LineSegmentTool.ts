import * as THREE from "three"
import { BaseTool } from "./BaseTool"
import { createPoint } from "../objects/Point"
import { LineSegment } from "../objects/LineSegment"
import { getNearestSelectablePoint, getPointerIntersection, getPointerPointSize, PREVIEW_POINT_SIZE, shouldShowPointerPreview, updatePointCursor } from "../interaction/Pointer"

export class LineSegmentTool extends BaseTool {
    previewLine: THREE.Line | null = null
    startPoint: THREE.Vector3 | null = null
    cursorPreview: THREE.Mesh
    startPointMesh: THREE.Mesh | null = null
    selectableObjects: THREE.Object3D[]
    createdPoints: THREE.Mesh[] = []
    constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, selectableObjects: THREE.Object3D[]) {
        super(scene, camera)
        this.selectableObjects = selectableObjects
        const geo = new THREE.SphereGeometry(PREVIEW_POINT_SIZE, 16, 16)
        const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 })

        this.cursorPreview = new THREE.Mesh(geo, mat)
    }

    onPointerDown(event: PointerEvent) {
        const result = this.getOrCreatePoint(event)
        const pointMesh = result.point

        if (!this.startPointMesh) {
            this.startPointMesh = pointMesh
            this.startPoint = pointMesh.position.clone()
            return
        }

        if (pointMesh === this.startPointMesh || pointMesh.position.distanceTo(this.startPointMesh.position) < 0.001) {
            if (result.created) this.removeCreatedPoint(pointMesh)
            return
        }

        const lineSegment = new LineSegment(
            this.startPointMesh,
            pointMesh,
            this.selectableObjects
        )
        this.scene.add(lineSegment.mesh)
        this.recordCreation(
            "Doğru parçası oluştur",
            [...this.createdPoints, lineSegment.mesh],
            [lineSegment]
        )

        if (this.previewLine) {
            this.scene.remove(this.previewLine)
            this.previewLine.geometry.dispose()
            this.previewLine = null
        }

        this.startPoint = null
        this.startPointMesh = null
        this.createdPoints = []
        this.complete()
    }
    onPointerMove(event: PointerEvent) {
        updatePointCursor(event, this.camera, this.selectableObjects)

        if (!shouldShowPointerPreview(event)) {
            this.cursorPreview.visible = false
            return
        }

        const pos = getPointerIntersection(event, this.camera)

        this.cursorPreview.position.copy(pos)
        this.cursorPreview.visible = true

        if (!this.startPoint) return

        const geometry = new THREE.BufferGeometry().setFromPoints([
            this.startPoint,
            pos,
        ])

        if (this.previewLine) {
            this.scene.remove(this.previewLine)
            this.previewLine.geometry.dispose()
        }

        this.previewLine = new THREE.Line(
            geometry,
            new THREE.LineBasicMaterial({ color: 0xff0000 })
        )

        this.scene.add(this.previewLine)
    }
    onClick(event: MouseEvent) { this.onPointerDown(event as PointerEvent) }
    onMouseMove(_event: MouseEvent) { }

    activate() {
        this.cursorPreview.visible = false

        if (!this.cursorPreview.parent) {
            this.scene.add(this.cursorPreview)
        }
    }

    deactivate() {
        this.cancel()

        if (this.cursorPreview.parent) {
            this.scene.remove(this.cursorPreview)
        }
    }

    cancel() {
        [...this.createdPoints].forEach((point) => this.removeCreatedPoint(point))
        this.reset()
    }

    reset() {
        if (this.previewLine) {
            this.scene.remove(this.previewLine)
            this.previewLine = null
        }

        this.startPoint = null
        this.startPointMesh = null
        this.createdPoints = []
        this.cursorPreview.visible = false
    }

    private getOrCreatePoint(event: PointerEvent | MouseEvent) {
        const existingPoint = getNearestSelectablePoint(
            event,
            this.camera,
            this.selectableObjects
        )

        if (existingPoint) {
            this.selectPoint(existingPoint)
            return { point: existingPoint, created: false }
        }

        const point = createPoint(
            getPointerIntersection(event, this.camera),
            getPointerPointSize(event)
        )

        this.scene.add(point)
        this.selectableObjects.push(point)
        this.createdPoints.push(point)

        return { point, created: true }
    }

    private removeCreatedPoint(point: THREE.Mesh) {
        this.scene.remove(point)
        const index = this.selectableObjects.indexOf(point)
        if (index >= 0) this.selectableObjects.splice(index, 1)
        this.createdPoints = this.createdPoints.filter((createdPoint) => createdPoint !== point)
        point.geometry.dispose()
    }

}
