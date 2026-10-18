import * as THREE from "three"
import { createPoint } from "./Point"
import { LineSegment } from "./LineSegment"
import { HEIGHT_POINT_SIZE, LOCKED_POINT_SIZE } from "../interaction/Pointer"
import { updateConstrainedPoints } from "../interaction/LineSegmentConstraint"
import { getRandomColor } from "../utils/color"
import { PyramidUnfolder } from "../unfold/PyramidUnfolder"

export class Pyramid {
    pointA: THREE.Mesh
    pointB: THREE.Mesh
    pointC: THREE.Mesh

    apexPoint: THREE.Mesh
    centerPoint: THREE.Mesh
    cornerPoints: THREE.Mesh[] = []

    mesh: THREE.Mesh
    initialEdge: LineSegment | null = null
    baseLine: THREE.LineLoop
    heightLine: THREE.Line
    sideLines: THREE.LineSegments
    ownedPoints: THREE.Mesh[] = []
    constrainedPoints: THREE.Mesh[] = []

    selectableObjects: THREE.Object3D[]

    sideCount: number
    height: number
    unFoldAngle = 0
    unFoldGroup: THREE.Group | null = null
    private unFolder: PyramidUnfolder | null = null

    constructor(
        scene: THREE.Scene,
        selectableObjects: THREE.Object3D[],
        pointA: THREE.Mesh,
        pointB: THREE.Mesh,
        sideCount = 4,
        initialEdge?: LineSegment,
        ownedPoints: THREE.Mesh[] = []
    ) {
        this.selectableObjects = selectableObjects

        this.pointA = pointA
        this.pointB = pointB
        this.initialEdge = initialEdge ?? null
        this.ownedPoints = ownedPoints
        this.sideCount = sideCount
        this.height = pointA.position.distanceTo(pointB.position)

        const pointCObject = createPoint(
            this.createInitialC(pointA.position, pointB.position),
            this.getPointRadius(pointA)
        )

        this.pointC = pointCObject
        this.apexPoint = this.createPurplePoint(pointA.position.clone())
        this.centerPoint = this.createGrayPoint(pointA.position.clone())


        this.pointA.userData.pointRole ??= "free"
        this.pointB.userData.pointRole ??= "free"
        this.pointC.userData.pointRole = "free"
        this.apexPoint.userData.pointRole = "height"
        this.centerPoint.userData.pointRole = "locked"
        this.pointC.userData.owner = this
        this.apexPoint.userData.owner = this
        this.centerPoint.userData.owner = this
        this.ownedPoints.forEach((point) => {
            point.userData.owner = this
        })

        scene.add(this.pointC)
        scene.add(this.apexPoint)
        scene.add(this.centerPoint)

        selectableObjects.push(this.pointC)
        selectableObjects.push(this.apexPoint)
        selectableObjects.push(this.centerPoint)

        this.mesh = new THREE.Mesh(
            new THREE.BufferGeometry(),
            new THREE.MeshStandardMaterial({
                color: getRandomColor(),
                transparent: true,
                opacity: 0.55,
                side: THREE.DoubleSide,
            })
        )
        this.mesh.userData.selectableType = "solid"
        this.mesh.userData.owner = this
        selectableObjects.push(this.mesh)

        this.baseLine = new THREE.LineLoop(
            new THREE.BufferGeometry(),
            new THREE.LineBasicMaterial({ color: 0x000000 })
        )

        this.sideLines = new THREE.LineSegments(
            new THREE.BufferGeometry(),
            new THREE.LineBasicMaterial({ color: 0x000000 })
        )

        this.heightLine = new THREE.Line(
            new THREE.BufferGeometry(),
            new THREE.LineDashedMaterial({
                color: 0x800080,
                dashSize: 0.15,
                gapSize: 0.1,
            })
        )

        this.unFoldGroup = new THREE.Group()
        this.unFoldGroup.name = "PyramidUnFoldGroup"
        this.unFolder = new PyramidUnfolder(this.unFoldGroup)

        scene.add(this.mesh)
        scene.add(this.baseLine)
        scene.add(this.sideLines)
        scene.add(this.heightLine)
        scene.add(this.unFoldGroup)

        this.pointA.userData.dependents ??= []
        this.pointB.userData.dependents ??= []
        this.pointC.userData.dependents ??= []
        this.apexPoint.userData.dependents ??= []

        this.pointA.userData.dependents.push(this)
        this.pointB.userData.dependents.push(this)
        this.pointC.userData.dependents.push(this)

        this.update()
    }

    onBeforeDelete() {
        if (!this.initialEdge) return

        this.removeDependent(this.pointA, this.initialEdge)
        this.removeDependent(this.pointB, this.initialEdge)
    }

    getOwnedObjectsForDeletion() {
        const objects: Array<THREE.Object3D | null> = [
            ...this.ownedPoints,
            this.pointC,
            this.apexPoint,
            this.centerPoint,
            this.mesh,
            this.initialEdge?.mesh ?? null,
            this.baseLine,
            this.heightLine,
            this.sideLines,
            this.unFoldGroup,
            ...this.cornerPoints,
            ...this.constrainedPoints,
        ]

        return objects.filter((object): object is THREE.Object3D => object instanceof THREE.Object3D)
    }

    setSideCount(n: number) {
        this.sideCount = n
        this.update()
    }

    setUnFoldAngle(angle: number) {
        this.unFoldAngle = THREE.MathUtils.clamp(angle, 0, this.getMaxUnFoldAngle())
        this.updateUnFold()
    }

    getMaxUnFoldAngle() {
        const baseVertices = this.createPolygonVertices()

        if (baseVertices.length < 3) return 0

        const normal = this.getBaseNormal()

        if (!normal) return 0

        normal.multiplyScalar(-1)

        const center = this.getPolygonCenter(baseVertices)
        const apex = center.clone().add(
            normal.clone().multiplyScalar(this.height)
        )
        const edgeStart = baseVertices[0]
        const edgeEnd = baseVertices[1]
        const edgeAxis = new THREE.Vector3()
            .subVectors(edgeEnd, edgeStart)
            .normalize()
        const sideNormal = new THREE.Vector3()
            .crossVectors(edgeAxis, new THREE.Vector3().subVectors(apex, edgeStart))

        if (sideNormal.length() < 0.0001) return 0

        sideNormal.normalize()

        const normalAngle = THREE.MathUtils.radToDeg(sideNormal.angleTo(normal))
        const acutePlaneAngle = Math.min(normalAngle, 180 - normalAngle)

        return THREE.MathUtils.clamp(180 - acutePlaneAngle, 0, 180)
    }

    moveAlongNormal(delta: number) {
        this.height += delta
        this.update()
    }

    update() {
        const baseVertices = this.createPolygonVertices()
        if (baseVertices.length < 3) return

        const normal = this.getBaseNormal()
        if (!normal) return

        normal.multiplyScalar(-1)

        const center = this.getPolygonCenter(baseVertices)
        const apex = center.clone().add(
            normal.clone().multiplyScalar(this.height)
        )

        this.centerPoint.position.copy(center)
        this.apexPoint.position.copy(apex)

        this.updateDependentsOf(this.centerPoint)
        this.updateDependentsOf(this.apexPoint)

        this.updateBaseLine(baseVertices)
        this.updateSideLines(baseVertices, apex)
        this.updateHeightLine(center, apex)
        this.updateCornerPoints(baseVertices)
        this.updateMesh(baseVertices, apex)
        this.unFoldAngle = THREE.MathUtils.clamp(this.unFoldAngle, 0, this.getMaxUnFoldAngle())
        this.updateUnFold(baseVertices, apex)
        updateConstrainedPoints(this)
    }

    getEdgeCount() {
        const baseVertices = this.createPolygonVertices()
        return baseVertices.length >= 3 ? baseVertices.length * 2 : 0
    }

    getEdgeEndpoints(edgeIndex: number) {
        const geometry = this.getCurrentGeometry()
        if (!geometry) return null

        const n = geometry.baseVertices.length
        const normalizedIndex = THREE.MathUtils.clamp(Math.floor(edgeIndex), 0, n * 2 - 1)

        if (normalizedIndex < n) {
            return {
                start: geometry.baseVertices[normalizedIndex].clone(),
                end: geometry.baseVertices[(normalizedIndex + 1) % n].clone(),
            }
        }

        const sideIndex = normalizedIndex - n

        return {
            start: geometry.baseVertices[sideIndex].clone(),
            end: geometry.apex.clone(),
        }
    }

    getFaceCount() {
        const baseVertices = this.createPolygonVertices()
        return baseVertices.length >= 3 ? baseVertices.length + 1 : 0
    }

    getFaceVertices(faceIndex: number) {
        const geometry = this.getCurrentGeometry()
        if (!geometry) return null

        if (faceIndex === 0) {
            return geometry.baseVertices.map((vertex) => vertex.clone())
        }

        const sideIndex = faceIndex - 1
        if (sideIndex < 0 || sideIndex >= geometry.baseVertices.length) return null

        return [
            geometry.baseVertices[sideIndex].clone(),
            geometry.baseVertices[(sideIndex + 1) % geometry.baseVertices.length].clone(),
            geometry.apex.clone(),
        ]
    }

    private getCurrentGeometry() {
        const baseVertices = this.createPolygonVertices()
        if (baseVertices.length < 3) return null

        const normal = this.getBaseNormal()
        if (!normal) return null

        normal.multiplyScalar(-1)

        const center = this.getPolygonCenter(baseVertices)
        const apex = center.clone().add(normal.clone().multiplyScalar(this.height))

        return { apex, baseVertices }
    }

    updateUnFold(
        baseVertices = this.createPolygonVertices(),
        apex?: THREE.Vector3
    ) {
        if (baseVertices.length < 3) {
            this.unFolder?.update({
                baseVertices: [],
                apex: new THREE.Vector3(),
                angle: 0,
            })
            return
        }

        if (!apex) {
            const normal = this.getBaseNormal()

            if (!normal) {
                this.unFolder?.update({
                    baseVertices: [],
                    apex: new THREE.Vector3(),
                    angle: 0,
                })
                return
            }

            normal.multiplyScalar(-1)
            apex = this.getPolygonCenter(baseVertices)
                .add(normal.multiplyScalar(this.height))
        }

        this.unFolder?.update({
            baseVertices,
            apex,
            angle: this.unFoldAngle,
        })
    }

    private createPurplePoint(position: THREE.Vector3) {
        const geometry = new THREE.SphereGeometry(HEIGHT_POINT_SIZE, 24, 24)

        const material = new THREE.MeshStandardMaterial({
            color: 0x800080,
        })

        const mesh = new THREE.Mesh(geometry, material)
        mesh.position.copy(position)

        mesh.userData.pointRole = "height"
        mesh.userData.owner = this
        mesh.userData.lockMouseDrag = true
        mesh.userData.normalWheelController = this
        mesh.userData.dependents ??= []

        return mesh
    }

    private createGrayPoint(position: THREE.Vector3) {
        const geometry = new THREE.SphereGeometry(LOCKED_POINT_SIZE, 24, 24)

        const material = new THREE.MeshStandardMaterial({
            color: 0x808080,
        })

        const mesh = new THREE.Mesh(geometry, material)
        mesh.position.copy(position)

        mesh.userData.pointRole = "locked"
        mesh.userData.owner = this
        mesh.userData.lockMouseDrag = true
        mesh.userData.lockWheel = true
        mesh.userData.dependents ??= []

        return mesh
    }
    private createInitialC(A: THREE.Vector3, B: THREE.Vector3) {
        const AB = new THREE.Vector3().subVectors(B, A)
        const length = AB.length()

        const mid = new THREE.Vector3()
            .addVectors(A, B)
            .multiplyScalar(0.5)

        const ABxz = new THREE.Vector3(AB.x, 0, AB.z)

        if (ABxz.length() < 0.0001) {
            return mid.clone().add(new THREE.Vector3(1, 0, 0))
        }

        ABxz.normalize()

        const perpendicular = new THREE.Vector3(
            -ABxz.z,
            0,
            ABxz.x
        )

        return mid.add(perpendicular.multiplyScalar(length))
    }

    private createPolygonVertices() {
        const A = this.pointA.position.clone()
        const B = this.pointB.position.clone()
        const C = this.pointC.position.clone()

        const n = this.sideCount
        const theta = (2 * Math.PI) / n

        const AB = new THREE.Vector3().subVectors(B, A)
        const AC = new THREE.Vector3().subVectors(C, A)

        const sideLength = AB.length()

        if (sideLength < 0.0001) {
            return [A]
        }

        let normal = new THREE.Vector3().crossVectors(AB, AC)

        if (normal.length() < 0.0001) {
            return [A, B]
        }

        normal.normalize()

        const mid = new THREE.Vector3()
            .addVectors(A, B)
            .multiplyScalar(0.5)

        let perpendicularInPlane = new THREE.Vector3()
            .crossVectors(normal, AB)
            .normalize()

        const centerDistance = sideLength / (2 * Math.tan(Math.PI / n))

        if (new THREE.Vector3().subVectors(C, mid).dot(perpendicularInPlane) > 0) {
            perpendicularInPlane.multiplyScalar(-1)
        }

        const center = mid
            .clone()
            .add(perpendicularInPlane.multiplyScalar(centerDistance))

        const testB = this.rotateAroundAxis(A, center, normal, theta)

        if (testB.distanceTo(B) > 0.001) {
            normal.multiplyScalar(-1)
        }

        const vertices: THREE.Vector3[] = []

        for (let i = 0; i < n; i++) {
            vertices.push(
                this.rotateAroundAxis(A, center, normal, theta * i)
            )
        }

        return vertices
    }

    private getBaseNormal() {
        const A = this.pointA.position.clone()
        const B = this.pointB.position.clone()
        const C = this.pointC.position.clone()

        const AB = new THREE.Vector3().subVectors(B, A)
        const AC = new THREE.Vector3().subVectors(C, A)

        const normal = new THREE.Vector3().crossVectors(AB, AC)

        if (normal.length() < 0.0001) {
            return null
        }

        return normal.normalize()
    }

    private getPolygonCenter(vertices: THREE.Vector3[]) {
        const center = new THREE.Vector3()

        for (const vertex of vertices) {
            center.add(vertex)
        }

        return center.divideScalar(vertices.length)
    }

    private updateBaseLine(baseVertices: THREE.Vector3[]) {
        this.baseLine.geometry.dispose()
        this.baseLine.geometry = new THREE.BufferGeometry().setFromPoints(baseVertices)
    }

    private updateSideLines(
        baseVertices: THREE.Vector3[],
        apex: THREE.Vector3
    ) {
        const points: THREE.Vector3[] = []

        for (const vertex of baseVertices) {
            points.push(vertex.clone())
            points.push(apex.clone())
        }

        this.sideLines.geometry.dispose()
        this.sideLines.geometry = new THREE.BufferGeometry().setFromPoints(points)
    }

    private updateHeightLine(center: THREE.Vector3, apex: THREE.Vector3) {
        this.heightLine.geometry.dispose()
        this.heightLine.geometry = new THREE.BufferGeometry().setFromPoints([
            center,
            apex,
        ])
        this.heightLine.computeLineDistances()
    }

    private updateCornerPoints(baseVertices: THREE.Vector3[]) {
        const verticesForGrayPoints = baseVertices.slice(2)

        while (this.cornerPoints.length < verticesForGrayPoints.length) {
            const point = this.createGrayPoint(new THREE.Vector3())

            this.cornerPoints.push(point)
            this.selectableObjects.push(point)
            this.mesh.parent?.add(point)
        }

        for (let i = 0; i < verticesForGrayPoints.length; i++) {
            this.cornerPoints[i].position.copy(verticesForGrayPoints[i])
            this.cornerPoints[i].visible = true

            this.updateDependentsOf(this.cornerPoints[i])
        }

        for (let i = verticesForGrayPoints.length; i < this.cornerPoints.length; i++) {
            this.cornerPoints[i].visible = false
        }
    }

    private updateMesh(
        baseVertices: THREE.Vector3[],
        apex: THREE.Vector3
    ) {
        const n = baseVertices.length

        const vertices: number[] = []
        const indices: number[] = []

        for (const p of baseVertices) {
            vertices.push(p.x, p.y, p.z)
        }

        vertices.push(apex.x, apex.y, apex.z)

        const apexIndex = n

        for (let i = 1; i < n - 1; i++) {
            indices.push(0, i, i + 1)
        }

        for (let i = 0; i < n; i++) {
            const next = (i + 1) % n
            indices.push(i, next, apexIndex)
        }

        const geometry = new THREE.BufferGeometry()

        geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(vertices, 3)
        )

        geometry.setIndex(indices)
        geometry.computeVertexNormals()

        this.mesh.geometry.dispose()
        this.mesh.geometry = geometry
    }

    private updateDependentsOf(object: THREE.Object3D) {
        object.userData.dependents?.forEach((dependent: any) => {
            if (dependent === this) return

            dependent.update?.()
        })
    }

    private rotateAroundAxis(
        point: THREE.Vector3,
        center: THREE.Vector3,
        axis: THREE.Vector3,
        angle: number
    ) {
        return point
            .clone()
            .sub(center)
            .applyAxisAngle(axis, angle)
            .add(center)
    }

    getHeightDirection() {
        const direction = new THREE.Vector3()
            .subVectors(this.apexPoint.position, this.centerPoint.position)

        if (direction.length() < 0.0001) {
            return new THREE.Vector3(0, 1, 0)
        }

        return direction.normalize()
    }

    private removeDependent(point: THREE.Object3D, dependent: unknown) {
        const dependents = point.userData.dependents

        if (!Array.isArray(dependents)) return

        point.userData.dependents = dependents.filter((item: unknown) => item !== dependent)
    }

    private getPointRadius(point: THREE.Mesh) {
        const geometry = point.geometry as THREE.BufferGeometry & {
            parameters?: { radius?: number }
        }

        return geometry.parameters?.radius
    }
}
