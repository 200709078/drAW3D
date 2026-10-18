import * as THREE from "three"

type ConeUnfoldData = {
  baseCenter: THREE.Vector3
  baseVertices: THREE.Vector3[]
  radiusPoint: THREE.Vector3
  apex: THREE.Vector3
  heightDirection: THREE.Vector3
  angle: number
  maxAngle: number
}

export class ConeUnfolder {
  private group: THREE.Group

  constructor(group: THREE.Group) {
    this.group = group
    this.group.visible = false
  }

  update(data: ConeUnfoldData) {
    this.clear()
    this.group.visible = data.angle > 0

    if (!this.group.visible || data.baseVertices.length < 3) {
      return
    }

    const preview = this.createPreviewGeometry(data)

    const surface = new THREE.Mesh(
      preview.surfaceGeometry,
      new THREE.MeshStandardMaterial({
        color: 0xb5f5d5,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    )

    const edges = new THREE.LineSegments(
      preview.edgeGeometry,
      new THREE.LineBasicMaterial({
        color: 0x059669,
        transparent: true,
        opacity: 0.9,
      })
    )

    surface.userData.selectionOutline = "none"
    edges.userData.selectionOutline = "none"

    this.group.add(surface)
    this.group.add(edges)
  }

  dispose() {
    this.clear()
  }

  private clear() {
    while (this.group.children.length > 0) {
      const child = this.group.children[0]

      if (!child) continue

      this.group.remove(child)
      this.disposeObject(child)
    }
  }

  private disposeObject(object: THREE.Object3D) {
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh || child instanceof THREE.LineSegments)) {
        return
      }

      child.geometry.dispose()

      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material.dispose())
      } else {
        child.material.dispose()
      }
    })
  }

  private createPreviewGeometry(data: ConeUnfoldData) {
    const radius = data.baseCenter.distanceTo(data.radiusPoint)
    const height = data.baseCenter.distanceTo(data.apex)
    const slantHeight = Math.hypot(radius, height)
    const sectorAngle = (Math.PI * 2 * radius) / slantHeight
    const progress = data.maxAngle <= 0
      ? 0
      : THREE.MathUtils.clamp(data.angle / data.maxAngle, 0, 1)
    const radiusDirection = new THREE.Vector3()
      .subVectors(data.radiusPoint, data.baseCenter)
      .normalize()
    const tangentDirection = new THREE.Vector3()
      .crossVectors(data.heightDirection, radiusDirection)
      .normalize()
    const flatCenter = data.radiusPoint
      .clone()
      .add(radiusDirection.clone().multiplyScalar(slantHeight))
    const currentCenterVector = new THREE.Vector3()
      .subVectors(data.apex, data.radiusPoint)
    const flatCenterVector = new THREE.Vector3()
      .subVectors(flatCenter, data.radiusPoint)
    const signedFlattenAngle = Math.atan2(
      new THREE.Vector3()
        .crossVectors(currentCenterVector, flatCenterVector)
        .dot(tangentDirection),
      currentCenterVector.dot(flatCenterVector)
    )
    const sectorCenter = currentCenterVector
      .clone()
      .applyAxisAngle(tangentDirection, signedFlattenAngle * progress)
      .add(data.radiusPoint)
    const sectorStartDirection = new THREE.Vector3()
      .subVectors(data.radiusPoint, sectorCenter)
      .normalize()
    const vertices: number[] = []
    const indices: number[] = []
    const edgeVertices: number[] = []

    vertices.push(data.baseCenter.x, data.baseCenter.y, data.baseCenter.z)

    for (const point of data.baseVertices) {
      vertices.push(point.x, point.y, point.z)
    }

    for (let i = 0; i < data.baseVertices.length; i++) {
      const next = (i + 1) % data.baseVertices.length

      indices.push(0, i + 1, next + 1)
      this.addEdge(edgeVertices, data.baseVertices[i], data.baseVertices[next])
    }

    const sectorCenterIndex = vertices.length / 3
    vertices.push(sectorCenter.x, sectorCenter.y, sectorCenter.z)

    const sectorSegments = 96
    const arcStartIndex = vertices.length / 3
    const arcPoints: THREE.Vector3[] = []

    for (let i = 0; i <= sectorSegments; i++) {
      const t = i / sectorSegments
      const angle = (t - 0.5) * sectorAngle
      const arcPoint = sectorCenter
        .clone()
        .add(sectorStartDirection.clone().multiplyScalar(Math.cos(angle) * slantHeight))
        .add(tangentDirection.clone().multiplyScalar(Math.sin(angle) * slantHeight))

      arcPoints.push(arcPoint)
      vertices.push(arcPoint.x, arcPoint.y, arcPoint.z)
    }

    for (let i = 0; i < sectorSegments; i++) {
      indices.push(sectorCenterIndex, arcStartIndex + i, arcStartIndex + i + 1)
      this.addEdge(edgeVertices, arcPoints[i], arcPoints[i + 1])
    }

    this.addEdge(edgeVertices, sectorCenter, arcPoints[0])
    this.addEdge(edgeVertices, sectorCenter, arcPoints[arcPoints.length - 1])

    const surfaceGeometry = new THREE.BufferGeometry()

    surfaceGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3)
    )

    surfaceGeometry.setIndex(indices)
    surfaceGeometry.computeVertexNormals()

    const edgeGeometry = new THREE.BufferGeometry()
    edgeGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(edgeVertices, 3)
    )

    return { surfaceGeometry, edgeGeometry }
  }

  private addEdge(
    edgeVertices: number[],
    start: THREE.Vector3,
    end: THREE.Vector3
  ) {
    edgeVertices.push(start.x, start.y, start.z, end.x, end.y, end.z)
  }
}
