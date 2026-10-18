import * as THREE from "three"
import { updateConstrainedPoints } from "../interaction/LineSegmentConstraint"
import { getRandomColor } from "../utils/color"

const ANGLE_ARC_TUBULAR_SEGMENTS = 64
const ANGLE_ARC_RADIAL_SEGMENTS = 16
const ANGLE_ARM_RADIAL_SEGMENTS = 32

export class AngleObject {
  pointA: THREE.Mesh
  vertexB: THREE.Mesh
  pointC: THREE.Mesh

  arc: THREE.Mesh
  label: THREE.Sprite

  lineAB: THREE.Mesh
  lineBC: THREE.Mesh

  arcRadius = 1
  armRadius = 0.05
  color: string
  originalPartColors = new Map<THREE.Mesh, THREE.Color>()
  constrainedPoints: THREE.Mesh[] = []

  constructor(
    pointA: THREE.Mesh,
    vertexB: THREE.Mesh,
    pointC: THREE.Mesh,
    selectableObjects?: THREE.Object3D[]
  ) {
    this.pointA = pointA
    this.vertexB = vertexB
    this.pointC = pointC
    this.color = getRandomColor()

    const arcGeometry = new THREE.BufferGeometry()
    const arcMaterial = new THREE.MeshBasicMaterial({ color: this.color })

    this.arc = new THREE.Mesh(arcGeometry, arcMaterial)

    this.label = this.createAngleLabel("0°")
    this.arc.add(this.label)

    const armMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 })

    this.lineAB = this.createCylinderArm(armMaterial)
    this.lineBC = this.createCylinderArm(armMaterial.clone())

    this.markSelectable(this.arc, selectableObjects)
    this.markSelectable(this.lineAB, selectableObjects)
    this.markSelectable(this.lineBC, selectableObjects)

    this.pointA.userData.dependents ??= []
    this.vertexB.userData.dependents ??= []
    this.pointC.userData.dependents ??= []

    this.pointA.userData.dependents.push(this)
    this.vertexB.userData.dependents.push(this)
    this.pointC.userData.dependents.push(this)

    this.update()
  }

  createAngleLabel(text: string) {
    const canvas = document.createElement("canvas")
    canvas.width = 512
    canvas.height = 256

    const context = canvas.getContext("2d")!
    context.clearRect(0, 0, canvas.width, canvas.height)

    context.font = "bold 200px Arial"
    context.fillStyle = this.color
    context.textAlign = "center"
    context.textBaseline = "middle"
    context.fillText(text, canvas.width / 2, canvas.height / 2)

    const texture = new THREE.CanvasTexture(canvas)

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    })

    const sprite = new THREE.Sprite(material)
    sprite.scale.set(2, 1, 1)

    return sprite
  }

  updateAngleLabel(text: string) {
    const oldMaterial = this.label.material as THREE.SpriteMaterial

    oldMaterial.map?.dispose()
    oldMaterial.dispose()

    const newLabel = this.createAngleLabel(text)

    this.label.material = newLabel.material
    this.label.scale.copy(newLabel.scale)
  }

  update() {
    const a = this.pointA.position
    const b = this.vertexB.position
    const c = this.pointC.position

    const v1Raw = new THREE.Vector3().subVectors(a, b)
    const v2Raw = new THREE.Vector3().subVectors(c, b)

    if (v1Raw.length() < 0.0001 || v2Raw.length() < 0.0001) {
      return
    }

    const v1 = v1Raw.clone().normalize()
    const v2 = v2Raw.clone().normalize()

    const angle = v1.angleTo(v2)

    const normal = new THREE.Vector3().crossVectors(v1, v2)

    if (normal.length() < 0.0001) {
      return
    }

    normal.normalize()

    const points: THREE.Vector3[] = []
    const segments = 32

    for (let i = 0; i <= segments; i++) {
      const t = i / segments

      const dir = new THREE.Vector3()
        .copy(v1)
        .applyAxisAngle(normal, angle * t)

      points.push(
        new THREE.Vector3()
          .copy(b)
          .add(dir.multiplyScalar(this.arcRadius))
      )
    }

    this.arc.geometry.dispose()

    const curve = new THREE.CatmullRomCurve3(points)

    this.arc.geometry = new THREE.TubeGeometry(
      curve,
      ANGLE_ARC_TUBULAR_SEGMENTS,
      0.1,
      ANGLE_ARC_RADIAL_SEGMENTS,
      false
    )

    const degree = THREE.MathUtils.radToDeg(angle)
    this.updateAngleLabel(`${degree.toFixed(0)}°`)

    const middleDir = new THREE.Vector3()
      .copy(v1)
      .applyAxisAngle(normal, angle / 2)
      .normalize()

    this.label.position
      .copy(b)
      .add(middleDir.multiplyScalar(this.arcRadius + 1))

    this.updateArms(a, b, c)
    updateConstrainedPoints(this)
  }

  private createCylinderArm(material: THREE.Material) {
    const geometry = new THREE.CylinderGeometry(
      this.armRadius,
      this.armRadius,
      1,
      ANGLE_ARM_RADIAL_SEGMENTS
    )

    const mesh = new THREE.Mesh(geometry, material)

    return mesh
  }

  private markSelectable(
    mesh: THREE.Mesh,
    selectableObjects?: THREE.Object3D[]
  ) {
    mesh.userData.selectableType = "solid"
    mesh.userData.owner = this
    selectableObjects?.push(mesh)
  }

  onSelect() {
    this.setSelectedColor(this.arc)
    this.setSelectedColor(this.lineAB)
    this.setSelectedColor(this.lineBC)
  }

  onDeselect() {
    this.restorePartColor(this.arc)
    this.restorePartColor(this.lineAB)
    this.restorePartColor(this.lineBC)
    this.originalPartColors.clear()
  }

  private setSelectedColor(mesh: THREE.Mesh) {
    const material = mesh.material

    if (Array.isArray(material) || !("color" in material)) return

    const colorMaterial = material as THREE.Material & { color: THREE.Color }

    if (!this.originalPartColors.has(mesh)) {
      this.originalPartColors.set(mesh, colorMaterial.color.clone())
    }

    colorMaterial.color.set(0xffaa00)
  }

  private restorePartColor(mesh: THREE.Mesh) {
    const originalColor = this.originalPartColors.get(mesh)
    const material = mesh.material

    if (!originalColor || Array.isArray(material) || !("color" in material)) return

    const colorMaterial = material as THREE.Material & { color: THREE.Color }

    colorMaterial.color.copy(originalColor)
  }

  private updateArms(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3
  ) {
    this.updateCylinderBetweenPoints(this.lineAB, a, b)
    this.updateCylinderBetweenPoints(this.lineBC, b, c)
  }

  private updateCylinderBetweenPoints(
    cylinder: THREE.Mesh,
    start: THREE.Vector3,
    end: THREE.Vector3
  ) {
    const direction = new THREE.Vector3().subVectors(end, start)
    const length = direction.length()

    if (length < 0.0001) {
      cylinder.visible = false
      return
    }

    cylinder.visible = true

    const midpoint = new THREE.Vector3()
      .addVectors(start, end)
      .multiplyScalar(0.5)

    cylinder.position.copy(midpoint)

    cylinder.geometry.dispose()
    cylinder.geometry = new THREE.CylinderGeometry(
      this.armRadius,
      this.armRadius,
      length,
      ANGLE_ARM_RADIAL_SEGMENTS
    )

    const yAxis = new THREE.Vector3(0, 1, 0)
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      yAxis,
      direction.clone().normalize()
    )

    cylinder.quaternion.copy(quaternion)
  }
}
