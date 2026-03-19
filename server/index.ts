import { createLanServer } from './socket-server'

const port = Number(process.env.PORT ?? 3001)
const telemetryDatabasePath = process.env.TELEMETRY_DB_PATH

createLanServer({
  port,
  telemetryDatabasePath,
})
  .then((server) => {
    console.log(`Lemonade LAN server listening on 0.0.0.0:${server.port}`)
  })
  .catch((error) => {
    console.error('Failed to start Lemonade LAN server.')
    console.error(error)
    process.exit(1)
  })
