import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib'
import type { Construct } from 'constructs'
import { Api } from './constructs/api'
import { Auth } from './constructs/auth'
import { MediaBucket } from './constructs/media-bucket'
import { SiteDomain, type SiteDomainProps } from './constructs/site-domain'
import { Website } from './constructs/website'

export interface AdminProps {
  /** The only Google account allowed into admin. */
  readonly email: string
  /** SSM prefix of the auth service's secrets (`make auth-secrets`). */
  readonly secretsPrefix: string
  /** The auth service (auth/), with its dependencies installed. */
  readonly authProjectRoot: string
}

export interface PortfolioStackProps extends StackProps {
  /** Custom domain; without one the site is served from its *.cloudfront.net address. */
  readonly domain?: SiteDomainProps
  /** Contact-form messages are sent to and from this SES-verified address. */
  readonly contactEmail: string
  /** Directory containing the Lambda `bootstrap` binary (cargo lambda build --release --arm64). */
  readonly lambdaCodePath: string
  /** The frontend's `dist/` directory (npm run build). */
  readonly siteAssetPath: string
  /** Signing in to edit the site's content (/admin). */
  readonly admin: AdminProps
}

/**
 * The whole site: CloudFront in front of the React app, the Rust API, the Better Auth service,
 * and the media bucket (content, photos, and uploads).
 */
export class PortfolioStack extends Stack {
  constructor(scope: Construct, id: string, props: PortfolioStackProps) {
    super(scope, id, props)

    const domain = props.domain ? new SiteDomain(this, 'Domain', props.domain) : undefined
    // Known up front with a custom domain. Admin uploads need it for CORS; without a domain the
    // CloudFront address isn't known until the distribution exists, so uploads stay off.
    const siteOrigin = props.domain ? `https://${props.domain.name}` : undefined
    const media = new MediaBucket(this, 'Media', {
      uploadOrigins: siteOrigin ? [siteOrigin] : [],
    })

    const api = new Api(this, 'Api', {
      codePath: props.lambdaCodePath,
      contactEmail: props.contactEmail,
      environment: { MEDIA_BUCKET: media.bucket.bucketName },
    })
    // The API lists gallery folders; CloudFront serves the photos themselves.
    media.grantList(api.handler, 'photos/')

    const website = new Website(this, 'Website', {
      assetPath: props.siteAssetPath,
      apiOriginDomain: api.originDomain,
      mediaBucket: media.bucket,
      domain,
    })
    domain?.pointTo(website.distribution)

    // Admin: Google sign-in through the auth service. The API reads and saves the content in the
    // media bucket, lets only the admin email in, takes changes only from the site itself, and
    // clears CloudFront's cached API responses after a save.
    const auth = new Auth(this, 'Auth', {
      projectRoot: props.admin.authProjectRoot,
      siteUrl: website.url,
      adminEmail: props.admin.email,
      secretsPrefix: props.admin.secretsPrefix,
    })
    api.addAuth(auth.handler)
    media.grantAdmin(api.handler)
    api.handler.addEnvironment('CONTENT_BUCKET', media.bucket.bucketName)
    api.handler.addEnvironment('ADMIN_EMAIL', props.admin.email)
    api.handler.addEnvironment('ADMIN_ORIGINS', website.url)
    api.handler.addEnvironment('DISTRIBUTION_ID', website.distribution.distributionId)
    website.distribution.grantCreateInvalidation(api.handler)

    new CfnOutput(this, 'SiteUrl', { value: website.url })
    new CfnOutput(this, 'DistributionDomainName', {
      value: website.distribution.distributionDomainName,
    })
    // `make content-push` reads this.
    new CfnOutput(this, 'DistributionId', { value: website.distribution.distributionId })
    // `make upload-photos` and the content targets read this.
    new CfnOutput(this, 'MediaBucketName', { value: media.bucket.bucketName })
    new CfnOutput(this, 'ApiEndpoint', { value: api.httpApi.apiEndpoint })
  }
}
