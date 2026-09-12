import { betterAuth } from 'better-auth'
import { createAuthMiddleware } from 'better-auth/api'
import { deleteSessionCookie } from 'better-auth/cookies'
import type { AuthConfig } from './config.ts'

const WEEK = 7 * 24 * 60 * 60

/** Whether a Google account is the admin's: a verified address, compared case-insensitively. */
export function isAdmin(
  user: { email: string; emailVerified: boolean } | undefined,
  adminEmail: string,
): boolean {
  return !!user && user.emailVerified && user.email.toLowerCase() === adminEmail.toLowerCase()
}

export function createAuth(config: AuthConfig) {
  return betterAuth({
    baseURL: config.baseURL,
    secret: config.secret,
    // No database: Better Auth's stateless mode keeps the session, the OAuth state, and the
    // Google account in encrypted cookies. Plenty for one admin.
    session: {
      expiresIn: WEEK,
      cookieCache: { enabled: true, strategy: 'jwe', maxAge: WEEK, refreshCache: true },
    },
    account: { storeStateStrategy: 'cookie', storeAccountCookie: true },
    socialProviders: {
      google: {
        clientId: config.googleClientId,
        clientSecret: config.googleClientSecret,
        // Always ask which account, in case the browser is signed in to several.
        prompt: 'select_account',
      },
    },
    hooks: {
      // Only the admin keeps a session. Anyone else who signs in with Google has the session
      // Better Auth just created cleared and is sent back to /admin with an error. (The API also
      // checks the email on every admin request.)
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/callback/:id') return
        const user = ctx.context.newSession?.user
        if (!user || isAdmin(user, config.adminEmail)) return
        deleteSessionCookie(ctx)
        throw ctx.redirect(`${config.baseURL}/admin?error=not-allowed`)
      }),
    },
  })
}
