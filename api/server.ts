import { initDatabase } from './database.js'
import app from './app.js'

const PORT = process.env.PORT || 3001

async function start() {
  await initDatabase()
  const server = app.listen(PORT, () => {
    console.log(`MindBridge Assist Server ready on port ${PORT}`)
  })
  process.on('SIGTERM', () => { server.close(() => process.exit(0)) })
  process.on('SIGINT', () => { server.close(() => process.exit(0)) })
}

start()
