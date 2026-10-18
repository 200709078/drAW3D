import * as THREE from "three"

export function getNearestSelectablePoint(
    event: MouseEvent,
    camera: THREE.PerspectiveCamera,
    selectableObjects: THREE.Object3D[]
): THREE.Mesh | null {
    const mouse = new THREE.Vector2()

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1

    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(mouse, camera)

    const intersects = raycaster.intersectObjects(selectableObjects, false)

    if (intersects.length === 0) return null

    const hit = intersects[0].object

    if (hit instanceof THREE.Mesh) {
        return hit
    }

    return null
}

export function updatePointHoverCursor(
    event: MouseEvent,
    camera: THREE.PerspectiveCamera,
    selectableObjects: THREE.Object3D[]
) {
    const point = getNearestSelectablePoint(
        event,
        camera,
        selectableObjects
    )

    document.body.style.cursor = point ? "pointer" : "default"
}