import { startElectron } from './electron-process.mjs'

const child = startElectron({ DRAW3D_DEV_SERVER_URL: '' })
child.once('error', error => {
  console.error(error)
  process.exitCode = 1
})
child.once('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0)
})
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal)
  })
}
