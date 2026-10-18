import * as THREE from "three"
import { updateConstrainedPoints } from "../interaction/LineSegmentConstraint"
import { getRandomColor } from "../utils/color"

export class Plane {
    pointA: THREE.Mesh
    pointB: THREE.Mesh
    pointC: THREE.Mesh
    mesh: THREE.Mesh
    constrainedPoints: THREE.Mesh[] = []

    size = 30

    constructor(
        pointA: THREE.Mesh,
        pointB: THREE.Mesh,
        pointC: THREE.Mesh,
        selectableObjects?: THREE.Object3D[]
    ) {
        this.pointA = pointA
        this.pointB = pointB
        this.pointC = pointC

        const geometry = new THREE.PlaneGeometry(this.size, this.size)
        const material = new THREE.MeshStandardMaterial({
            color: getRandomColor(),
            transparent: true,
            opacity: 0.28,
            side: THREE.DoubleSide,
        })

        this.mesh = new THREE.Mesh(geometry, material)
        this.mesh.userData.selectableType = "solid"
        this.mesh.userData.owner = this

        selectableObjects?.push(this.mesh)

        this.pointA.userData.dependents ??= []
        this.pointB.userData.dependents ??= []
        this.pointC.userData.dependents ??= []

        this.pointA.userData.dependents.push(this)
        this.pointB.userData.dependents.push(this)
        this.pointC.userData.dependents.push(this)

        this.update()
    }

    update() {
        const a = this.pointA.position
        const b = this.pointB.position
        const c = this.pointC.position

        const ab = new THREE.Vector3().subVectors(b, a)
        const ac = new THREE.Vector3().subVectors(c, a)

        const normal = new THREE.Vector3()
            .crossVectors(ab, ac)
            .normalize()

        if (normal.length() === 0) return

        const center = new THREE.Vector3()
            .addVectors(a, b)
            .add(c)
            .multiplyScalar(1 / 3)

        this.mesh.position.copy(center)

        const quaternion = new THREE.Quaternion()
        quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 0, 1),
            normal
        )

        this.mesh.quaternion.copy(quaternion)
        updateConstrainedPoints(this)
    }
}
