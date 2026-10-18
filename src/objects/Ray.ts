import * as THREE from "three"
import { updateConstrainedPoints } from "../interaction/LineSegmentConstraint"
import { getRandomColor } from "../utils/color"

const RAY_RADIUS = 0.1
const RAY_RADIAL_SEGMENTS = 32

export class RayObject {
    startPoint: THREE.Mesh
    directionPoint: THREE.Mesh
    mesh: THREE.Mesh
    length: number
    constrainedPoints: THREE.Mesh[] = []

    constructor(
        startPoint: THREE.Mesh,
        directionPoint: THREE.Mesh,
        length = 50,
        selectableObjects?: THREE.Object3D[]
    ) {
        this.startPoint = startPoint
        this.directionPoint = directionPoint
        this.length = length

        const geometry = new THREE.CylinderGeometry(
            RAY_RADIUS,
            RAY_RADIUS,
            1,
            RAY_RADIAL_SEGMENTS
        )
        const material = new THREE.MeshStandardMaterial({ color: getRandomColor() })

        this.mesh = new THREE.Mesh(geometry, material)
        this.mesh.castShadow = true
        this.mesh.receiveShadow = true
        this.mesh.userData.selectableType = "solid"
        this.mesh.userData.owner = this

        selectableObjects?.push(this.mesh)

        this.startPoint.userData.dependents ??= []
        this.directionPoint.userData.dependents ??= []

        this.startPoint.userData.dependents.push(this)
        this.directionPoint.userData.dependents.push(this)
        this.update()
    }

    update() {
        const start = this.startPoint.position
        const directionTarget = this.directionPoint.position

        const direction = new THREE.Vector3()
            .subVectors(directionTarget, start)
            .normalize()

        const end = new THREE.Vector3()
            .copy(start)
            .add(direction.multiplyScalar(this.length))

        const midpoint = new THREE.Vector3()
            .addVectors(start, end)
            .multiplyScalar(0.5)

        this.mesh.position.copy(midpoint)
        this.mesh.scale.set(1, this.length, 1)

        const quaternion = new THREE.Quaternion()
        quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3().subVectors(end, start).normalize()
        )

        this.mesh.quaternion.copy(quaternion)
        updateConstrainedPoints(this)
    }
}
