import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib'
import type { Construct } from 'constructs'
import { Api } from './constructs/api'
import { MediaBucket } from './constructs/media-bucket'
import { SiteDomain, type SiteDomainProps } from './constructs/site-domain'
import { Website } from './constructs/website'

export interface PortfolioStackProps extends StackProps {
  /** Custom domain; without one the site is served from its *.cloudfront.net address. */
  readonly domain?: SiteDomainProps
  /** Contact-form messages are sent to and from this SES-verified address. */
  readonly contactEmail: string
  /** Directory containing the Lambda `bootstrap` binary (cargo lambda build --release --arm64). */
  readonly lambdaCodePath: string
  /** The frontend's `dist/` directory (npm run build). */
  readonly siteAssetPath: string
}

/** The whole site: CloudFront in front of the React app, the Rust API, and the photos bucket. */
export class PortfolioStack extends Stack {
  constructor(scope: Construct, id: string, props: PortfolioStackProps) {
    super(scope, id, props)

    const domain = props.domain ? new SiteDomain(this, 'Domain', props.domain) : undefined
    const media = new MediaBucket(this, 'Media')

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

    new CfnOutput(this, 'SiteUrl', { value: website.url })
    new CfnOutput(this, 'DistributionDomainName', {
      value: website.distribution.distributionDomainName,
    })
    new CfnOutput(this, 'DistributionId', { value: website.distribution.distributionId })
    // `make upload-photos` reads this.
    new CfnOutput(this, 'MediaBucketName', { value: media.bucket.bucketName })
    new CfnOutput(this, 'ApiEndpoint', { value: api.httpApi.apiEndpoint })
  }
}
