// docs/play/magaza.md içindeki (awPDF ve awCELL'deki betiğin kopyası) mağaza metinlerinin Play'in karakter sınırlarına sığdığını denetler.
import { readFileSync } from 'node:fs'

const text = readFileSync(new URL('../../docs/play/magaza.md', import.meta.url), 'utf8')
const limits = { ad: 30, kisa: 80, tam: 4000 }
// Sürüm notları ("Bu sürümdeki yenilikler") her sürüm için ayrı, en çok 500 karakter.
for (const [, version] of text.matchAll(/<!-- not-([\d.]+) -->/g)) limits[`not-${version}`] = 500
let failed = false
for (const [key, limit] of Object.entries(limits)) {
  const match = text.match(new RegExp(`<!-- ${key} -->\\n([\\s\\S]*?)\\n<!-- /${key} -->`))
  if (!match) throw new Error(`${key} bölümü bulunamadı`)
  const length = [...match[1]].length
  failed ||= length > limit
  console.log(`${key}: ${length} / ${limit}${length > limit ? '  SINIRI AŞIYOR' : ''}`)
}
process.exit(failed ? 1 : 0)
