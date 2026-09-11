import { join } from 'node:path'
import { CfnOutput, Duration, Fn, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib'
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2'
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import * as acm from 'aws-cdk-lib/aws-certificatemanager'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as route53 from 'aws-cdk-lib/aws-route53'
import * as targets from 'aws-cdk-lib/aws-route53-targets'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment'
import * as ses from 'aws-cdk-lib/aws-ses'
import type { Construct } from 'constructs'
import { VIEWER_REQUEST_CODE } from './viewer-request'

export interface PortfolioStackProps extends StackProps {
  /** Custom domain; without one the site is served from its *.cloudfront.net address. */
  domain?: { name: string; hostedZoneId: string }
  /** Contact-form messages are sent to and from this SES-verified address. */
  contactEmail: string
  /** Directory containing the Lambda `bootstrap` binary (cargo lambda build --release --arm64). */
  lambdaCodePath: string
  /** The frontend's `dist/` directory (npm run build). */
  siteAssetPath: string
}

/**
 * The whole site behind one CloudFront distribution:
 * - `/api/*`    -> API Gateway HTTP API -> the Rust Axum Lambda
 * - `/photos/*` -> the media bucket (gallery photos, uploaded separately and not in git)
 * - everything else -> the site bucket (the built React app)
 */
export class PortfolioStack extends Stack {
  constructor(scope: Construct, id: string, props: PortfolioStackProps) {
    super(scope, id, props)

    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // Rebuilt from git on every deploy, so it's safe to delete along with the stack.
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    })

    const mediaBucket = new s3.Bucket(this, 'MediaBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // Photos only live here, so keep them even if the stack is deleted, and keep overwritten
      // or deleted versions for 30 days in case of mistakes.
      removalPolicy: RemovalPolicy.RETAIN,
      versioned: true,
      lifecycleRules: [{ noncurrentVersionExpiration: Duration.days(30) }],
    })

    // --- API: Rust Axum on Lambda behind an HTTP API ---

    const contactIdentity = new ses.EmailIdentity(this, 'ContactEmail', {
      identity: ses.Identity.email(props.contactEmail),
    })

    const api = new lambda.Function(this, 'Api', {
      description: 'Rust Axum API (backend/, portfolio-api)',
      runtime: lambda.Runtime.PROVIDED_AL2023,
      architecture: lambda.Architecture.ARM_64,
      handler: 'bootstrap',
      code: lambda.Code.fromAsset(props.lambdaCodePath),
      memorySize: 256,
      timeout: Duration.seconds(10),
      environment: {
        CONTACT_TO_EMAIL: props.contactEmail,
        CONTACT_FROM_EMAIL: props.contactEmail,
        MEDIA_BUCKET: mediaBucket.bucketName,
      },
      logGroup: new logs.LogGroup(this, 'ApiLogs', {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    })
    contactIdentity.grantSendEmail(api)
    // The API only lists gallery folders; CloudFront serves the images themselves.
    api.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:ListBucket'],
        resources: [mediaBucket.bucketArn],
        conditions: { StringLike: { 's3:prefix': 'photos/*' } },
      }),
    )

    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      description: 'Portfolio API (reached through CloudFront at /api/*)',
      defaultIntegration: new HttpLambdaIntegration('ApiIntegration', api),
      createDefaultStage: false,
    })
    new apigwv2.HttpStage(this, 'HttpApiStage', {
      httpApi,
      stageName: '$default',
      autoDeploy: true,
      // Caps abuse (e.g. contact-form spam). The account's Lambda concurrency quota is too small
      // to reserve concurrency from, so this is the limit instead.
      throttle: { rateLimit: 10, burstLimit: 20 },
    })
    // "https://abc123.execute-api.us-east-1.amazonaws.com" -> "abc123.execute-api.us-east-1.amazonaws.com"
    const apiDomain = Fn.select(2, Fn.split('/', httpApi.apiEndpoint))

    // --- Domain: certificate for the apex and www ---

    const zone = props.domain
      ? route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
          hostedZoneId: props.domain.hostedZoneId,
          zoneName: props.domain.name,
        })
      : undefined
    const domainNames = props.domain ? [props.domain.name, `www.${props.domain.name}`] : undefined
    const certificate =
      props.domain && zone
        ? new acm.Certificate(this, 'Certificate', {
            domainName: props.domain.name,
            subjectAlternativeNames: [`www.${props.domain.name}`],
            validation: acm.CertificateValidation.fromDns(zone),
          })
        : undefined

    // --- CloudFront ---

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
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'Portfolio site',
      domainNames,
      certificate,
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
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.HttpOrigin(apiDomain),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: apiCachePolicy,
          // API Gateway routes on its own Host header, so forward everything except Host.
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: securityHeaders,
        },
        '/photos/*': {
          origin: origins.S3BucketOrigin.withOriginAccessControl(mediaBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          responseHeadersPolicy: securityHeaders,
        },
      },
    })

    if (zone && domainNames) {
      const target = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution))
      for (const [prefix, recordName] of [['Apex', domainNames[0]], ['Www', domainNames[1]]]) {
        new route53.ARecord(this, `${prefix}A`, { zone, recordName, target })
        new route53.AaaaRecord(this, `${prefix}Aaaa`, { zone, recordName, target })
      }
    }

    // --- Site upload ---

    // Vite's hashed bundles never change, so browsers may cache them for a year. They go up
    // first and are never pruned, so a page loaded before a deploy can still fetch its bundles.
    const deployAssets = new s3deploy.BucketDeployment(this, 'DeployAssets', {
      sources: [s3deploy.Source.asset(join(props.siteAssetPath, 'assets'))],
      destinationBucket: siteBucket,
      destinationKeyPrefix: 'assets/',
      cacheControl: [s3deploy.CacheControl.fromString('public, max-age=31536000, immutable')],
      prune: false,
    })
    // Everything else (index.html, favicon, headshot) is revalidated on every visit. Local
    // gallery photos are skipped: they belong in the media bucket (`make upload-photos`).
    const deploySite = new s3deploy.BucketDeployment(this, 'DeploySite', {
      sources: [s3deploy.Source.asset(props.siteAssetPath, { exclude: ['assets/**', 'photos/**'] })],
      destinationBucket: siteBucket,
      cacheControl: [s3deploy.CacheControl.fromString('public, max-age=0, must-revalidate')],
      prune: false,
      distribution,
      distributionPaths: ['/*'],
    })
    deploySite.node.addDependency(deployAssets)

    new CfnOutput(this, 'SiteUrl', {
      value: props.domain
        ? `https://${props.domain.name}`
        : `https://${distribution.distributionDomainName}`,
    })
    new CfnOutput(this, 'DistributionDomainName', { value: distribution.distributionDomainName })
    new CfnOutput(this, 'DistributionId', { value: distribution.distributionId })
    // `make upload-photos` reads this.
    new CfnOutput(this, 'MediaBucketName', { value: mediaBucket.bucketName })
    new CfnOutput(this, 'ApiEndpoint', { value: httpApi.apiEndpoint })
  }
}
