import * as THREE from "three"
import { BaseTool } from "./BaseTool"
import { createPoint } from "../objects/Point"
import { AngleObject } from "../objects/Angle"
import { getNearestSelectablePoint, getPointerIntersection, getPointerPointSize, PREVIEW_POINT_SIZE, shouldShowPointerPreview, updatePointCursor } from "../interaction/Pointer"

export class AngleTool extends BaseTool {
  points: THREE.Mesh[] = []
  createdPoints: THREE.Mesh[] = []
  selectableObjects: THREE.Object3D[]

  cursorPreview: THREE.Mesh
  previewLineAB: THREE.Line | null = null
  previewLineBC: THREE.Line | null = null
  previewArc: THREE.Mesh | null = null
  previewLabel: THREE.Sprite | null = null

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    selectableObjects: THREE.Object3D[]
  ) {
    super(scene, camera)

    this.selectableObjects = selectableObjects

    const geo = new THREE.SphereGeometry(PREVIEW_POINT_SIZE, 16, 16)
    const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 })

    this.cursorPreview = new THREE.Mesh(geo, mat)
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

    if (this.points.length === 1) {
      this.updatePreviewLine(this.points[0].position.clone(), pos, "AB")
    }

    if (this.points.length === 2) {
      this.updatePreviewLine(
        this.points[0].position.clone(),
        this.points[1].position.clone(),
        "AB"
      )
      this.updatePreviewLine(this.points[1].position.clone(), pos, "BC")
      this.updatePreviewArc(
        this.points[0].position.clone(),
        this.points[1].position.clone(),
        pos
      )
      this.updatePreviewLabel(
        this.points[0].position.clone(),
        this.points[1].position.clone(),
        pos
      )
      return
    }

    this.clearPreviewLabel()
    this.clearPreviewArc()
  }
  onMouseMove(_event: MouseEvent) { }

  onPointerDown(event: PointerEvent) {
    const existingPoint = getNearestSelectablePoint(
      event,
      this.camera,
      this.selectableObjects
    )

    let point: THREE.Mesh

    if (existingPoint) {
      this.selectPoint(existingPoint)
      point = existingPoint
    } else {
      const pos = getPointerIntersection(event, this.camera)

      point = createPoint(pos, getPointerPointSize(event))

      this.scene.add(point)
      this.selectableObjects.push(point)
      this.createdPoints.push(point)
    }

    if (this.hasPoint(point)) {
      if (!existingPoint) this.removeCreatedPoint(point)
      return
    }

    this.points.push(point)

    if (this.points.length === 3) {
      const angle = new AngleObject(
        this.points[0],
        this.points[1],
        this.points[2],
        this.selectableObjects
      )

      this.scene.add(angle.lineAB)
      this.scene.add(angle.lineBC)
      this.scene.add(angle.arc)
      this.recordCreation(
        "Açı oluştur",
        [...this.createdPoints, angle.lineAB, angle.lineBC, angle.arc],
        [angle]
      )

      this.clearPreviewLines()
      this.points = []
      this.createdPoints = []
      this.complete()
    }
  }

  onClick(event: MouseEvent) { this.onPointerDown(event as PointerEvent) }

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
    this.points = []
    this.createdPoints = []
    this.cursorPreview.visible = false
    this.clearPreviewLines()
  }

  updatePreviewLine(
    start: THREE.Vector3,
    end: THREE.Vector3,
    type: "AB" | "BC"
  ) {
    const geometry = new THREE.BufferGeometry().setFromPoints([start, end])
    const material = new THREE.LineBasicMaterial({ color: 0xff0000 })

    if (type === "AB") {
      if (this.previewLineAB) {
        this.scene.remove(this.previewLineAB)
        this.previewLineAB.geometry.dispose()
      }

      this.previewLineAB = new THREE.Line(geometry, material)
      this.scene.add(this.previewLineAB)
      return
    }

    if (this.previewLineBC) {
      this.scene.remove(this.previewLineBC)
      this.previewLineBC.geometry.dispose()
    }

    this.previewLineBC = new THREE.Line(geometry, material)
    this.scene.add(this.previewLineBC)
  }

  private clearPreviewLines() {
    if (this.previewLineAB) {
      this.scene.remove(this.previewLineAB)
      this.previewLineAB.geometry.dispose()
      this.previewLineAB = null
    }

    if (this.previewLineBC) {
      this.scene.remove(this.previewLineBC)
      this.previewLineBC.geometry.dispose()
      this.previewLineBC = null
    }

    this.clearPreviewLabel()
    this.clearPreviewArc()
  }

  private updatePreviewArc(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3
  ) {
    const v1Raw = new THREE.Vector3().subVectors(a, b)
    const v2Raw = new THREE.Vector3().subVectors(c, b)

    if (v1Raw.length() < 0.0001 || v2Raw.length() < 0.0001) {
      this.clearPreviewArc()
      return
    }

    const v1 = v1Raw.clone().normalize()
    const v2 = v2Raw.clone().normalize()
    const angle = v1.angleTo(v2)
    const normal = new THREE.Vector3().crossVectors(v1, v2)

    if (normal.length() < 0.0001) {
      this.clearPreviewArc()
      return
    }

    normal.normalize()

    const radius = Math.min(v1Raw.length(), v2Raw.length(), 1)
    const points: THREE.Vector3[] = []
    const segments = 32

    for (let i = 0; i <= segments; i++) {
      const direction = v1
        .clone()
        .applyAxisAngle(normal, angle * (i / segments))

      points.push(
        b.clone().add(direction.multiplyScalar(radius))
      )
    }

    const curve = new THREE.CatmullRomCurve3(points)
    const geometry = new THREE.TubeGeometry(curve, 32, 0.04, 8, false)

    if (!this.previewArc) {
      this.previewArc = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          color: 0xff0000,
          depthTest: false,
        })
      )
      this.scene.add(this.previewArc)
      return
    }

    this.previewArc.geometry.dispose()
    this.previewArc.geometry = geometry
  }

  private clearPreviewArc() {
    if (!this.previewArc) return

    this.previewArc.geometry.dispose()
    this.scene.remove(this.previewArc)
    this.previewArc = null
  }

  private updatePreviewLabel(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3
  ) {
    const v1 = new THREE.Vector3().subVectors(a, b)
    const v2 = new THREE.Vector3().subVectors(c, b)

    if (v1.length() < 0.0001 || v2.length() < 0.0001) {
      this.clearPreviewLabel()
      return
    }

    const angle = v1.angleTo(v2)
    const degree = THREE.MathUtils.radToDeg(angle)
    const text = `${degree.toFixed(0)}°`

    if (!this.previewLabel) {
      this.previewLabel = this.createPreviewLabel(text)
      this.scene.add(this.previewLabel)
    } else {
      this.updatePreviewLabelText(text)
    }

    const middleDir = v1
      .clone()
      .normalize()
      .lerp(v2.clone().normalize(), 0.5)

    if (middleDir.length() < 0.0001) {
      middleDir.copy(v1).normalize()
    } else {
      middleDir.normalize()
    }

    const radius = Math.min(v1.length(), v2.length(), 1.2)

    this.previewLabel.position
      .copy(b)
      .add(middleDir.multiplyScalar(radius + 0.65))
  }

  private createPreviewLabel(text: string) {
    const material = this.createPreviewLabelMaterial(text)
    const sprite = new THREE.Sprite(material)

    sprite.scale.set(1.4, 0.7, 1)

    return sprite
  }

  private updatePreviewLabelText(text: string) {
    if (!this.previewLabel) return

    const oldMaterial = this.previewLabel.material as THREE.SpriteMaterial

    oldMaterial.map?.dispose()
    oldMaterial.dispose()
    this.previewLabel.material = this.createPreviewLabelMaterial(text)
  }

  private createPreviewLabelMaterial(text: string) {
    const canvas = document.createElement("canvas")
    canvas.width = 256
    canvas.height = 128

    const context = canvas.getContext("2d")!

    context.clearRect(0, 0, canvas.width, canvas.height)
    context.font = "bold 88px Arial"
    context.fillStyle = "#ff0000"
    context.textAlign = "center"
    context.textBaseline = "middle"
    context.fillText(text, canvas.width / 2, canvas.height / 2)

    const texture = new THREE.CanvasTexture(canvas)

    return new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    })
  }

  private clearPreviewLabel() {
    if (!this.previewLabel) return

    const material = this.previewLabel.material as THREE.SpriteMaterial

    material.map?.dispose()
    material.dispose()
    this.scene.remove(this.previewLabel)
    this.previewLabel = null
  }

  private removeCreatedPoint(point: THREE.Mesh) {
    this.scene.remove(point)
    const index = this.selectableObjects.indexOf(point)
    if (index >= 0) this.selectableObjects.splice(index, 1)
    this.createdPoints = this.createdPoints.filter((createdPoint) => createdPoint !== point)
    point.geometry.dispose()
  }

  private hasPoint(point: THREE.Mesh) {
    return this.points.some((existing) =>
      existing === point || existing.position.distanceTo(point.position) < 0.001
    )
  }
}
