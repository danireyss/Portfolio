import { join } from 'node:path'
import { Duration, RemovalPolicy } from 'aws-cdk-lib'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment'
import { Construct } from 'constructs'
import { VIEWER_REQUEST_CODE } from '../viewer-request'
import type { SiteDomain } from './site-domain'

export interface WebsiteProps {
  /** The frontend's `dist/` directory (npm run build). */
  readonly assetPath: string
  /** Hostname that serves /api/* (the HTTP API). */
  readonly apiOriginDomain: string
  /** Bucket that serves /photos/* and /uploads/*. */
  readonly mediaBucket: s3.IBucket
  /** Custom domain; without one the site uses its *.cloudfront.net address. */
  readonly domain?: SiteDomain
}

/**
 * The built React app in a private bucket behind CloudFront, which also fronts the API and the
 * media bucket:
 * - `/api/auth/*`, `/api/admin/*` -> the API origin, never cached (sign-in and admin)
 * - `/api/*`                      -> the API origin, cached for a few minutes
 * - `/photos/*`, `/uploads/*`     -> the media bucket
 * - everything else               -> the site bucket
 */
export class Website extends Construct {
  readonly distribution: cloudfront.Distribution
  /** https://<custom domain>, or https://<id>.cloudfront.net without one. */
  readonly url: string

  constructor(scope: Construct, id: string, props: WebsiteProps) {
    super(scope, id)

    const siteBucket = new s3.Bucket(this, 'Bucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // Rebuilt from git on every deploy, so it's safe to delete along with the stack.
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    })

    const viewerRequest = new cloudfront.Function(this, 'ViewerRequest', {
      comment: 'Redirect www to the apex; serve index.html for app routes',
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(VIEWER_REQUEST_CODE),
    })

    // Content only changes on deploy (which invalidates the cache) or photo uploads, so a short
    // TTL is plenty. Query strings are part of the key for /api/projects?tag=...
    const apiCachePolicy = new cloudfront.CachePolicy(this, 'ApiCachePolicy', {
      comment: 'Portfolio API responses',
      defaultTtl: Duration.minutes(5),
      minTtl: Duration.seconds(0),
      maxTtl: Duration.hours(1),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    })

    const securityHeaders = cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS
    const api = new origins.HttpOrigin(props.apiOriginDomain)
    const media = origins.S3BucketOrigin.withOriginAccessControl(props.mediaBucket)
    // Sign-in and admin: never cached, with every cookie and header passed through.
    const uncachedApi: cloudfront.BehaviorOptions = {
      origin: api,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      responseHeadersPolicy: securityHeaders,
    }
    const mediaFiles: cloudfront.BehaviorOptions = {
      origin: media,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      responseHeadersPolicy: securityHeaders,
    }
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'Portfolio site',
      domainNames: props.domain?.names,
      certificate: props.domain?.certificate,
      defaultRootObject: 'index.html',
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: securityHeaders,
        functionAssociations: [
          { function: viewerRequest, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
        ],
      },
      // CloudFront uses the first pattern that matches, so the uncached /api paths come first.
      additionalBehaviors: {
        '/api/auth/*': uncachedApi,
        '/api/admin/*': uncachedApi,
        '/api/*': {
          origin: api,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: apiCachePolicy,
          // API Gateway routes on its own Host header, so forward everything except Host.
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: securityHeaders,
        },
        '/photos/*': mediaFiles,
        // Headshots uploaded through admin.
        '/uploads/*': mediaFiles,
      },
    })
    this.url = `https://${props.domain?.names[0] ?? this.distribution.distributionDomainName}`

    this.upload(siteBucket, props.assetPath)
  }

  /**
   * Uploads the build in two parts. Vite's hashed bundles (`assets/`) never change, so browsers
   * may cache them for a year; they go up first and are never pruned, so a page loaded before a
   * deploy can still fetch its bundles. Everything else (index.html, favicon, headshot) is
   * revalidated by browsers on every visit, but CloudFront keeps it (`s-maxage`) until the next
   * deploy invalidates `/*`, so those revalidations are answered at the edge instead of going
   * back to S3. Local gallery photos are skipped: they belong in the media bucket.
   */
  private upload(bucket: s3.IBucket, assetPath: string) {
    const assets = new s3deploy.BucketDeployment(this, 'DeployAssets', {
      sources: [s3deploy.Source.asset(join(assetPath, 'assets'))],
      destinationBucket: bucket,
      destinationKeyPrefix: 'assets/',
      cacheControl: [s3deploy.CacheControl.fromString('public, max-age=31536000, immutable')],
      prune: false,
    })
    const site = new s3deploy.BucketDeployment(this, 'DeploySite', {
      sources: [s3deploy.Source.asset(assetPath, { exclude: ['assets/**', 'photos/**'] })],
      destinationBucket: bucket,
      cacheControl: [
        s3deploy.CacheControl.fromString('public, max-age=0, s-maxage=31536000, must-revalidate'),
      ],
      prune: false,
      distribution: this.distribution,
      distributionPaths: ['/*'],
    })
    site.node.addDependency(assets)
  }
}
