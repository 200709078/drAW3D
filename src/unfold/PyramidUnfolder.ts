import * as THREE from "three"

type PyramidUnfoldData = {
  baseVertices: THREE.Vector3[]
  apex: THREE.Vector3
  angle: number
}

export class PyramidUnfolder {
  private group: THREE.Group
  private currentAngle = 0

  constructor(group: THREE.Group) {
    this.group = group
    this.group.visible = false
  }

  update(data: PyramidUnfoldData) {
    this.clear()
    this.currentAngle = data.angle
    this.group.visible = data.angle > 0

    if (!this.group.visible || data.baseVertices.length < 3) {
      return
    }

    const preview = this.createPreviewGeometry(data.baseVertices, data.apex)

    const surface = new THREE.Mesh(
      preview.surfaceGeometry,
      new THREE.MeshStandardMaterial({
        color: 0xffd28a,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    )

    const edges = new THREE.LineSegments(
      preview.edgeGeometry,
      new THREE.LineBasicMaterial({
        color: 0xd97706,
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

  private createPreviewGeometry(
    baseVertices: THREE.Vector3[],
    apex: THREE.Vector3
  ) {
    const n = baseVertices.length
    const center = this.getCenter(baseVertices)
    const heightVector = new THREE.Vector3().subVectors(apex, center)
    const vertices: number[] = []
    const indices: number[] = []
    const edgeVertices: number[] = []

    for (const p of baseVertices) {
      vertices.push(p.x, p.y, p.z)
    }

    for (let i = 1; i < n - 1; i++) {
      indices.push(0, i, i + 1)
    }

    for (let i = 0; i < n; i++) {
      this.addEdge(edgeVertices, baseVertices[i], baseVertices[(i + 1) % n])
    }

    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n
      const edgeStart = baseVertices[i]
      const edgeEnd = baseVertices[next]
      const openedApex = this.openSideVertex(
        apex,
        edgeStart,
        edgeEnd,
        heightVector,
        center
      )
      const sideStartIndex = vertices.length / 3

      vertices.push(
        edgeStart.x,
        edgeStart.y,
        edgeStart.z,
        edgeEnd.x,
        edgeEnd.y,
        edgeEnd.z,
        openedApex.x,
        openedApex.y,
        openedApex.z
      )

      indices.push(sideStartIndex, sideStartIndex + 1, sideStartIndex + 2)

      this.addEdge(edgeVertices, edgeStart, edgeEnd)
      this.addEdge(edgeVertices, edgeEnd, openedApex)
      this.addEdge(edgeVertices, openedApex, edgeStart)
    }

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

  private openSideVertex(
    vertex: THREE.Vector3,
    edgeStart: THREE.Vector3,
    edgeEnd: THREE.Vector3,
    heightVector: THREE.Vector3,
    center: THREE.Vector3
  ) {
    const edgeAxis = new THREE.Vector3()
      .subVectors(edgeEnd, edgeStart)
      .normalize()

    const outward = new THREE.Vector3()
      .addVectors(edgeStart, edgeEnd)
      .multiplyScalar(0.5)
      .sub(center)

    if (outward.length() < 0.0001 || heightVector.length() < 0.0001) {
      return vertex.clone()
    }

    outward.normalize()

    const targetSign = Math.sign(
      new THREE.Vector3().crossVectors(heightVector, outward).dot(edgeAxis)
    ) || 1
    const angle = THREE.MathUtils.degToRad(this.currentAngle) * targetSign

    return vertex
      .clone()
      .sub(edgeStart)
      .applyAxisAngle(edgeAxis, angle)
      .add(edgeStart)
  }

  private addEdge(
    edgeVertices: number[],
    start: THREE.Vector3,
    end: THREE.Vector3
  ) {
    edgeVertices.push(start.x, start.y, start.z, end.x, end.y, end.z)
  }

  private getCenter(vertices: THREE.Vector3[]) {
    const center = new THREE.Vector3()

    for (const vertex of vertices) {
      center.add(vertex)
    }

    return center.divideScalar(vertices.length)
  }
}
