import { spawn } from 'node:child_process'
import electron from 'electron'

export function startElectron(overrides = {}) {
  const env = { ...process.env, ...overrides }
  // Editörlerin Node yardımcı süreçleri için ayarladığı değişken GUI'ye taşınmaz.
  delete env.ELECTRON_RUN_AS_NODE
  return spawn(electron, ['.'], { stdio: 'inherit', env })
}
