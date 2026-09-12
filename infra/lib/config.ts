/** Deployment settings. None of these are secrets. */
export const config = {
  /** CloudFront only accepts certificates from us-east-1, so the whole site lives here. */
  region: 'us-east-1',
  /** Registered in Route 53, which created the hosted zone. */
  domain: { name: 'danireyss.dev', hostedZoneId: 'Z0195012FC2AI1KKW6FI' },
  /**
   * Contact-form messages are sent to and from this address. The first deploy asks SES to
   * verify it, so click the link in the email AWS sends.
   */
  contactEmail: 'danieljreyes2001@gmail.com',
  /** Editing the site's content at /admin. */
  admin: {
    /** The only Google account allowed in. */
    email: 'danieljreyes2001@gmail.com',
    /**
     * Where the auth service's secrets live in SSM Parameter Store, as SecureStrings:
     * google-client-id, google-client-secret, and better-auth-secret. `make auth-secrets`
     * creates them (the secrets themselves never go in git).
     */
    secretsPrefix: '/portfolio/auth',
  },
  /**
   * Only pushes to this repo and branch may assume the GitHub Actions deploy role. The repo uses
   * GitHub's immutable OIDC subjects, which identify the owner and repo by numeric ID as well as
   * name (see `gh api repos/danireyss/Portfolio/actions/oidc/customization/sub`).
   */
  github: {
    repository: { owner: 'danireyss', ownerId: 137007934, name: 'Portfolio', id: 1366454259 },
    branch: 'main',
  },
} as const
