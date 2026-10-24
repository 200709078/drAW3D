export type ToolAction =
  | 'select'
  | 'point'
  | 'line'
  | 'segment'
  | 'ray'
  | 'angle'
  | 'plane'
  | 'sphere'
  | 'prism'
  | 'pyramid'
  | 'cylinder'
  | 'cone'
  | 'midpoint'
  | 'intersect'
  | 'project'
  | 'perpendicularLine'
  | 'parallelLine'
  | 'perpendicularPlane'
  | 'parallelPlane'
  | 'section'
  | 'frustum'
  | 'frustumCone'
  | 'tetrahedron'
  | 'cube'
  | 'octahedron'
  | 'dodecahedron'
  | 'icosahedron'

export type ToolGroupId = 'move' | 'point' | 'line' | 'angle' | 'plane' | 'solid' | 'regular'

export interface ToolGroup {
  id: ToolGroupId
  label: string
}

export interface ToolDefinition {
  action: ToolAction
  group: ToolGroupId
  label: string
  /** File in public/img. */
  icon: string
  /** What the user does next; shown when the tool is chosen. */
  instruction: string
}

/** Toolbar order. A group appears once it has a tool. */
export const TOOL_GROUPS: readonly ToolGroup[] = [
  { id: 'move', label: 'Taşı' },
  { id: 'point', label: 'Nokta' },
  { id: 'line', label: 'Doğrular' },
  { id: 'angle', label: 'Açı' },
  { id: 'plane', label: 'Düzlem' },
  { id: 'solid', label: 'Cisimler' },
  { id: 'regular', label: 'Düzgün Çokyüzlüler' },
]

/** Every tool, in menu order within its group. The first tool of a group is its default. */
export const TOOLS: readonly ToolDefinition[] = [
  {
    action: 'select', group: 'move', label: 'Seç / Taşı', icon: 'hand.svg',
    instruction: 'Nesne seçiniz veya noktayı sürükleyiniz; boşlukta sürüklemek görünümü döndürür.',
  },
  { action: 'point', group: 'point', label: 'Nokta', icon: 'point.svg', instruction: 'Konum veya bir nesne seçiniz.' },
  { action: 'midpoint', group: 'point', label: 'Orta Nokta', icon: 'midpoint.svg', instruction: 'İki nokta veya bir doğru parçası seçiniz.' },
  {
    action: 'intersect', group: 'point', label: 'Kesiştir', icon: 'intersect.svg',
    instruction: 'Kesişen iki nesne seçiniz: doğrular, düzlemler, küre. İki düzlem bir doğruda kesişir.',
  },
  { action: 'project', group: 'point', label: 'İzdüşüm', icon: 'projection.svg', instruction: 'Bir nokta, sonra bir düzlem veya doğru seçiniz.' },
  { action: 'line', group: 'line', label: 'Doğru', icon: 'line.svg', instruction: 'Farklı iki nokta seçiniz.' },
  { action: 'segment', group: 'line', label: 'Doğru Parçası', icon: 'linesegment.svg', instruction: 'Farklı iki nokta seçiniz.' },
  { action: 'ray', group: 'line', label: 'Işın', icon: 'ray.svg', instruction: 'Başlangıç noktasını, sonra ışının geçtiği noktayı seçiniz.' },
  {
    action: 'perpendicularLine', group: 'line', label: 'Dik Doğru', icon: 'perpendicular.svg',
    instruction: 'Bir nokta, sonra doğrunun dik olacağı düzlemi veya doğruyu seçiniz.',
  },
  { action: 'parallelLine', group: 'line', label: 'Paralel Doğru', icon: 'parallel.svg', instruction: 'Bir nokta, sonra bir doğru seçiniz.' },
  { action: 'angle', group: 'angle', label: 'Açı', icon: 'angle.svg', instruction: 'Üç nokta seçiniz; ikincisi açının köşesidir.' },
  { action: 'plane', group: 'plane', label: 'Düzlem', icon: 'plane.svg', instruction: 'Doğrusal olmayan üç nokta seçiniz.' },
  {
    action: 'perpendicularPlane', group: 'plane', label: 'Dik Düzlem', icon: 'perpendicularplane.svg',
    instruction: 'Bir nokta, sonra düzlemin dik olacağı doğruyu seçiniz.',
  },
  { action: 'parallelPlane', group: 'plane', label: 'Paralel Düzlem', icon: 'parallelplane.svg', instruction: 'Bir nokta, sonra bir düzlem seçiniz.' },
  { action: 'section', group: 'plane', label: 'Kesit', icon: 'section.svg', instruction: 'Bir cisim, sonra onu kesen düzlemi seçiniz.' },
  { action: 'sphere', group: 'solid', label: 'Küre', icon: 'sphere.svg', instruction: 'Merkezi, sonra küre üzerinde bir nokta seçiniz.' },
  { action: 'prism', group: 'solid', label: 'Prizma', icon: 'prism.svg', instruction: 'Taban kenarının iki ucunu seçiniz.' },
  { action: 'pyramid', group: 'solid', label: 'Piramit', icon: 'pyramid.svg', instruction: 'Taban kenarının iki ucunu seçiniz.' },
  {
    action: 'cylinder', group: 'solid', label: 'Silindir', icon: 'cylinder.svg',
    instruction: 'Taban merkezini, sonra taban çemberinde bir nokta seçiniz.',
  },
  {
    action: 'cone', group: 'solid', label: 'Koni', icon: 'cone.svg',
    instruction: 'Taban merkezini, sonra taban çemberinde bir nokta seçiniz.',
  },
  { action: 'frustum', group: 'solid', label: 'Kesik Piramit', icon: 'frustum.svg', instruction: 'Taban kenarının iki ucunu seçiniz.' },
  {
    action: 'frustumCone', group: 'solid', label: 'Kesik Koni', icon: 'frustumcone.svg',
    instruction: 'Taban merkezini, sonra taban çemberinde bir nokta seçiniz.',
  },
  { action: 'tetrahedron', group: 'regular', label: 'Dörtyüzlü', icon: 'tetrahedron.svg', instruction: 'Bir kenarın iki ucunu seçiniz.' },
  { action: 'cube', group: 'regular', label: 'Küp', icon: 'cube.svg', instruction: 'Bir kenarın iki ucunu seçiniz.' },
  { action: 'octahedron', group: 'regular', label: 'Sekizyüzlü', icon: 'octahedron.svg', instruction: 'Bir kenarın iki ucunu seçiniz.' },
  { action: 'dodecahedron', group: 'regular', label: 'Onikiyüzlü', icon: 'dodecahedron.svg', instruction: 'Bir kenarın iki ucunu seçiniz.' },
  { action: 'icosahedron', group: 'regular', label: 'Yirmiyüzlü', icon: 'icosahedron.svg', instruction: 'Bir kenarın iki ucunu seçiniz.' },
]

export function toolDefinition(action: ToolAction): ToolDefinition {
  const tool = TOOLS.find(item => item.action === action)
  if (!tool) throw new Error(`Bilinmeyen araç: ${action}`)
  return tool
}

export function isToolAction(value: string): value is ToolAction {
  return TOOLS.some(tool => tool.action === value)
}

/** Groups with at least one tool, each with its tools. */
export function visibleGroups(): { group: ToolGroup; tools: ToolDefinition[] }[] {
  return TOOL_GROUPS
    .map(group => ({ group, tools: TOOLS.filter(tool => tool.group === group.id) }))
    .filter(entry => entry.tools.length > 0)
}
