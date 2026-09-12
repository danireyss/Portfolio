/** What the auth service needs; dev.ts reads it from auth/.env, lambda.ts from SSM. */
export type AuthConfig = {
  /** Where the site runs, e.g. "https://danireyss.dev"; Google sends you back here. */
  baseURL: string
  /** Signs and encrypts the session cookies. */
  secret: string
  googleClientId: string
  googleClientSecret: string
  /** The only Google account allowed to keep a session. */
  adminEmail: string
}

const ENV_NAMES: Record<keyof AuthConfig, string> = {
  baseURL: 'BETTER_AUTH_URL',
  secret: 'BETTER_AUTH_SECRET',
  googleClientId: 'GOOGLE_CLIENT_ID',
  googleClientSecret: 'GOOGLE_CLIENT_SECRET',
  adminEmail: 'ADMIN_EMAIL',
}

/** Reads the config from environment variables, naming any that are missing. */
export function configFromEnv(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const missing = Object.values(ENV_NAMES).filter((name) => !env[name])
  if (missing.length > 0) {
    throw new Error(`missing ${missing.join(', ')}`)
  }
  const entries = Object.entries(ENV_NAMES).map(([field, name]) => [field, env[name]])
  return Object.fromEntries(entries) as AuthConfig
}

/** SSM parameter names under `SSM_PREFIX`, for the settings that are secrets. */
const SSM_NAMES = {
  GOOGLE_CLIENT_ID: 'google-client-id',
  GOOGLE_CLIENT_SECRET: 'google-client-secret',
  BETTER_AUTH_SECRET: 'better-auth-secret',
}

/**
 * In Lambda: the secrets from SSM Parameter Store (SecureString parameters under `SSM_PREFIX`,
 * e.g. /portfolio/auth/google-client-secret), everything else from the environment.
 */
export async function configFromSsm(env: NodeJS.ProcessEnv = process.env): Promise<AuthConfig> {
  const prefix = env.SSM_PREFIX ?? '/portfolio/auth'
  // The Lambda runtime includes the AWS SDK; importing it here keeps it out of local dev.
  const { GetParametersCommand, SSMClient } = await import('@aws-sdk/client-ssm')
  const { Parameters = [] } = await new SSMClient({}).send(
    new GetParametersCommand({
      Names: Object.values(SSM_NAMES).map((name) => `${prefix}/${name}`),
      WithDecryption: true,
    }),
  )
  const found = new Map(Parameters.map((parameter) => [parameter.Name, parameter.Value]))
  const secrets = Object.fromEntries(
    Object.entries(SSM_NAMES).map(([envName, name]) => [envName, found.get(`${prefix}/${name}`)]),
  )
  return configFromEnv({ ...env, ...secrets })
}
