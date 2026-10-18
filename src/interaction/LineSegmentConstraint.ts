import * as THREE from "three"
import { AngleObject } from "../objects/Angle"
import { Cone } from "../objects/Cone"
import { Cylinder } from "../objects/Cylinder"
import { LineObject } from "../objects/Line"
import { LineSegment } from "../objects/LineSegment"
import { Plane } from "../objects/Plane"
import { Prism } from "../objects/Prism"
import { Pyramid } from "../objects/Pyramid"
import { RayObject } from "../objects/Ray"
import { SphereObject } from "../objects/Sphere"

export const LINE_SEGMENT_POINT_COLOR = 0x0b6b3a

export type ObjectPointConstraint =
  | {
    type: "lineSegment"
    owner: LineSegment
    t: number
  }
  | {
    type: "line"
    owner: LineObject
    t: number
  }
  | {
    type: "ray"
    owner: RayObject
    t: number
  }
  | {
    type: "plane"
    owner: Plane
    u: number
    v: number
  }
  | {
    type: "sphere"
    owner: SphereObject
    direction: THREE.Vector3
  }
  | {
    type: "prismEdge"
    owner: Prism
    edgeIndex: number
    t: number
  }
  | {
    type: "prismFace"
    owner: Prism
    faceIndex: number
    u: number
    v: number
  }
  | {
    type: "pyramidEdge"
    owner: Pyramid
    edgeIndex: number
    t: number
  }
  | {
    type: "pyramidFace"
    owner: Pyramid
    faceIndex: number
    u: number
    v: number
  }
  | {
    type: "cylinderEdge"
    owner: Cylinder
    edge: "base" | "top"
    angle: number
  }
  | {
    type: "cylinderFace"
    owner: Cylinder
    face: "side" | "base" | "top"
    angle: number
    radial: number
    height: number
  }
  | {
    type: "coneEdge"
    owner: Cone
    angle: number
  }
  | {
    type: "coneFace"
    owner: Cone
    face: "side" | "base"
    angle: number
    radial: number
    height: number
  }
  | {
    type: "angleArm"
    owner: AngleObject
    arm: "AB" | "BC"
    t: number
  }
  | {
    type: "angleArc"
    owner: AngleObject
    t: number
  }

export type ObjectPointHit = {
  owner: SupportedOwner
  position: THREE.Vector3
  constraint: ObjectPointConstraint
}

type SupportedOwner = LineSegment | LineObject | RayObject | Plane | SphereObject | Prism | Pyramid | Cylinder | Cone | AngleObject

const PRISM_EDGE_HIT_WORLD_TOLERANCE = 0.35
const ROUND_EDGE_HIT_WORLD_TOLERANCE = 0.35

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
const closestOnRay = new THREE.Vector3()
const closestOnSegment = new THREE.Vector3()
const tempPoint = new THREE.Vector3()

export function getLineSegmentPointConstraint(
  object: THREE.Object3D
): ObjectPointConstraint | null {
  const constraint = object.userData.constraint

  if (!isObjectPointConstraint(constraint)) return null

  return constraint
}

export function setObjectPointConstraint(
  point: THREE.Mesh,
  constraint: ObjectPointConstraint
) {
  point.userData.pointRole = "constrained"
  point.userData.constraint = constraint
  addConstrainedPointToOwner(constraint.owner, point)
  updateLineSegmentConstrainedPoint(point)
}

export function removeObjectPointConstraint(point: THREE.Mesh) {
  const constraint = getLineSegmentPointConstraint(point)

  if (!constraint) return

  removeConstrainedPointFromOwner(constraint.owner, point)
}

export function updateLineSegmentConstrainedPoint(point: THREE.Mesh) {
  const constraint = getLineSegmentPointConstraint(point)

  if (!constraint) return

  point.position.copy(getPositionFromConstraint(constraint))
  updatePointDependents(point)
}

export function updateConstrainedPoints(owner: SupportedOwner) {
  getConstrainedPoints(owner).forEach((point) => {
    updateLineSegmentConstrainedPoint(point)
  })
}

export function movePointAlongLineSegmentFromPointer(
  point: THREE.Mesh,
  event: PointerEvent | MouseEvent,
  camera: THREE.PerspectiveCamera
) {
  const constraint = getLineSegmentPointConstraint(point)

  if (!constraint) return false

  const updated = getConstraintFromPointer(event, camera, constraint)
  point.position.copy(updated.position)
  point.userData.constraint = updated.constraint

  return true
}

export function updateConstraintFromPointPosition(object: THREE.Object3D) {
  const constraint = getLineSegmentPointConstraint(object)

  if (!constraint) return

  object.userData.constraint = getConstraintFromPosition(
    object.position,
    constraint
  ).constraint
}

export function getConstrainedPointDirection(object: THREE.Object3D) {
  const constraint = getLineSegmentPointConstraint(object)

  if (!constraint) return null

  if (constraint.type === "plane") {
    const basis = getPlaneBasis(constraint.owner)
    if (!basis) return null

    return [basis.uDirection, basis.vDirection]
  }

  if (constraint.type === "sphere") {
    return getSphereTangentDirections(constraint)
  }

  if (constraint.type === "prismFace") {
    const basis = getPrismFaceBasis(constraint.owner, constraint.faceIndex)
    if (!basis) return null

    return [basis.uDirection, basis.vDirection]
  }

  if (constraint.type === "pyramidFace") {
    const basis = getPyramidFaceBasis(constraint.owner, constraint.faceIndex)
    if (!basis) return null

    return [basis.uDirection, basis.vDirection]
  }

  if (constraint.type === "cylinderFace") {
    const frame = constraint.owner.getSurfaceFrame()
    if (!frame) return null

    if (constraint.face === "side") {
      return [
        getRoundTangent(frame.radiusDirection, frame.tangentDirection, constraint.angle),
        frame.heightDirection,
      ]
    }

    return [
      getRoundTangent(frame.radiusDirection, frame.tangentDirection, constraint.angle),
      getRoundDirection(frame.radiusDirection, frame.tangentDirection, constraint.angle),
    ]
  }

  if (constraint.type === "coneFace") {
    const frame = constraint.owner.getSurfaceFrame()
    if (!frame) return null

    return [
      getRoundTangent(frame.radiusDirection, frame.tangentDirection, constraint.angle),
      constraint.face === "side"
        ? new THREE.Vector3().subVectors(
          getConeFacePosition(constraint),
          frame.apex
        )
        : getRoundDirection(frame.radiusDirection, frame.tangentDirection, constraint.angle),
    ]
  }

  if (constraint.type === "angleArc") {
    const basis = getAngleBasis(constraint.owner)
    if (!basis) return null

    const position = getAngleArcPosition(constraint.owner, constraint.t)
    const radiusDirection = position.sub(constraint.owner.vertexB.position).normalize()
    const tangent = new THREE.Vector3().crossVectors(basis.normal, radiusDirection)

    return tangent.lengthSq() > 0.000001 ? [tangent] : null
  }

  const endpoints = getLinearEndpoints(constraint)
  if (!endpoints) return null

  const direction = new THREE.Vector3().subVectors(endpoints.end, endpoints.start)
  return direction.lengthSq() > 0.000001 ? [direction] : null
}

export function getObjectPointHit(
  event: PointerEvent | MouseEvent,
  camera: THREE.PerspectiveCamera,
  selectableObjects: THREE.Object3D[]
): ObjectPointHit | null {
  const meshes = selectableObjects.filter((object): object is THREE.Mesh =>
    object instanceof THREE.Mesh &&
    object.visible &&
    isSupportedOwner(object.userData.owner)
  )

  if (meshes.length === 0) return null

  setPointer(event, camera)

  const hit = raycaster.intersectObjects(meshes, false)[0]
  const owner = hit?.object.userData.owner

  if (!hit || !isSupportedOwner(owner)) return null

  return getConstraintFromHit(hit.object as THREE.Mesh, owner, hit.point, hit.faceIndex ?? 0)
}

function getConstraintFromHit(
  mesh: THREE.Mesh,
  owner: SupportedOwner,
  point: THREE.Vector3,
  triangleIndex: number
): ObjectPointHit | null {
  if (owner instanceof LineSegment) {
    return getLineSegmentConstraintFromPosition(owner, point)
  }

  if (owner instanceof LineObject) {
    return getLineConstraintFromPosition(owner, point)
  }

  if (owner instanceof RayObject) {
    return getRayConstraintFromPosition(owner, point)
  }

  if (owner instanceof Plane) {
    return getPlaneConstraintFromPosition(owner, point)
  }

  if (owner instanceof SphereObject) {
    return getSphereConstraintFromPosition(owner, point)
  }

  if (owner instanceof Prism) {
    return (
      getPrismEdgeConstraintFromPosition(owner, point, true) ??
      getPrismFaceConstraintFromPosition(owner, point, getPrismFaceIndex(owner, triangleIndex))
    )
  }

  if (owner instanceof Pyramid) {
    return (
      getPyramidEdgeConstraintFromPosition(owner, point, true) ??
      getPyramidFaceConstraintFromPosition(owner, point, getPyramidFaceIndex(owner, triangleIndex))
    )
  }

  if (owner instanceof Cylinder) {
    return getCylinderConstraintFromPosition(owner, point, triangleIndex)
  }

  if (owner instanceof Cone) {
    return getConeConstraintFromPosition(owner, point, triangleIndex)
  }

  if (owner instanceof AngleObject) {
    return getAngleConstraintFromHit(mesh, owner, point)
  }

  return null
}

function getConstraintFromPointer(
  event: PointerEvent | MouseEvent,
  camera: THREE.PerspectiveCamera,
  constraint: ObjectPointConstraint
): ObjectPointHit {
  setPointer(event, camera)

  if (constraint.type === "plane") {
    const basis = getPlaneBasis(constraint.owner)

    if (basis && raycaster.ray.intersectPlane(basis.plane, tempPoint)) {
      return getPlaneConstraintFromPosition(constraint.owner, tempPoint)
    }

    return {
      owner: constraint.owner,
      position: getPositionFromConstraint(constraint),
      constraint,
    }
  }

  if (constraint.type === "pyramidFace") {
    const basis = getPyramidFaceBasis(constraint.owner, constraint.faceIndex)

    if (basis && raycaster.ray.intersectPlane(basis.plane, tempPoint)) {
      return getPyramidFaceConstraintFromPosition(
        constraint.owner,
        tempPoint,
        constraint.faceIndex
      )
    }

    return fallbackHit(constraint)
  }

  if (constraint.type === "cylinderFace") {
    return getCylinderPointerConstraint(constraint, event, camera)
  }

  if (constraint.type === "coneFace") {
    return getConePointerConstraint(constraint, event, camera)
  }

  if (constraint.type === "angleArc") {
    const basis = getAngleBasis(constraint.owner)

    if (basis && raycaster.ray.intersectPlane(basis.plane, tempPoint)) {
      return getAngleArcConstraintFromPosition(constraint.owner, tempPoint)
    }

    return fallbackHit(constraint)
  }

  if (constraint.type === "sphere") {
    const sphere = getSphereGeometry(constraint.owner)

    if (sphere.radius > 0.000001) {
      const hit = raycaster.ray.intersectSphere(
        new THREE.Sphere(sphere.center, sphere.radius),
        tempPoint
      )

      if (hit) {
        return getSphereConstraintFromPosition(constraint.owner, hit)
      }

      raycaster.ray.closestPointToPoint(sphere.center, tempPoint)
      return getSphereConstraintFromPosition(constraint.owner, tempPoint)
    }

    return {
      owner: constraint.owner,
      position: getPositionFromConstraint(constraint),
      constraint,
    }
  }

  if (constraint.type === "prismEdge") {
    const endpoints = constraint.owner.getEdgeEndpoints(constraint.edgeIndex)

    if (!endpoints) {
      return {
        owner: constraint.owner,
        position: getPositionFromConstraint(constraint),
        constraint,
      }
    }

    raycaster.ray.distanceSqToSegment(
      endpoints.start,
      endpoints.end,
      closestOnRay,
      closestOnSegment
    )

    return getPrismEdgeConstraintFromPosition(
      constraint.owner,
      closestOnSegment,
      false,
      constraint.edgeIndex
    ) ?? {
      owner: constraint.owner,
      position: getPositionFromConstraint(constraint),
      constraint,
    }
  }

  if (constraint.type === "prismFace") {
    const basis = getPrismFaceBasis(constraint.owner, constraint.faceIndex)

    if (basis && raycaster.ray.intersectPlane(basis.plane, tempPoint)) {
      return getPrismFaceConstraintFromPosition(
        constraint.owner,
        tempPoint,
        constraint.faceIndex
      )
    }

    return {
      owner: constraint.owner,
      position: getPositionFromConstraint(constraint),
      constraint,
    }
  }

  if (constraint.type === "pyramidEdge") {
    const endpoints = constraint.owner.getEdgeEndpoints(constraint.edgeIndex)

    if (!endpoints) return fallbackHit(constraint)

    raycaster.ray.distanceSqToSegment(
      endpoints.start,
      endpoints.end,
      closestOnRay,
      closestOnSegment
    )

    return getPyramidEdgeConstraintFromPosition(
      constraint.owner,
      closestOnSegment,
      false,
      constraint.edgeIndex
    ) ?? fallbackHit(constraint)
  }

  if (constraint.type === "cylinderEdge") {
    return getCylinderPointerConstraint(constraint, event, camera)
  }

  if (constraint.type === "coneEdge") {
    return getConePointerConstraint(constraint, event, camera)
  }

  const endpoints = getLinearEndpoints(constraint)

  if (!endpoints) {
    return {
      owner: constraint.owner,
      position: getPositionFromConstraint(constraint),
      constraint,
    }
  }

  raycaster.ray.distanceSqToSegment(
    endpoints.start,
    endpoints.end,
    closestOnRay,
    closestOnSegment
  )

  return getConstraintFromPosition(closestOnSegment, constraint)
}

function getConstraintFromPosition(
  point: THREE.Vector3,
  constraint: ObjectPointConstraint
): ObjectPointHit {
  if (constraint.type === "lineSegment") {
    return getLineSegmentConstraintFromPosition(constraint.owner, point)
  }

  if (constraint.type === "line") {
    return getLineConstraintFromPosition(constraint.owner, point)
  }

  if (constraint.type === "ray") {
    return getRayConstraintFromPosition(constraint.owner, point)
  }

  if (constraint.type === "sphere") {
    return getSphereConstraintFromPosition(constraint.owner, point)
  }

  if (constraint.type === "prismEdge") {
    return getPrismEdgeConstraintFromPosition(
      constraint.owner,
      point,
      false,
      constraint.edgeIndex
    ) ?? {
      owner: constraint.owner,
      position: getPositionFromConstraint(constraint),
      constraint,
    }
  }

  if (constraint.type === "prismFace") {
    return getPrismFaceConstraintFromPosition(
      constraint.owner,
      point,
      constraint.faceIndex
    )
  }

  if (constraint.type === "pyramidEdge") {
    return getPyramidEdgeConstraintFromPosition(
      constraint.owner,
      point,
      false,
      constraint.edgeIndex
    ) ?? fallbackHit(constraint)
  }

  if (constraint.type === "pyramidFace") {
    return getPyramidFaceConstraintFromPosition(
      constraint.owner,
      point,
      constraint.faceIndex
    )
  }

  if (constraint.type === "cylinderEdge" || constraint.type === "cylinderFace") {
    return getCylinderConstraintFromPosition(constraint.owner, point, 0, constraint)
  }

  if (constraint.type === "coneEdge" || constraint.type === "coneFace") {
    return getConeConstraintFromPosition(constraint.owner, point, 0, constraint)
  }

  if (constraint.type === "angleArm") {
    return getAngleArmConstraintFromPosition(constraint.owner, constraint.arm, point)
  }

  if (constraint.type === "angleArc") {
    return getAngleArcConstraintFromPosition(constraint.owner, point)
  }

  return getPlaneConstraintFromPosition(constraint.owner, point)
}

function getLineSegmentConstraintFromPosition(
  owner: LineSegment,
  point: THREE.Vector3
): ObjectPointHit {
  const start = owner.startPoint.position
  const end = owner.endPoint.position
  const projection = projectToSegment(start, end, point)

  return {
    owner,
    position: projection.position,
    constraint: {
      type: "lineSegment",
      owner,
      t: projection.t,
    },
  }
}

function getLineConstraintFromPosition(
  owner: LineObject,
  point: THREE.Vector3
): ObjectPointHit {
  const endpoints = getLineVisualEndpoints(owner)
  const projection = projectToSegment(endpoints.start, endpoints.end, point)

  return {
    owner,
    position: projection.position,
    constraint: {
      type: "line",
      owner,
      t: projection.t,
    },
  }
}

function getRayConstraintFromPosition(
  owner: RayObject,
  point: THREE.Vector3
): ObjectPointHit {
  const endpoints = getRayVisualEndpoints(owner)
  const projection = projectToSegment(endpoints.start, endpoints.end, point)

  return {
    owner,
    position: projection.position,
    constraint: {
      type: "ray",
      owner,
      t: projection.t,
    },
  }
}

function getPlaneConstraintFromPosition(
  owner: Plane,
  point: THREE.Vector3
): ObjectPointHit {
  const basis = getPlaneBasis(owner)

  if (!basis) {
    return {
      owner,
      position: owner.pointA.position.clone(),
      constraint: {
        type: "plane",
        owner,
        u: 0,
        v: 0,
      },
    }
  }

  const offset = new THREE.Vector3().subVectors(point, basis.center)
  const halfSize = owner.size / 2
  const u = THREE.MathUtils.clamp(offset.dot(basis.uDirection), -halfSize, halfSize)
  const v = THREE.MathUtils.clamp(offset.dot(basis.vDirection), -halfSize, halfSize)

  return {
    owner,
    position: basis.center
      .clone()
      .add(basis.uDirection.clone().multiplyScalar(u))
      .add(basis.vDirection.clone().multiplyScalar(v)),
    constraint: {
      type: "plane",
      owner,
      u,
      v,
    },
  }
}

function getSphereConstraintFromPosition(
  owner: SphereObject,
  point: THREE.Vector3
): ObjectPointHit {
  const sphere = getSphereGeometry(owner)
  const direction = new THREE.Vector3().subVectors(point, sphere.center)

  if (direction.lengthSq() < 0.000001) {
    direction.subVectors(owner.surfacePoint.position, owner.centerPoint.position)
  }

  if (direction.lengthSq() < 0.000001) {
    direction.set(1, 0, 0)
  }

  direction.normalize()

  return {
    owner,
    position: sphere.center.clone().add(direction.clone().multiplyScalar(sphere.radius)),
    constraint: {
      type: "sphere",
      owner,
      direction,
    },
  }
}

function getPrismEdgeConstraintFromPosition(
  owner: Prism,
  point: THREE.Vector3,
  enforceHitTolerance: boolean,
  preferredEdgeIndex?: number
): ObjectPointHit | null {
  const edgeCount = owner.getEdgeCount()
  let nearest:
    | {
      edgeIndex: number
      position: THREE.Vector3
      t: number
      distance: number
    }
    | null = null

  for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex++) {
    if (preferredEdgeIndex !== undefined && edgeIndex !== preferredEdgeIndex) {
      continue
    }

    const endpoints = owner.getEdgeEndpoints(edgeIndex)
    if (!endpoints) continue

    const projection = projectToSegment(endpoints.start, endpoints.end, point)
    const distance = projection.position.distanceTo(point)

    if (!nearest || distance < nearest.distance) {
      nearest = {
        edgeIndex,
        position: projection.position,
        t: projection.t,
        distance,
      }
    }
  }

  if (!nearest) return null

  if (enforceHitTolerance && nearest.distance > PRISM_EDGE_HIT_WORLD_TOLERANCE) {
    return null
  }

  return {
    owner,
    position: nearest.position,
    constraint: {
      type: "prismEdge",
      owner,
      edgeIndex: nearest.edgeIndex,
      t: nearest.t,
    },
  }
}

function getPrismFaceConstraintFromPosition(
  owner: Prism,
  point: THREE.Vector3,
  faceIndex: number
): ObjectPointHit {
  const basis = getPrismFaceBasis(owner, faceIndex)

  if (!basis) {
    return {
      owner,
      position: owner.pointA.position.clone(),
      constraint: {
        type: "prismFace",
        owner,
        faceIndex,
        u: 0,
        v: 0,
      },
    }
  }

  let local = new THREE.Vector3().subVectors(point, basis.origin)
  let rawU = local.dot(basis.uDirection) / basis.uLength
  let rawV = local.dot(basis.vDirection) / basis.vLength

  if (basis.polygon) {
    const clampedPosition = clampPointToConvexPolygon(
      getPrismFacePosition(basis, rawU, rawV),
      basis.vertices,
      basis.normal
    )

    local = new THREE.Vector3().subVectors(clampedPosition, basis.origin)
    rawU = local.dot(basis.uDirection) / basis.uLength
    rawV = local.dot(basis.vDirection) / basis.vLength
  }

  const u = THREE.MathUtils.clamp(rawU, 0, 1)
  const v = THREE.MathUtils.clamp(rawV, 0, 1)
  const position = getPrismFacePosition(basis, u, v)

  return {
    owner,
    position,
    constraint: {
      type: "prismFace",
      owner,
      faceIndex,
      u,
      v,
    },
  }
}

function getPyramidEdgeConstraintFromPosition(
  owner: Pyramid,
  point: THREE.Vector3,
  enforceHitTolerance: boolean,
  preferredEdgeIndex?: number
): ObjectPointHit | null {
  const edgeCount = owner.getEdgeCount()
  let nearest:
    | { edgeIndex: number; position: THREE.Vector3; t: number; distance: number }
    | null = null

  for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex++) {
    if (preferredEdgeIndex !== undefined && edgeIndex !== preferredEdgeIndex) continue

    const endpoints = owner.getEdgeEndpoints(edgeIndex)
    if (!endpoints) continue

    const projection = projectToSegment(endpoints.start, endpoints.end, point)
    const distance = projection.position.distanceTo(point)

    if (!nearest || distance < nearest.distance) {
      nearest = { edgeIndex, position: projection.position, t: projection.t, distance }
    }
  }

  if (!nearest) return null
  if (enforceHitTolerance && nearest.distance > PRISM_EDGE_HIT_WORLD_TOLERANCE) return null

  return {
    owner,
    position: nearest.position,
    constraint: {
      type: "pyramidEdge",
      owner,
      edgeIndex: nearest.edgeIndex,
      t: nearest.t,
    },
  }
}

function getPyramidFaceConstraintFromPosition(
  owner: Pyramid,
  point: THREE.Vector3,
  faceIndex: number
): ObjectPointHit {
  const basis = getPyramidFaceBasis(owner, faceIndex)

  if (!basis) {
    return {
      owner,
      position: owner.pointA.position.clone(),
      constraint: { type: "pyramidFace", owner, faceIndex, u: 0, v: 0 },
    }
  }

  let local = new THREE.Vector3().subVectors(point, basis.origin)
  let u = local.dot(basis.uDirection) / basis.uLength
  let v = local.dot(basis.vDirection) / basis.vLength

  if (basis.triangle) {
    u = THREE.MathUtils.clamp(u, 0, 1)
    v = THREE.MathUtils.clamp(v, 0, 1)

    if (u + v > 1) {
      const sum = u + v
      u /= sum
      v /= sum
    }
  } else if (basis.polygon) {
    const clampedPosition = clampPointToConvexPolygon(
      getPyramidFacePosition(basis, u, v),
      basis.vertices,
      basis.normal
    )

    local = new THREE.Vector3().subVectors(clampedPosition, basis.origin)
    u = THREE.MathUtils.clamp(local.dot(basis.uDirection) / basis.uLength, 0, 1)
    v = THREE.MathUtils.clamp(local.dot(basis.vDirection) / basis.vLength, 0, 1)
  } else {
    u = THREE.MathUtils.clamp(u, 0, 1)
    v = THREE.MathUtils.clamp(v, 0, 1)
  }

  return {
    owner,
    position: getPyramidFacePosition(basis, u, v),
    constraint: { type: "pyramidFace", owner, faceIndex, u, v },
  }
}

function getCylinderConstraintFromPosition(
  owner: Cylinder,
  point: THREE.Vector3,
  triangleIndex: number,
  existing?: Extract<ObjectPointConstraint, { type: "cylinderEdge" | "cylinderFace" }>
): ObjectPointHit {
  const frame = owner.getSurfaceFrame()
  if (!frame) return fallbackOwnerHit(owner, owner.baseCenterPoint.position)

  const local = new THREE.Vector3().subVectors(point, frame.baseCenter)
  const h = THREE.MathUtils.clamp(local.dot(frame.heightDirection) / frame.height, 0, 1)
  const radialVector = local.clone().sub(frame.heightDirection.clone().multiplyScalar(local.dot(frame.heightDirection)))
  const angle = getRoundAngle(frame, radialVector)
  const radial = THREE.MathUtils.clamp(radialVector.length() / frame.radius, 0, 1)

  if (existing?.type === "cylinderEdge") {
    return getCylinderEdgeHit(owner, existing.edge, angle)
  }

  if (existing?.type === "cylinderFace") {
    return getCylinderFaceHit(owner, existing.face, angle, radial, h)
  }

  const face = getCylinderFaceKind(triangleIndex)
  const edge = getNearestCylinderEdge(frame, point, angle)

  if (edge && edge.distance <= ROUND_EDGE_HIT_WORLD_TOLERANCE) {
    return getCylinderEdgeHit(owner, edge.edge, angle)
  }

  return getCylinderFaceHit(owner, face, angle, radial, h)
}

function getConeConstraintFromPosition(
  owner: Cone,
  point: THREE.Vector3,
  triangleIndex: number,
  existing?: Extract<ObjectPointConstraint, { type: "coneEdge" | "coneFace" }>
): ObjectPointHit {
  const frame = owner.getSurfaceFrame()
  if (!frame) return fallbackOwnerHit(owner, owner.baseCenterPoint.position)

  const local = new THREE.Vector3().subVectors(point, frame.baseCenter)
  const h = THREE.MathUtils.clamp(local.dot(frame.heightDirection) / frame.height, 0, 1)
  const radialVector = local.clone().sub(frame.heightDirection.clone().multiplyScalar(local.dot(frame.heightDirection)))
  const angle = getRoundAngle(frame, radialVector)
  const radial = THREE.MathUtils.clamp(radialVector.length() / frame.radius, 0, 1)

  if (existing?.type === "coneEdge") {
    return getConeEdgeHit(owner, angle)
  }

  if (existing?.type === "coneFace") {
    return getConeFaceHit(owner, existing.face, angle, radial, h)
  }

  const edgePoint = getRoundPoint(frame.baseCenter, frame.radius, frame.radiusDirection, frame.tangentDirection, angle)
  const edgeDistance = edgePoint.distanceTo(point)

  if (edgeDistance <= ROUND_EDGE_HIT_WORLD_TOLERANCE) {
    return getConeEdgeHit(owner, angle)
  }

  return getConeFaceHit(owner, getConeFaceKind(triangleIndex), angle, radial, h)
}

function getAngleConstraintFromHit(mesh: THREE.Mesh, owner: AngleObject, point: THREE.Vector3) {
  if (mesh === owner.lineAB) {
    return getAngleArmConstraintFromPosition(owner, "AB", point)
  }

  if (mesh === owner.lineBC) {
    return getAngleArmConstraintFromPosition(owner, "BC", point)
  }

  if (mesh === owner.arc) {
    return getAngleArcConstraintFromPosition(owner, point)
  }

  return null
}

function getPositionFromConstraint(constraint: ObjectPointConstraint) {
  if (constraint.type === "lineSegment") {
    return interpolateLinear(
      constraint.owner.startPoint.position,
      constraint.owner.endPoint.position,
      constraint.t
    )
  }

  if (constraint.type === "line") {
    const endpoints = getLineVisualEndpoints(constraint.owner)
    return interpolateLinear(endpoints.start, endpoints.end, constraint.t)
  }

  if (constraint.type === "ray") {
    const endpoints = getRayVisualEndpoints(constraint.owner)
    return interpolateLinear(endpoints.start, endpoints.end, constraint.t)
  }

  if (constraint.type === "sphere") {
    const sphere = getSphereGeometry(constraint.owner)
    return sphere.center
      .clone()
      .add(constraint.direction.clone().normalize().multiplyScalar(sphere.radius))
  }

  if (constraint.type === "prismEdge") {
    const endpoints = constraint.owner.getEdgeEndpoints(constraint.edgeIndex)
    if (!endpoints) return constraint.owner.pointA.position.clone()

    return interpolateLinear(endpoints.start, endpoints.end, constraint.t)
  }

  if (constraint.type === "prismFace") {
    const basis = getPrismFaceBasis(constraint.owner, constraint.faceIndex)
    if (!basis) return constraint.owner.pointA.position.clone()

    return getPrismFacePosition(basis, constraint.u, constraint.v)
  }

  if (constraint.type === "pyramidEdge") {
    const endpoints = constraint.owner.getEdgeEndpoints(constraint.edgeIndex)
    if (!endpoints) return constraint.owner.pointA.position.clone()

    return interpolateLinear(endpoints.start, endpoints.end, constraint.t)
  }

  if (constraint.type === "pyramidFace") {
    const basis = getPyramidFaceBasis(constraint.owner, constraint.faceIndex)
    if (!basis) return constraint.owner.pointA.position.clone()

    return getPyramidFacePosition(basis, constraint.u, constraint.v)
  }

  if (constraint.type === "cylinderEdge") {
    return getCylinderEdgeHit(constraint.owner, constraint.edge, constraint.angle).position
  }

  if (constraint.type === "cylinderFace") {
    return getCylinderFacePosition(constraint)
  }

  if (constraint.type === "coneEdge") {
    return getConeEdgeHit(constraint.owner, constraint.angle).position
  }

  if (constraint.type === "coneFace") {
    return getConeFacePosition(constraint)
  }

  if (constraint.type === "angleArm") {
    const endpoints = getAngleArmEndpoints(constraint.owner, constraint.arm)
    return interpolateLinear(endpoints.start, endpoints.end, constraint.t)
  }

  if (constraint.type === "angleArc") {
    return getAngleArcPosition(constraint.owner, constraint.t)
  }

  const basis = getPlaneBasis(constraint.owner)

  if (!basis) return constraint.owner.pointA.position.clone()

  return basis.center
    .clone()
    .add(basis.uDirection.clone().multiplyScalar(constraint.u))
    .add(basis.vDirection.clone().multiplyScalar(constraint.v))
}

function getLinearEndpoints(constraint: ObjectPointConstraint) {
  if (constraint.type === "lineSegment") {
    return {
      start: constraint.owner.startPoint.position,
      end: constraint.owner.endPoint.position,
    }
  }

  if (constraint.type === "line") {
    return getLineVisualEndpoints(constraint.owner)
  }

  if (constraint.type === "ray") {
    return getRayVisualEndpoints(constraint.owner)
  }

  if (constraint.type === "prismEdge") {
    return constraint.owner.getEdgeEndpoints(constraint.edgeIndex)
  }

  if (constraint.type === "pyramidEdge") {
    return constraint.owner.getEdgeEndpoints(constraint.edgeIndex)
  }

  if (constraint.type === "angleArm") {
    return getAngleArmEndpoints(constraint.owner, constraint.arm)
  }

  return null
}

function getLineVisualEndpoints(owner: LineObject) {
  const a = owner.pointA.position
  const b = owner.pointB.position
  const direction = new THREE.Vector3().subVectors(b, a)

  if (direction.lengthSq() < 0.000001) {
    return {
      start: a.clone(),
      end: a.clone(),
    }
  }

  direction.normalize()

  const center = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5)

  return {
    start: center.clone().add(direction.clone().multiplyScalar(-owner.length / 2)),
    end: center.clone().add(direction.clone().multiplyScalar(owner.length / 2)),
  }
}

function getRayVisualEndpoints(owner: RayObject) {
  const start = owner.startPoint.position
  const direction = new THREE.Vector3()
    .subVectors(owner.directionPoint.position, start)

  if (direction.lengthSq() < 0.000001) {
    return {
      start: start.clone(),
      end: start.clone(),
    }
  }

  return {
    start: start.clone(),
    end: start.clone().add(direction.normalize().multiplyScalar(owner.length)),
  }
}

function getPlaneBasis(owner: Plane) {
  const a = owner.pointA.position
  const b = owner.pointB.position
  const c = owner.pointC.position
  const ab = new THREE.Vector3().subVectors(b, a)
  const ac = new THREE.Vector3().subVectors(c, a)
  const normal = new THREE.Vector3().crossVectors(ab, ac)

  if (ab.lengthSq() < 0.000001 || normal.lengthSq() < 0.000001) return null

  const center = new THREE.Vector3()
    .addVectors(a, b)
    .add(c)
    .multiplyScalar(1 / 3)
  const uDirection = ab.normalize()

  normal.normalize()

  const vDirection = new THREE.Vector3()
    .crossVectors(normal, uDirection)
    .normalize()
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, center)

  return {
    center,
    normal,
    plane,
    uDirection,
    vDirection,
  }
}

function getPrismFaceIndex(owner: Prism, triangleIndex: number) {
  const faceCount = owner.getFaceCount()
  const sideCount = faceCount - 2

  if (sideCount < 3) return 0

  const baseTriangleCount = sideCount - 2

  if (triangleIndex < baseTriangleCount) return 0
  if (triangleIndex < baseTriangleCount * 2) return 1

  const sideTriangleIndex = triangleIndex - baseTriangleCount * 2
  return THREE.MathUtils.clamp(2 + Math.floor(sideTriangleIndex / 2), 2, faceCount - 1)
}

function getPrismFaceBasis(owner: Prism, faceIndex: number) {
  const vertices = owner.getFaceVertices(faceIndex)

  if (!vertices || vertices.length < 3) return null

  if (faceIndex >= 2 && vertices.length >= 4) {
    const origin = vertices[0]
    const uVector = new THREE.Vector3().subVectors(vertices[1], vertices[0])
    const vVector = new THREE.Vector3().subVectors(vertices[3], vertices[0])
    const normal = new THREE.Vector3().crossVectors(uVector, vVector)

    if (
      uVector.lengthSq() < 0.000001 ||
      vVector.lengthSq() < 0.000001 ||
      normal.lengthSq() < 0.000001
    ) {
      return null
    }

    normal.normalize()

    return {
      normal,
      origin,
      plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin),
      polygon: false,
      uDirection: uVector.clone().normalize(),
      uLength: uVector.length(),
      vertices,
      vDirection: vVector.clone().normalize(),
      vLength: vVector.length(),
    }
  }

  const center = vertices
    .reduce((sum, vertex) => sum.add(vertex), new THREE.Vector3())
    .multiplyScalar(1 / vertices.length)
  const uVector = new THREE.Vector3().subVectors(vertices[0], center)
  const normal = new THREE.Vector3()

  for (let i = 1; i < vertices.length - 1; i++) {
    normal.crossVectors(
      new THREE.Vector3().subVectors(vertices[i], vertices[0]),
      new THREE.Vector3().subVectors(vertices[i + 1], vertices[0])
    )

    if (normal.lengthSq() >= 0.000001) break
  }

  if (uVector.lengthSq() < 0.000001 || normal.lengthSq() < 0.000001) {
    return null
  }

  normal.normalize()

  const vDirection = new THREE.Vector3().crossVectors(normal, uVector).normalize()
  const radius = vertices.reduce(
    (max, vertex) => Math.max(max, vertex.distanceTo(center)),
    0
  )

  if (radius < 0.000001) return null

  return {
    normal,
    origin: center.clone()
      .add(uVector.clone().normalize().multiplyScalar(-radius))
      .add(vDirection.clone().multiplyScalar(-radius)),
    plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, center),
    polygon: true,
    uDirection: uVector.clone().normalize(),
    uLength: radius * 2,
    vertices,
    vDirection,
    vLength: radius * 2,
  }
}

function getPrismFacePosition(
  basis: NonNullable<ReturnType<typeof getPrismFaceBasis>>,
  u: number,
  v: number
) {
  const position = basis.origin
    .clone()
    .add(basis.uDirection.clone().multiplyScalar(basis.uLength * THREE.MathUtils.clamp(u, 0, 1)))
    .add(basis.vDirection.clone().multiplyScalar(basis.vLength * THREE.MathUtils.clamp(v, 0, 1)))

  return basis.polygon
    ? clampPointToConvexPolygon(position, basis.vertices, basis.normal)
    : position
}

function getPyramidFaceIndex(owner: Pyramid, triangleIndex: number) {
  const faceCount = owner.getFaceCount()
  const sideCount = faceCount - 1

  if (sideCount < 3) return 0

  const baseTriangleCount = sideCount - 2
  if (triangleIndex < baseTriangleCount) return 0

  return THREE.MathUtils.clamp(1 + (triangleIndex - baseTriangleCount), 1, faceCount - 1)
}

function getPyramidFaceBasis(owner: Pyramid, faceIndex: number) {
  const vertices = owner.getFaceVertices(faceIndex)
  if (!vertices || vertices.length < 3) return null

  if (vertices.length === 3) {
    const origin = vertices[0]
    const uVector = new THREE.Vector3().subVectors(vertices[1], vertices[0])
    const vVector = new THREE.Vector3().subVectors(vertices[2], vertices[0])
    const normal = new THREE.Vector3().crossVectors(uVector, vVector)

    if (
      uVector.lengthSq() < 0.000001 ||
      vVector.lengthSq() < 0.000001 ||
      normal.lengthSq() < 0.000001
    ) return null

    normal.normalize()

    return {
      normal,
      origin,
      plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin),
      polygon: false,
      triangle: true,
      uDirection: uVector.clone().normalize(),
      uLength: uVector.length(),
      vertices,
      vDirection: vVector.clone().normalize(),
      vLength: vVector.length(),
    }
  }

  const center = vertices
    .reduce((sum, vertex) => sum.add(vertex), new THREE.Vector3())
    .multiplyScalar(1 / vertices.length)
  const uVector = new THREE.Vector3().subVectors(vertices[0], center)
  const normal = new THREE.Vector3()

  for (let i = 1; i < vertices.length - 1; i++) {
    normal.crossVectors(
      new THREE.Vector3().subVectors(vertices[i], vertices[0]),
      new THREE.Vector3().subVectors(vertices[i + 1], vertices[0])
    )

    if (normal.lengthSq() >= 0.000001) break
  }

  if (uVector.lengthSq() < 0.000001 || normal.lengthSq() < 0.000001) return null

  normal.normalize()

  const vDirection = new THREE.Vector3().crossVectors(normal, uVector).normalize()
  const radius = vertices.reduce((max, vertex) => Math.max(max, vertex.distanceTo(center)), 0)

  if (radius < 0.000001) return null

  return {
    normal,
    origin: center.clone()
      .add(uVector.clone().normalize().multiplyScalar(-radius))
      .add(vDirection.clone().multiplyScalar(-radius)),
    plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, center),
    polygon: true,
    triangle: false,
    uDirection: uVector.clone().normalize(),
    uLength: radius * 2,
    vertices,
    vDirection,
    vLength: radius * 2,
  }
}

function getPyramidFacePosition(
  basis: NonNullable<ReturnType<typeof getPyramidFaceBasis>>,
  u: number,
  v: number
) {
  const position = basis.origin
    .clone()
    .add(basis.uDirection.clone().multiplyScalar(basis.uLength * THREE.MathUtils.clamp(u, 0, 1)))
    .add(basis.vDirection.clone().multiplyScalar(basis.vLength * THREE.MathUtils.clamp(v, 0, 1)))

  return basis.polygon
    ? clampPointToConvexPolygon(position, basis.vertices, basis.normal)
    : position
}

function getCylinderPointerConstraint(
  constraint: Extract<ObjectPointConstraint, { type: "cylinderEdge" | "cylinderFace" }>,
  _event: PointerEvent | MouseEvent,
  _camera: THREE.PerspectiveCamera
) {
  const point = getClosestPointToRoundOwner(constraint.owner)
  return getCylinderConstraintFromPosition(constraint.owner, point, 0, constraint)
}

function getConePointerConstraint(
  constraint: Extract<ObjectPointConstraint, { type: "coneEdge" | "coneFace" }>,
  _event: PointerEvent | MouseEvent,
  _camera: THREE.PerspectiveCamera
) {
  const point = getClosestPointToRoundOwner(constraint.owner)
  return getConeConstraintFromPosition(constraint.owner, point, 0, constraint)
}

function getClosestPointToRoundOwner(owner: Cylinder | Cone) {
  const frame = owner.getSurfaceFrame()
  if (!frame) return new THREE.Vector3()

  raycaster.ray.closestPointToPoint(frame.baseCenter, tempPoint)
  return tempPoint.clone()
}

function getCylinderFaceKind(triangleIndex: number): "side" | "base" | "top" {
  if (triangleIndex < 128) return "side"
  if (triangleIndex < 192) return "top"
  return "base"
}

function getConeFaceKind(triangleIndex: number): "side" | "base" {
  return triangleIndex < 64 ? "side" : "base"
}

function getCylinderEdgeHit(owner: Cylinder, edge: "base" | "top", angle: number): ObjectPointHit {
  const frame = owner.getSurfaceFrame()
  if (!frame) return fallbackOwnerHit(owner, owner.baseCenterPoint.position)

  const center = edge === "base" ? frame.baseCenter : frame.topCenter
  const position = getRoundPoint(center, frame.radius, frame.radiusDirection, frame.tangentDirection, angle)

  return {
    owner,
    position,
    constraint: { type: "cylinderEdge", owner, edge, angle },
  }
}

function getCylinderFaceHit(
  owner: Cylinder,
  face: "side" | "base" | "top",
  angle: number,
  radial: number,
  height: number
): ObjectPointHit {
  const constraint = {
    type: "cylinderFace" as const,
    owner,
    face,
    angle,
    radial,
    height,
  }

  return {
    owner,
    position: getCylinderFacePosition(constraint),
    constraint,
  }
}

function getCylinderFacePosition(constraint: Extract<ObjectPointConstraint, { type: "cylinderFace" }>) {
  const frame = constraint.owner.getSurfaceFrame()
  if (!frame) return constraint.owner.baseCenterPoint.position.clone()

  if (constraint.face === "side") {
    const center = frame.baseCenter
      .clone()
      .add(frame.heightDirection.clone().multiplyScalar(frame.height * THREE.MathUtils.clamp(constraint.height, 0, 1)))
    return getRoundPoint(center, frame.radius, frame.radiusDirection, frame.tangentDirection, constraint.angle)
  }

  const center = constraint.face === "base" ? frame.baseCenter : frame.topCenter
  return getRoundPoint(
    center,
    frame.radius * THREE.MathUtils.clamp(constraint.radial, 0, 1),
    frame.radiusDirection,
    frame.tangentDirection,
    constraint.angle
  )
}

function getConeEdgeHit(owner: Cone, angle: number): ObjectPointHit {
  const frame = owner.getSurfaceFrame()
  if (!frame) return fallbackOwnerHit(owner, owner.baseCenterPoint.position)

  return {
    owner,
    position: getRoundPoint(frame.baseCenter, frame.radius, frame.radiusDirection, frame.tangentDirection, angle),
    constraint: { type: "coneEdge", owner, angle },
  }
}

function getConeFaceHit(
  owner: Cone,
  face: "side" | "base",
  angle: number,
  radial: number,
  height: number
): ObjectPointHit {
  const constraint = {
    type: "coneFace" as const,
    owner,
    face,
    angle,
    radial,
    height,
  }

  return {
    owner,
    position: getConeFacePosition(constraint),
    constraint,
  }
}

function getConeFacePosition(constraint: Extract<ObjectPointConstraint, { type: "coneFace" }>) {
  const frame = constraint.owner.getSurfaceFrame()
  if (!frame) return constraint.owner.baseCenterPoint.position.clone()

  if (constraint.face === "base") {
    return getRoundPoint(
      frame.baseCenter,
      frame.radius * THREE.MathUtils.clamp(constraint.radial, 0, 1),
      frame.radiusDirection,
      frame.tangentDirection,
      constraint.angle
    )
  }

  const height = THREE.MathUtils.clamp(constraint.height, 0, 1)
  const center = frame.baseCenter
    .clone()
    .add(frame.heightDirection.clone().multiplyScalar(frame.height * height))
  const radius = frame.radius * (1 - height)

  return getRoundPoint(center, radius, frame.radiusDirection, frame.tangentDirection, constraint.angle)
}

function getNearestCylinderEdge(
  frame: NonNullable<ReturnType<Cylinder["getSurfaceFrame"]>>,
  point: THREE.Vector3,
  angle: number
) {
  const basePoint = getRoundPoint(frame.baseCenter, frame.radius, frame.radiusDirection, frame.tangentDirection, angle)
  const topPoint = getRoundPoint(frame.topCenter, frame.radius, frame.radiusDirection, frame.tangentDirection, angle)
  const baseDistance = basePoint.distanceTo(point)
  const topDistance = topPoint.distanceTo(point)

  return baseDistance <= topDistance
    ? { distance: baseDistance, edge: "base" as const }
    : { distance: topDistance, edge: "top" as const }
}

function getRoundPoint(
  center: THREE.Vector3,
  radius: number,
  radiusDirection: THREE.Vector3,
  tangentDirection: THREE.Vector3,
  angle: number
) {
  return center
    .clone()
    .add(radiusDirection.clone().multiplyScalar(Math.cos(angle) * radius))
    .add(tangentDirection.clone().multiplyScalar(Math.sin(angle) * radius))
}

function getRoundDirection(
  radiusDirection: THREE.Vector3,
  tangentDirection: THREE.Vector3,
  angle: number
) {
  return radiusDirection
    .clone()
    .multiplyScalar(Math.cos(angle))
    .add(tangentDirection.clone().multiplyScalar(Math.sin(angle)))
    .normalize()
}

function getRoundTangent(
  radiusDirection: THREE.Vector3,
  tangentDirection: THREE.Vector3,
  angle: number
) {
  return radiusDirection
    .clone()
    .multiplyScalar(-Math.sin(angle))
    .add(tangentDirection.clone().multiplyScalar(Math.cos(angle)))
    .normalize()
}

function getRoundAngle(
  frame: Pick<NonNullable<ReturnType<Cylinder["getSurfaceFrame"]>>, "radiusDirection" | "tangentDirection">,
  vector: THREE.Vector3
) {
  if (vector.lengthSq() < 0.000001) return 0

  return Math.atan2(vector.dot(frame.tangentDirection), vector.dot(frame.radiusDirection))
}

function getAngleArmConstraintFromPosition(
  owner: AngleObject,
  arm: "AB" | "BC",
  point: THREE.Vector3
): ObjectPointHit {
  const endpoints = getAngleArmEndpoints(owner, arm)
  const projection = projectToSegment(endpoints.start, endpoints.end, point)

  return {
    owner,
    position: projection.position,
    constraint: { type: "angleArm", owner, arm, t: projection.t },
  }
}

function getAngleArcConstraintFromPosition(owner: AngleObject, point: THREE.Vector3): ObjectPointHit {
  const basis = getAngleBasis(owner)

  if (!basis) return getAngleArmConstraintFromPosition(owner, "AB", point)

  const fromVertex = new THREE.Vector3().subVectors(point, owner.vertexB.position)
  const x = fromVertex.dot(basis.startDirection)
  const y = fromVertex.dot(basis.perpendicularDirection)
  const angle = Math.atan2(y, x)
  const t = THREE.MathUtils.clamp(angle / basis.angle, 0, 1)

  return {
    owner,
    position: getAngleArcPosition(owner, t),
    constraint: { type: "angleArc", owner, t },
  }
}

function getAngleArmEndpoints(owner: AngleObject, arm: "AB" | "BC") {
  return arm === "AB"
    ? { start: owner.pointA.position, end: owner.vertexB.position }
    : { start: owner.vertexB.position, end: owner.pointC.position }
}

function getAngleBasis(owner: AngleObject) {
  const startRaw = new THREE.Vector3().subVectors(owner.pointA.position, owner.vertexB.position)
  const endRaw = new THREE.Vector3().subVectors(owner.pointC.position, owner.vertexB.position)

  if (startRaw.lengthSq() < 0.000001 || endRaw.lengthSq() < 0.000001) return null

  const startDirection = startRaw.normalize()
  const endDirection = endRaw.normalize()
  const normal = new THREE.Vector3().crossVectors(startDirection, endDirection)

  if (normal.lengthSq() < 0.000001) return null

  normal.normalize()

  const angle = startDirection.angleTo(endDirection)
  const perpendicularDirection = new THREE.Vector3()
    .crossVectors(normal, startDirection)
    .normalize()

  return {
    angle,
    normal,
    perpendicularDirection,
    plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, owner.vertexB.position),
    startDirection,
  }
}

function getAngleArcPosition(owner: AngleObject, t: number) {
  const basis = getAngleBasis(owner)
  if (!basis) return owner.vertexB.position.clone()

  const direction = basis.startDirection
    .clone()
    .applyAxisAngle(basis.normal, basis.angle * THREE.MathUtils.clamp(t, 0, 1))

  return owner.vertexB.position.clone().add(direction.multiplyScalar(owner.arcRadius))
}

function getSphereGeometry(owner: SphereObject) {
  const center = owner.centerPoint.position.clone()
  const radius = owner.centerPoint.position.distanceTo(owner.surfacePoint.position)

  return {
    center,
    radius,
  }
}

function getSphereTangentDirections(constraint: Extract<ObjectPointConstraint, { type: "sphere" }>) {
  const normal = constraint.direction.clone().normalize()

  if (normal.lengthSq() < 0.000001) return null

  const reference = Math.abs(normal.y) < 0.9
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0)
  const tangentA = new THREE.Vector3().crossVectors(normal, reference).normalize()
  const tangentB = new THREE.Vector3().crossVectors(normal, tangentA).normalize()

  return [tangentA, tangentB]
}

function projectToSegment(start: THREE.Vector3, end: THREE.Vector3, point: THREE.Vector3) {
  const segment = new THREE.Vector3().subVectors(end, start)
  const lengthSq = segment.lengthSq()

  if (lengthSq < 0.000001) {
    return {
      position: start.clone(),
      t: 0,
    }
  }

  const t = THREE.MathUtils.clamp(
    new THREE.Vector3().subVectors(point, start).dot(segment) / lengthSq,
    0,
    1
  )

  return {
    position: start.clone().add(segment.multiplyScalar(t)),
    t,
  }
}

function interpolateLinear(start: THREE.Vector3, end: THREE.Vector3, t: number) {
  return start.clone().lerp(end, THREE.MathUtils.clamp(t, 0, 1))
}

function clampPointToConvexPolygon(
  point: THREE.Vector3,
  vertices: THREE.Vector3[],
  normal: THREE.Vector3
) {
  if (vertices.length < 3) return point.clone()

  if (isPointInsideConvexPolygon(point, vertices, normal)) {
    return point.clone()
  }

  let closest = vertices[0].clone()
  let closestDistanceSq = Infinity

  for (let i = 0; i < vertices.length; i++) {
    const start = vertices[i]
    const end = vertices[(i + 1) % vertices.length]
    const candidate = projectToSegment(start, end, point).position
    const distanceSq = candidate.distanceToSquared(point)

    if (distanceSq < closestDistanceSq) {
      closest = candidate
      closestDistanceSq = distanceSq
    }
  }

  return closest
}

function isPointInsideConvexPolygon(
  point: THREE.Vector3,
  vertices: THREE.Vector3[],
  normal: THREE.Vector3
) {
  const epsilon = 0.0001
  let positive = false
  let negative = false

  for (let i = 0; i < vertices.length; i++) {
    const start = vertices[i]
    const end = vertices[(i + 1) % vertices.length]
    const edge = new THREE.Vector3().subVectors(end, start)
    const toPoint = new THREE.Vector3().subVectors(point, start)
    const side = new THREE.Vector3().crossVectors(edge, toPoint).dot(normal)

    if (side > epsilon) positive = true
    if (side < -epsilon) negative = true
    if (positive && negative) return false
  }

  return true
}

function fallbackHit(constraint: ObjectPointConstraint): ObjectPointHit {
  return {
    owner: constraint.owner,
    position: getPositionFromConstraint(constraint),
    constraint,
  }
}

function fallbackOwnerHit(owner: SupportedOwner, position: THREE.Vector3): ObjectPointHit {
  if (owner instanceof Cylinder) {
    return getCylinderFaceHit(owner, "side", 0, 1, 0)
  }

  if (owner instanceof Cone) {
    return getConeFaceHit(owner, "side", 0, 1, 0)
  }

  return {
    owner,
    position: position.clone(),
    constraint: {
      type: "lineSegment",
      owner: owner as LineSegment,
      t: 0,
    },
  }
}

function addConstrainedPointToOwner(owner: SupportedOwner, point: THREE.Mesh) {
  const target = owner as SupportedOwner & { constrainedPoints?: THREE.Mesh[] }

  target.constrainedPoints ??= []

  if (!target.constrainedPoints.includes(point)) {
    target.constrainedPoints.push(point)
  }
}

function removeConstrainedPointFromOwner(owner: SupportedOwner, point: THREE.Mesh) {
  const target = owner as SupportedOwner & { constrainedPoints?: THREE.Mesh[] }

  target.constrainedPoints = (target.constrainedPoints ?? []).filter(
    (constrainedPoint) => constrainedPoint !== point
  )
}

function getConstrainedPoints(owner: SupportedOwner) {
  const target = owner as SupportedOwner & { constrainedPoints?: THREE.Mesh[] }

  return target.constrainedPoints ?? []
}

function updatePointDependents(point: THREE.Object3D) {
  const dependents = point.userData.dependents

  if (!Array.isArray(dependents)) return

  dependents.forEach((dependent) => {
    if (dependent && typeof dependent.update === "function") {
      dependent.update()
    }
  })
}

function isObjectPointConstraint(value: unknown): value is ObjectPointConstraint {
  if (!value || typeof value !== "object") return false

  const constraint = value as { type?: unknown; owner?: unknown }

  return (
    constraint.type === "lineSegment" ||
    constraint.type === "line" ||
    constraint.type === "ray" ||
    constraint.type === "plane" ||
    constraint.type === "sphere" ||
    constraint.type === "prismEdge" ||
    constraint.type === "prismFace" ||
    constraint.type === "pyramidEdge" ||
    constraint.type === "pyramidFace" ||
    constraint.type === "cylinderEdge" ||
    constraint.type === "cylinderFace" ||
    constraint.type === "coneEdge" ||
    constraint.type === "coneFace" ||
    constraint.type === "angleArm" ||
    constraint.type === "angleArc"
  ) && isSupportedOwner(constraint.owner)
}

function isSupportedOwner(owner: unknown): owner is SupportedOwner {
  return (
    owner instanceof LineSegment ||
    owner instanceof LineObject ||
    owner instanceof RayObject ||
    owner instanceof Plane ||
    owner instanceof SphereObject ||
    owner instanceof Prism ||
    owner instanceof Pyramid ||
    owner instanceof Cylinder ||
    owner instanceof Cone ||
    owner instanceof AngleObject
  )
}

function setPointer(event: PointerEvent | MouseEvent, camera: THREE.PerspectiveCamera) {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1

  raycaster.setFromCamera(pointer, camera)
}
