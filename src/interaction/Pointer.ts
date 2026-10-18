import * as THREE from "three"

export const TOUCH_POINT_HIT_TOLERANCE_PX = 22
export const PEN_POINT_HIT_TOLERANCE_PX = 14
export const MOUSE_POINT_HIT_TOLERANCE_PX = 10

export const TOUCH_POINT_SIZE = 0.30
export const PEN_POINT_SIZE = 0.50
export const MOUSE_POINT_SIZE = 0.2
const HAS_COARSE_POINTER = window.matchMedia("(pointer: coarse)").matches

export const POINT_HIT_TOLERANCE_PX = MOUSE_POINT_HIT_TOLERANCE_PX
export const POINT_SIZE = MOUSE_POINT_SIZE

export const PREVIEW_POINT_SIZE = POINT_SIZE
export const LOCKED_POINT_SIZE = HAS_COARSE_POINTER ? 0.30 : POINT_SIZE
export const HEIGHT_POINT_SIZE = HAS_COARSE_POINTER ? 0.30 : POINT_SIZE
export const CONSTRAINED_POINT_SIZE = HAS_COARSE_POINTER ? 0.33 : POINT_SIZE * 1.1
export const SELECTED_POINT_DRAG_RADIUS_PX = 70

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
const planeIntersection = new THREE.Vector3()
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

export function getPointerOffset(event: PointerEvent | MouseEvent) {
  const pointerType = "pointerType" in event ? event.pointerType : "mouse"

  if (pointerType === "touch") {
    return { x: 0, y: 0 }
  }

  if (pointerType === "pen") {
    return { x: 0, y: 0 }
  }

  return { x: 0, y: 0 }
}

export function getPointerHitTolerance(event: PointerEvent | MouseEvent) {
  const pointerType = "pointerType" in event ? event.pointerType : "mouse"

  if (pointerType === "touch") return TOUCH_POINT_HIT_TOLERANCE_PX
  if (pointerType === "pen") return PEN_POINT_HIT_TOLERANCE_PX

  return POINT_HIT_TOLERANCE_PX
}

export function getPointerPointSize(event: PointerEvent | MouseEvent) {
  const pointerType = "pointerType" in event ? event.pointerType : "mouse"

  if (pointerType === "touch") return TOUCH_POINT_SIZE
  if (pointerType === "pen") return PEN_POINT_SIZE

  return POINT_SIZE
}

export function shouldShowPointerPreview(event: PointerEvent | MouseEvent) {
  return !("pointerType" in event) || event.pointerType === "mouse"
}

export function getPointerIntersection(
  event: PointerEvent | MouseEvent,
  camera: THREE.PerspectiveCamera,
  offset = getPointerOffset(event),
  y = 0
) {
  pointer.x = ((event.clientX + offset.x) / window.innerWidth) * 2 - 1
  pointer.y = -((event.clientY + offset.y) / window.innerHeight) * 2 + 1

  raycaster.setFromCamera(pointer, camera)
  groundPlane.constant = -y
  raycaster.ray.intersectPlane(groundPlane, planeIntersection)

  return planeIntersection.clone()
}

export function getNearestSelectablePoint(
  event: PointerEvent | MouseEvent,
  camera: THREE.PerspectiveCamera,
  selectableObjects: THREE.Object3D[],
  tolerancePx = getPointerHitTolerance(event)
): THREE.Mesh | null {
  let nearest: THREE.Mesh | null = null
  let nearestDistance = Infinity
  const projected = new THREE.Vector3()

  for (const object of selectableObjects) {
    if (!(object instanceof THREE.Mesh) || !object.visible) continue
    if (!object.userData.pointRole) continue

    object.getWorldPosition(projected)
    projected.project(camera)

    const x = (projected.x * 0.5 + 0.5) * window.innerWidth
    const y = (-projected.y * 0.5 + 0.5) * window.innerHeight
    const distance = Math.hypot(event.clientX - x, event.clientY - y)

    if (
      distance <= tolerancePx &&
      (
        distance < nearestDistance ||
        (
          Math.abs(distance - nearestDistance) < 0.001 &&
          object.userData.pointRole === "constrained" &&
          nearest?.userData.pointRole !== "constrained"
        )
      )
    ) {
      nearest = object
      nearestDistance = distance
    }
  }

  return nearest
}

export function updatePointCursor(
  event: PointerEvent | MouseEvent,
  camera: THREE.PerspectiveCamera,
  selectableObjects: THREE.Object3D[]
) {
  document.body.style.cursor = getNearestSelectablePoint(
    event,
    camera,
    selectableObjects
  )
    ? "pointer"
    : "default"
}
