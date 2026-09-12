// `make dev`: the auth service on :3002, configured by auth/.env. Vite sends /api/auth here.
import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { configFromEnv, type AuthConfig } from './config.ts'

const port = Number(process.env.AUTH_PORT ?? 3002)

/** The config from auth/.env, or `null` (with a hint) if it isn't filled in yet. */
function loadConfig(): AuthConfig | null {
  try {
    process.loadEnvFile('.env')
    return configFromEnv()
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.warn(`auth: admin sign-in is off (${reason}). Copy auth/.env.example to auth/.env and fill it in.`)
    return null
  }
}

const config = loadConfig()
if (config) {
  serve({ fetch: createApp(config).fetch, port }, () => {
    console.log(`auth: listening on http://localhost:${port}`)
  })
}
