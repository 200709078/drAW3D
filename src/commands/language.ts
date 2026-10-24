/**
 * The input language in one table: command names for the parser, templates for the
 * command input's suggestions, and the help window's topics and examples.
 */

export type CommandName =
  | 'line' | 'segment' | 'ray' | 'plane' | 'angle' | 'sphere' | 'prism' | 'pyramid' | 'cylinder' | 'cone'
  | 'unfold' | 'length' | 'distance' | 'baseArea' | 'surfaceArea' | 'volume'
  | 'midpoint' | 'intersect' | 'project' | 'perpendicularLine' | 'parallelLine' | 'perpendicularPlane' | 'parallelPlane'
  | 'frustum' | 'frustumCone' | 'tetrahedron' | 'cube' | 'octahedron' | 'dodecahedron' | 'icosahedron' | 'section'

/** Display name first, then accepted aliases. Matching ignores case and diacritics. */
export const COMMAND_NAMES: Readonly<Record<CommandName, readonly string[]>> = {
  line: ['Doğru', 'Line'],
  segment: ['DoğruParçası', 'Segment'],
  ray: ['Işın', 'Ray'],
  plane: ['Düzlem', 'Plane'],
  angle: ['Açı', 'Angle'],
  sphere: ['Küre', 'Sphere'],
  prism: ['Prizma', 'Prism'],
  pyramid: ['Piramit', 'Pyramid'],
  cylinder: ['Silindir', 'Cylinder'],
  cone: ['Koni', 'Cone'],
  unfold: ['Açınım', 'Unfold', 'Net'],
  length: ['Uzunluk', 'Length'],
  distance: ['Uzaklık', 'Distance'],
  baseArea: ['Alan', 'TabanAlanı', 'Area'],
  surfaceArea: ['YüzeyAlanı', 'SurfaceArea'],
  volume: ['Hacim', 'Volume'],
  midpoint: ['OrtaNokta', 'Midpoint'],
  intersect: ['Kesiştir', 'Intersect'],
  project: ['İzdüşüm', 'Projection'],
  perpendicularLine: ['DikDoğru', 'PerpendicularLine'],
  parallelLine: ['ParalelDoğru', 'ParallelLine'],
  perpendicularPlane: ['DikDüzlem', 'PerpendicularPlane'],
  parallelPlane: ['ParalelDüzlem', 'ParallelPlane'],
  frustum: ['KesikPiramit', 'Frustum'],
  frustumCone: ['KesikKoni', 'ConeFrustum'],
  tetrahedron: ['Dörtyüzlü', 'Tetrahedron'],
  cube: ['Küp', 'Cube'],
  octahedron: ['Sekizyüzlü', 'Octahedron'],
  dodecahedron: ['Onikiyüzlü', 'Dodecahedron'],
  icosahedron: ['Yirmiyüzlü', 'Icosahedron'],
  section: ['Kesit', 'Section'],
}

export function normalizedName(name: string): string {
  return name.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/\p{M}/gu, '').replace(/ı/g, 'i')
}

const commandsByName = new Map(Object.entries(COMMAND_NAMES)
  .flatMap(([kind, names]) => names.map(name => [normalizedName(name), kind as CommandName] as const)))

export function commandKind(name: string): CommandName | undefined {
  return commandsByName.get(normalizedName(name))
}

export function displayName(kind: CommandName): string {
  return COMMAND_NAMES[kind][0]!
}

export interface LanguageEntry {
  topic: string
  /** As shown in help. With `command`, also a template: `<Placeholders>` are filled in. */
  syntax: string
  command?: CommandName
  examples: readonly string[]
}

export interface HelpTopic {
  title: string
  note?: string
}

/** Help order. */
export const HELP_TOPICS: readonly HelpTopic[] = [
  { title: 'Nokta', note: 'Koordinatlar (x, y, z); y yukarı yöndür' },
  { title: 'Doğrular' },
  { title: 'Düzlem' },
  { title: 'Açı' },
  { title: 'Cisimler', note: 'Kenar sayısı ve yükseklik isteğe bağlıdır' },
  { title: 'Yapılar', note: 'Kesiştir: doğrular, düzlemler ve küre; iki düzlem bir doğruda kesişir' },
  { title: 'Düzgün Çokyüzlüler', note: 'Taban yüzü AB kenarı üzerindedir' },
  { title: 'Kesit' },
  { title: 'Açınım' },
  { title: 'Ölçümler' },
  { title: 'Parametre' },
  { title: 'Ad Verme' },
]

export const LANGUAGE: readonly LanguageEntry[] = [
  { topic: 'Nokta', syntax: '(<x>, <y>, <z>)', examples: ['(1, 0, 2)', 'A=(0, 3, 0)'] },
  { topic: 'Doğrular', syntax: 'Doğru(<Nokta>, <Nokta>)', command: 'line', examples: ['Doğru((0,0,0),(1,1,1))', 'Doğru(A,B)'] },
  { topic: 'Doğrular', syntax: 'DoğruParçası(<Nokta>, <Nokta>)', command: 'segment', examples: ['DoğruParçası((0,0,0),(3,4,0))'] },
  { topic: 'Doğrular', syntax: 'Işın(<Başlangıç Noktası>, <Nokta>)', command: 'ray', examples: ['Işın((0,0,0),(1,2,0))'] },
  { topic: 'Düzlem', syntax: 'Düzlem(<Nokta>, <Nokta>, <Nokta>)', command: 'plane', examples: ['Düzlem((0,1,0),(4,1,0),(0,1,4))'] },
  { topic: 'Açı', syntax: 'Açı(<Nokta>, <Köşe>, <Nokta>)', command: 'angle', examples: ['Açı((3,0,0),(0,0,0),(0,0,3))'] },
  { topic: 'Açı', syntax: 'Açı(<Doğru veya Düzlem>, <Doğru veya Düzlem>)', command: 'angle', examples: ['Açı(a,p)'] },
  { topic: 'Cisimler', syntax: 'Küre(<Merkez>, <Nokta>)', command: 'sphere', examples: ['Küre((0,2,0),(0,4,0))'] },
  { topic: 'Cisimler', syntax: 'Küre(<Merkez>, <Yarıçap>)', command: 'sphere', examples: ['Küre((0,2,0),2)', 'Küre(A,r)'] },
  { topic: 'Cisimler', syntax: 'Prizma(<Nokta>, <Nokta>, <Kenar Sayısı>, <Yükseklik>)', command: 'prism', examples: ['Prizma((0,0,0),(3,0,0))', 'Prizma(A,B,6,4)', 'Prizma(A,B,n)'] },
  { topic: 'Cisimler', syntax: 'Piramit(<Nokta>, <Nokta>, <Kenar Sayısı>, <Yükseklik>)', command: 'pyramid', examples: ['Piramit((0,0,0),(3,0,0),4,5)'] },
  { topic: 'Cisimler', syntax: 'Silindir(<Taban Merkezi>, <Tabandaki Nokta>, <Yükseklik>)', command: 'cylinder', examples: ['Silindir((0,0,0),(2,0,0),5)'] },
  { topic: 'Cisimler', syntax: 'Koni(<Taban Merkezi>, <Tabandaki Nokta>, <Yükseklik>)', command: 'cone', examples: ['Koni((0,0,0),(2,0,0),4)'] },
  { topic: 'Yapılar', syntax: 'OrtaNokta(<Nokta>, <Nokta>)', command: 'midpoint', examples: ['OrtaNokta((0,0,0),(4,2,0))', 'OrtaNokta(A,B)'] },
  { topic: 'Yapılar', syntax: 'OrtaNokta(<Doğru Parçası>)', command: 'midpoint', examples: ['OrtaNokta(s)'] },
  { topic: 'Yapılar', syntax: 'Kesiştir(<Nesne>, <Nesne>)', command: 'intersect', examples: ['Kesiştir(d,p)', 'Kesiştir(p,q)', 'Kesiştir(d,küre1)'] },
  { topic: 'Yapılar', syntax: 'İzdüşüm(<Nokta>, <Düzlem veya Doğru>)', command: 'project', examples: ['İzdüşüm(A,p)'] },
  { topic: 'Yapılar', syntax: 'DikDoğru(<Nokta>, <Düzlem veya Doğru>)', command: 'perpendicularLine', examples: ['DikDoğru(A,p)'] },
  { topic: 'Yapılar', syntax: 'ParalelDoğru(<Nokta>, <Doğru>)', command: 'parallelLine', examples: ['ParalelDoğru(A,d)'] },
  { topic: 'Yapılar', syntax: 'DikDüzlem(<Nokta>, <Doğru>)', command: 'perpendicularPlane', examples: ['DikDüzlem(A,d)'] },
  { topic: 'Yapılar', syntax: 'ParalelDüzlem(<Nokta>, <Düzlem>)', command: 'parallelPlane', examples: ['ParalelDüzlem(A,p)'] },
  { topic: 'Cisimler', syntax: 'KesikPiramit(<Nokta>, <Nokta>, <Kenar Sayısı>, <Yükseklik>, <Üst Oran>)', command: 'frustum', examples: ['KesikPiramit((0,0,0),(3,0,0),4,3,0.5)'] },
  { topic: 'Cisimler', syntax: 'KesikKoni(<Taban Merkezi>, <Tabandaki Nokta>, <Yükseklik>, <Üst Oran>)', command: 'frustumCone', examples: ['KesikKoni((0,0,0),(3,0,0),4,0.5)'] },
  { topic: 'Düzgün Çokyüzlüler', syntax: 'Dörtyüzlü(<Nokta>, <Nokta>)', command: 'tetrahedron', examples: ['Dörtyüzlü((0,0,0),(3,0,0))'] },
  { topic: 'Düzgün Çokyüzlüler', syntax: 'Küp(<Nokta>, <Nokta>)', command: 'cube', examples: ['Küp((0,0,0),(3,0,0))'] },
  { topic: 'Düzgün Çokyüzlüler', syntax: 'Sekizyüzlü(<Nokta>, <Nokta>)', command: 'octahedron', examples: ['Sekizyüzlü((0,0,0),(3,0,0))'] },
  { topic: 'Düzgün Çokyüzlüler', syntax: 'Onikiyüzlü(<Nokta>, <Nokta>)', command: 'dodecahedron', examples: ['Onikiyüzlü((0,0,0),(2,0,0))'] },
  { topic: 'Düzgün Çokyüzlüler', syntax: 'Yirmiyüzlü(<Nokta>, <Nokta>)', command: 'icosahedron', examples: ['Yirmiyüzlü((0,0,0),(2,0,0))'] },
  { topic: 'Kesit', syntax: 'Kesit(<Cisim>, <Düzlem>)', command: 'section', examples: ['Kesit(prizma1,p)'] },
  { topic: 'Açınım', syntax: 'Açınım(<Cisim>, <Açı (derece)>)', command: 'unfold', examples: ['Açınım(prizma1,90)', 'Açınım(koni1,a)'] },
  { topic: 'Açınım', syntax: 'Açınım(<Küp>, <Açı (derece)>, <Biçim (1–11)>)', command: 'unfold', examples: ['Açınım(küp1,90,3)'] },
  { topic: 'Ölçümler', syntax: 'Uzunluk(<Doğru Parçası>)', command: 'length', examples: ['Uzunluk(a)'] },
  { topic: 'Ölçümler', syntax: 'Uzaklık(<Nesne>, <Nesne>)', command: 'distance', examples: ['Uzaklık(A,B)', 'Uzaklık(A,p)', 'Uzaklık(a,b)'] },
  { topic: 'Ölçümler', syntax: 'Alan(<Cisim>)', command: 'baseArea', examples: ['Alan(prizma1)'] },
  { topic: 'Ölçümler', syntax: 'YüzeyAlanı(<Cisim>)', command: 'surfaceArea', examples: ['YüzeyAlanı(küre1)'] },
  { topic: 'Ölçümler', syntax: 'Hacim(<Cisim>)', command: 'volume', examples: ['Hacim(silindir1)'] },
  { topic: 'Parametre', syntax: 'Kaydırıcı: ad = değer', examples: ['a=2', 'n=5'] },
  { topic: 'Parametre', syntax: 'Parametreye bağlı nesne', examples: ['(a, 0, 1)', 'Prizma((0,0,0),(3,0,0),n)', 'Küre((0,2,0),a)'] },
  { topic: 'Ad Verme', syntax: '<Ad> = <Tanım>', examples: ['A=(1,0,1)', 's=DoğruParçası(A,B)'] },
]

/** `<Name>` marks a part of a template the user fills in. */
export const PLACEHOLDER = /<[\p{Lu}\p{Ll}][^<>,;]*>/gu

/** Command templates whose names (in any alias) start with the typed prefix. */
export function matchingTemplates(prefix: string): LanguageEntry[] {
  const typed = normalizedName(prefix)
  if (!typed) return []
  return LANGUAGE.filter(entry => entry.command && COMMAND_NAMES[entry.command].some(name => normalizedName(name).startsWith(typed)))
}
