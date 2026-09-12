import { Hono } from 'hono'
import { createAuth } from './auth.ts'
import type { AuthConfig } from './config.ts'

/** Better Auth's routes under /api/auth (CloudFront and Vite send them here); anything else 404s. */
export function createApp(config: AuthConfig) {
  const auth = createAuth(config)
  const app = new Hono()
  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))
  return app
}
