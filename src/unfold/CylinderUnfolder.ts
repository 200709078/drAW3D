import * as THREE from "three"

type CylinderUnfoldData = {
  radius: number
  topCenter: THREE.Vector3
  basePoint: THREE.Vector3
  topPoint: THREE.Vector3
  heightDirection: THREE.Vector3
  radiusDirection: THREE.Vector3
  angle: number
}

export class CylinderUnfolder {
  private group: THREE.Group

  constructor(group: THREE.Group) {
    this.group = group
    this.group.visible = false
  }

  update(data: CylinderUnfoldData) {
    this.clear()
    this.group.visible = data.angle > 0

    if (!this.group.visible || data.radius < 0.0001) {
      return
    }

    const preview = this.createPreviewGeometry(data)

    const surface = new THREE.Mesh(
      preview.surfaceGeometry,
      new THREE.MeshStandardMaterial({
        color: 0xc7d2fe,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    )

    const edges = new THREE.LineSegments(
      preview.edgeGeometry,
      new THREE.LineBasicMaterial({
        color: 0x4f46e5,
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

  private createPreviewGeometry(data: CylinderUnfoldData) {
    const tangentDirection = new THREE.Vector3()
      .crossVectors(data.heightDirection, data.radiusDirection)
      .normalize()
    const foldAngle = THREE.MathUtils.degToRad(
      THREE.MathUtils.clamp(data.angle, 0, 90)
    )
    const openedHeightVector = new THREE.Vector3()
      .subVectors(data.topPoint, data.basePoint)
      .applyAxisAngle(tangentDirection, foldAngle)
    const width = Math.PI * 2 * data.radius
    const halfWidthVector = tangentDirection.clone().multiplyScalar(width / 2)
    const a = data.basePoint.clone().sub(halfWidthVector)
    const b = a.clone().add(openedHeightVector)
    const d = data.basePoint.clone().add(halfWidthVector)
    const c = d.clone().add(openedHeightVector)
    const openedTopPoint = data.basePoint.clone().add(openedHeightVector)
    const vertices = [
      a.x, a.y, a.z,
      b.x, b.y, b.z,
      c.x, c.y, c.z,
      d.x, d.y, d.z,
    ]
    const indices = [0, 1, 3, 1, 2, 3]
    const edgeVertices: number[] = []

    this.addEdge(edgeVertices, a, b)
    this.addEdge(edgeVertices, b, c)
    this.addEdge(edgeVertices, c, d)
    this.addEdge(edgeVertices, d, a)
    this.addTopFace(
      vertices,
      indices,
      edgeVertices,
      data.topCenter,
      data.topPoint,
      openedTopPoint,
      tangentDirection,
      data.heightDirection,
      foldAngle
    )

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

  private addTopFace(
    vertices: number[],
    indices: number[],
    edgeVertices: number[],
    topCenter: THREE.Vector3,
    topPoint: THREE.Vector3,
    openedTopPoint: THREE.Vector3,
    tangentDirection: THREE.Vector3,
    heightDirection: THREE.Vector3,
    sideFoldAngle: number
  ) {
    const capFoldAngle = sideFoldAngle
    const openedTopCenter = topCenter
      .clone()
      .sub(topPoint)
      .applyAxisAngle(tangentDirection, sideFoldAngle)
      .add(openedTopPoint)
    const center = topCenter
      .clone()
      .sub(topPoint)
      .applyAxisAngle(tangentDirection, sideFoldAngle + capFoldAngle)
      .add(openedTopPoint)
    const radiusVector = openedTopPoint
      .clone()
      .sub(openedTopCenter)
      .applyAxisAngle(tangentDirection, capFoldAngle)
    const capNormal = heightDirection
      .clone()
      .applyAxisAngle(tangentDirection, sideFoldAngle + capFoldAngle)
      .normalize()
    const capTangent = new THREE.Vector3()
      .crossVectors(capNormal, radiusVector)
      .normalize()
    const centerIndex = vertices.length / 3
    const segments = 96
    const arcStartIndex = centerIndex + 1
    const points: THREE.Vector3[] = []

    vertices.push(center.x, center.y, center.z)

    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2
      const point = center
        .clone()
        .add(radiusVector.clone().multiplyScalar(Math.cos(angle)))
        .add(capTangent.clone().multiplyScalar(Math.sin(angle) * radiusVector.length()))

      points.push(point)
      vertices.push(point.x, point.y, point.z)
    }

    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments

      indices.push(centerIndex, arcStartIndex + i, arcStartIndex + next)
      this.addEdge(edgeVertices, points[i], points[next])
    }
  }

  private addEdge(
    edgeVertices: number[],
    start: THREE.Vector3,
    end: THREE.Vector3
  ) {
    edgeVertices.push(start.x, start.y, start.z, end.x, end.y, end.z)
  }
}
