import { createServer } from 'vite'
import { startElectron } from './electron-process.mjs'

const server = await createServer({
  server: { host: '127.0.0.1', port: 5173, strictPort: false },
})
await server.listen()
server.printUrls()

const child = startElectron({
  DRAW3D_DEV_SERVER_URL: server.resolvedUrls.local[0],
})

let closing = false
async function close(code = 0) {
  if (closing) return
  closing = true
  if (child.exitCode === null && child.signalCode === null) child.kill()
  await server.close()
  process.exitCode = code
}

child.once('error', async (error) => {
  console.error(error)
  await close(1)
})
child.once('exit', (code, signal) => {
  void close(code ?? (signal ? 1 : 0))
})
process.once('SIGINT', () => { void close() })
process.once('SIGTERM', () => { void close() })
