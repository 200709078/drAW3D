import * as THREE from "three"
import { BaseTool } from "./BaseTool"
import { getNearestSelectablePoint, getPointerIntersection, getPointerPointSize, PREVIEW_POINT_SIZE, shouldShowPointerPreview, updatePointCursor } from "../interaction/Pointer"
import { createPoint } from "../objects/Point"
import { LineSegment } from "../objects/LineSegment"
import { Cone } from "../objects/Cone"

export class ConeTool extends BaseTool {
  selectableObjects: THREE.Object3D[]

  centerPoint: THREE.Mesh | null = null
  private centerPointCreated = false

  cursorPreview: THREE.Mesh
  radiusPreview: THREE.Line | null = null
  conePreview: THREE.Mesh | null = null
  basePreview: THREE.LineLoop | null = null
  heightPreview: THREE.Line | null = null

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    selectableObjects: THREE.Object3D[]
  ) {
    super(scene, camera)
    this.selectableObjects = selectableObjects

    this.cursorPreview = new THREE.Mesh(
      new THREE.SphereGeometry(PREVIEW_POINT_SIZE, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xff0000 })
    )
  }

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
    if (this.centerPoint && this.centerPointCreated) {
      this.removeCreatedPoint(this.centerPoint)
    }

    this.reset()
  }

  reset() {
    this.disposePreviewObject(this.radiusPreview)
    this.disposePreviewObject(this.conePreview)
    this.disposePreviewObject(this.basePreview)
    this.disposePreviewObject(this.heightPreview)

    this.radiusPreview = null
    this.conePreview = null
    this.basePreview = null
    this.heightPreview = null
    this.centerPoint = null
    this.centerPointCreated = false
    this.cursorPreview.visible = false
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

    if (!this.centerPoint) return

    const A = this.centerPoint.position.clone()
    const B = pos.clone()

    if (A.distanceTo(B) < 0.001) return

    this.updateRadiusPreview(A, B)
    this.updateConePreview(A, B)
  }

  onMouseMove(_event: MouseEvent) { }

  onPointerDown(event: PointerEvent) {
    const result = this.getOrCreatePoint(event)
    const point = result.point

    if (!this.centerPoint) {
      this.centerPoint = point
      this.centerPointCreated = result.created
      return
    }

    if (point === this.centerPoint || point.position.distanceTo(this.centerPoint.position) < 0.001) {
      if (result.created) this.removeCreatedPoint(point)
      return
    }

    const radiusSegment = new LineSegment(this.centerPoint, point)
    this.scene.add(radiusSegment.mesh)

    const ownedPoints = [
      ...(this.centerPointCreated ? [this.centerPoint] : []),
      ...(result.created ? [point] : []),
    ]

    const cone = new Cone(
      this.scene,
      this.selectableObjects,
      this.centerPoint,
      point,
      radiusSegment,
      ownedPoints
    )
    this.recordCreation(
      "Koni oluştur",
      [
        ...ownedPoints,
        radiusSegment.mesh,
        cone.apexPoint,
        cone.mesh,
        cone.baseLine,
        cone.heightLine,
        cone.slantLine,
        ...(cone.unFoldGroup ? [cone.unFoldGroup] : []),
      ],
      [radiusSegment, cone]
    )

    this.reset()
    this.complete()
  }

  onClick(event: MouseEvent) { this.onPointerDown(event as PointerEvent) }

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

    return { point, created: true }
  }

  private updateRadiusPreview(A: THREE.Vector3, B: THREE.Vector3) {
    if (this.radiusPreview) {
      this.scene.remove(this.radiusPreview)
      this.radiusPreview.geometry.dispose()
    }

    this.radiusPreview = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([A, B]),
      new THREE.LineBasicMaterial({ color: 0xff0000 })
    )
    this.scene.add(this.radiusPreview)
  }

  private updateConePreview(A: THREE.Vector3, B: THREE.Vector3) {
    const radius = A.distanceTo(B)
    const height = radius * 2
    const heightDirection = this.getHeightDirection(A, B)
    const apex = A.clone().add(heightDirection.clone().multiplyScalar(height))

    if (!this.conePreview) {
      this.conePreview = new THREE.Mesh(
        new THREE.ConeGeometry(1, 1, 64, 1, false),
        new THREE.MeshStandardMaterial({
          color: 0xd2a679,
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      )
      this.scene.add(this.conePreview)
    }

    this.conePreview.position.copy(
      new THREE.Vector3().addVectors(A, apex).multiplyScalar(0.5)
    )
    this.conePreview.scale.set(radius, height, radius)
    this.conePreview.quaternion.copy(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        heightDirection
      )
    )

    this.updateBasePreview(A, B, radius, heightDirection)
    this.updateHeightPreview(A, apex)
  }

  private updateBasePreview(
    center: THREE.Vector3,
    radiusPoint: THREE.Vector3,
    radius: number,
    heightDirection: THREE.Vector3
  ) {
    const geometry = new THREE.BufferGeometry().setFromPoints(
      this.createCirclePoints(center, radiusPoint, radius, heightDirection)
    )

    if (!this.basePreview) {
      this.basePreview = new THREE.LineLoop(
        geometry,
        new THREE.LineBasicMaterial({ color: 0x000000 })
      )
      this.scene.add(this.basePreview)
      return
    }

    this.basePreview.geometry.dispose()
    this.basePreview.geometry = geometry
  }

  private updateHeightPreview(A: THREE.Vector3, apex: THREE.Vector3) {
    const geometry = new THREE.BufferGeometry().setFromPoints([A, apex])

    if (!this.heightPreview) {
      this.heightPreview = new THREE.Line(
        geometry,
        new THREE.LineDashedMaterial({
          color: 0x800080,
          dashSize: 0.15,
          gapSize: 0.1,
        })
      )
      this.scene.add(this.heightPreview)
    } else {
      this.heightPreview.geometry.dispose()
      this.heightPreview.geometry = geometry
    }

    this.heightPreview.computeLineDistances()
  }

  private createCirclePoints(
    center: THREE.Vector3,
    radiusPoint: THREE.Vector3,
    radius: number,
    heightDirection: THREE.Vector3
  ) {
    const points: THREE.Vector3[] = []
    const segments = 96
    const radiusDirection = new THREE.Vector3()
      .subVectors(radiusPoint, this.centerPoint?.position ?? center)
      .normalize()
    const tangentDirection = new THREE.Vector3()
      .crossVectors(heightDirection, radiusDirection)
      .normalize()

    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2

      points.push(
        center
          .clone()
          .add(radiusDirection.clone().multiplyScalar(Math.cos(angle) * radius))
          .add(tangentDirection.clone().multiplyScalar(Math.sin(angle) * radius))
      )
    }

    return points
  }

  private getHeightDirection(A: THREE.Vector3, B: THREE.Vector3) {
    const radiusDirection = new THREE.Vector3().subVectors(B, A)

    if (radiusDirection.length() < 0.0001) {
      return new THREE.Vector3(0, 1, 0)
    }

    radiusDirection.normalize()

    const worldUp = new THREE.Vector3(0, 1, 0)
    const heightDirection = worldUp.sub(
      radiusDirection.clone().multiplyScalar(worldUp.dot(radiusDirection))
    )

    if (heightDirection.length() < 0.0001) {
      return new THREE.Vector3(1, 0, 0)
    }

    return heightDirection.normalize()
  }

  private disposePreviewObject(object: THREE.Object3D | null) {
    if (!object) return

    this.scene.remove(object)

    if ("geometry" in object && object.geometry instanceof THREE.BufferGeometry) {
      object.geometry.dispose()
    }
  }

  private removeCreatedPoint(point: THREE.Mesh) {
    this.scene.remove(point)
    const index = this.selectableObjects.indexOf(point)
    if (index >= 0) this.selectableObjects.splice(index, 1)
    point.geometry.dispose()
  }
}
