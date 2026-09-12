import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from './app.ts'
import { isAdmin } from './auth.ts'
import type { AuthConfig } from './config.ts'

const config: AuthConfig = {
  baseURL: 'http://localhost:5173',
  secret: 'a-test-secret-that-is-long-enough-for-better-auth',
  googleClientId: 'client-id',
  googleClientSecret: 'client-secret',
  adminEmail: 'Owner@Example.com',
}

type App = ReturnType<typeof createApp>

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Cookies as a browser would keep them, applying each response's Set-Cookie headers in order. */
class CookieJar {
  private cookies = new Map<string, string>()

  apply(response: Response) {
    for (const header of response.headers.getSetCookie()) {
      const [pair, ...attributes] = header.split(';')
      const index = pair.indexOf('=')
      const name = pair.slice(0, index).trim()
      const value = pair.slice(index + 1).trim()
      const expired = attributes.some((a) => /^\s*max-age=0\s*$/i.test(a)) || value === ''
      if (expired) this.cookies.delete(name)
      else this.cookies.set(name, value)
    }
  }

  header() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ')
  }

  has(name: string) {
    return [...this.cookies.keys()].some((cookie) => cookie.endsWith(name))
  }
}

/** An ID token as Google's token endpoint returns it; on this path only its claims are read. */
function idToken(claims: Record<string, unknown>) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const payload = { iss: 'https://accounts.google.com', aud: config.googleClientId, sub: '1234', name: 'Test', iat: now, exp: now + 3600, ...claims }
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(payload)}.signature`
}

/** Signs in with Google as `email`: starts sign-in, then plays Google's callback. */
async function signIn(app: App, email: string, emailVerified = true) {
  const jar = new CookieJar()
  const start = await app.request('/api/auth/sign-in/social', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: config.baseURL },
    body: JSON.stringify({ provider: 'google', callbackURL: '/', errorCallbackURL: '/admin' }),
  })
  jar.apply(start)
  const { url } = (await start.json()) as { url: string }
  const state = new URL(url).searchParams.get('state')

  // Better Auth exchanges the code at Google's token endpoint; answer as Google would.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        access_token: 'access-token',
        token_type: 'Bearer',
        expires_in: 3600,
        id_token: idToken({ email, email_verified: emailVerified }),
      }),
    ),
  )
  const callback = await app.request(`/api/auth/callback/google?code=code&state=${state}`, {
    headers: { cookie: jar.header() },
  })
  vi.unstubAllGlobals()
  jar.apply(callback)
  return { callback, jar }
}

async function session(app: App, jar: CookieJar) {
  const response = await app.request('/api/auth/get-session', { headers: { cookie: jar.header() } })
  return (await response.json()) as { user: { email: string } } | null
}

describe('isAdmin', () => {
  it('needs the admin email, verified, in any case', () => {
    expect(isAdmin({ email: 'owner@example.com', emailVerified: true }, 'Owner@Example.com')).toBe(true)
    expect(isAdmin({ email: 'owner@example.com', emailVerified: false }, 'Owner@Example.com')).toBe(false)
    expect(isAdmin({ email: 'someone@example.com', emailVerified: true }, 'Owner@Example.com')).toBe(false)
    expect(isAdmin(undefined, 'Owner@Example.com')).toBe(false)
  })
})

describe('auth service', () => {
  it('has no session without cookies, and nothing outside /api/auth', async () => {
    const app = createApp(config)
    const response = await app.request('/api/auth/get-session')
    expect(response.status).toBe(200)
    expect(await response.json()).toBeNull()
    expect((await app.request('/api/site')).status).toBe(404)
  })

  it('starts Google sign-in with a callback to the site', async () => {
    const app = createApp(config)
    const response = await app.request('/api/auth/sign-in/social', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: config.baseURL },
      body: JSON.stringify({ provider: 'google', callbackURL: '/' }),
    })
    expect(response.status).toBe(200)
    const google = new URL(((await response.json()) as { url: string }).url)
    expect(google.hostname).toBe('accounts.google.com')
    expect(google.searchParams.get('client_id')).toBe('client-id')
    expect(google.searchParams.get('redirect_uri')).toBe('http://localhost:5173/api/auth/callback/google')
    expect(google.searchParams.get('prompt')).toBe('select_account')
  })

  it('keeps the admin signed in', async () => {
    const app = createApp(config)
    const { callback, jar } = await signIn(app, 'owner@example.com')
    expect(callback.status).toBe(302)
    expect(callback.headers.get('location')).not.toContain('error')
    expect(jar.has('session_token')).toBe(true)
    expect((await session(app, jar))?.user.email).toBe('owner@example.com')
  })

  it.each([
    ['another account', 'someone@example.com', true],
    ['an unverified admin address', 'owner@example.com', false],
  ])('turns away %s without a session', async (_label, email, verified) => {
    const app = createApp(config)
    const { callback, jar } = await signIn(app, email, verified)
    expect(callback.status).toBe(302)
    expect(callback.headers.get('location')).toBe('http://localhost:5173/admin?error=not-allowed')
    expect(jar.has('session_token')).toBe(false)
    expect(jar.has('session_data')).toBe(false)
    expect(await session(app, jar)).toBeNull()
  })
})
