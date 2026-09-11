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
  /** Only pushes to this repo and branch may assume the GitHub Actions deploy role. */
  github: { repository: 'danireyss/Portfolio', branch: 'main' },
} as const
