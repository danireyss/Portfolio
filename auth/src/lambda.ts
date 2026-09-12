import { handle, type LambdaContext, type LambdaEvent } from 'hono/aws-lambda'
import { createApp } from './app.ts'
import { configFromSsm } from './config.ts'

// Built on an instance's first request (reading the secrets from SSM) and reused while it's warm.
let app: ReturnType<typeof handle> | undefined

export async function handler(event: LambdaEvent, context: LambdaContext) {
  app ??= handle(createApp(await configFromSsm()))
  return app(event, context)
}
