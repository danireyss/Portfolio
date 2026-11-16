import { Match, Template } from 'aws-cdk-lib/assertions'
import * as s3 from 'aws-cdk-lib/aws-s3'
import { PageRenderer } from '../../lib/constructs/page-renderer'
import { SiteDomain } from '../../lib/constructs/site-domain'
import { Website } from '../../lib/constructs/website'
import { fakeBuilds, testStack } from '../helpers'

function synth({ withDomain }: { withDomain: boolean }) {
  const stack = testStack()
  const { siteAssetPath, siteServerPath } = fakeBuilds()
  new Website(stack, 'Website', {
    assetPath: siteAssetPath,
    renderer: new PageRenderer(stack, 'Renderer', {
      codePath: siteServerPath,
      apiUrl: 'https://api.example.com',
    }),
    apiOriginDomain: 'api.example.com',
    mediaBucket: new s3.Bucket(stack, 'Media'),
    domain: withDomain
      ? new SiteDomain(stack, 'Domain', { name: 'example.dev', hostedZoneId: 'Z123' })
      : undefined,
  })
  return Template.fromStack(stack)
}

const template = synth({ withDomain: true })

test('routes /api/* to the API and /photos/* to the media bucket', () => {
  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: Match.objectLike({
      Aliases: ['example.dev', 'www.example.dev'],
      CacheBehaviors: Match.arrayWith([
        Match.objectLike({ PathPattern: '/api/*', AllowedMethods: Match.arrayWith(['POST']) }),
        Match.objectLike({ PathPattern: '/photos/*' }),
      ]),
    }),
  })
})

test('never caches sign-in or admin, and matches them before the cached /api/*', () => {
  const [distribution] = Object.values(template.findResources('AWS::CloudFront::Distribution'))
  const behaviors: { PathPattern: string; CachePolicyId: string }[] =
    distribution.Properties.DistributionConfig.CacheBehaviors
  const patterns = behaviors.map((behavior) => behavior.PathPattern)
  const cachingDisabled = '4135ea2d-6df8-44a3-9df3-4b5a84be39ad'
  for (const pattern of ['/api/auth/*', '/api/admin/*']) {
    expect(patterns.indexOf(pattern)).toBeLessThan(patterns.indexOf('/api/*'))
    expect(behaviors.find((b) => b.PathPattern === pattern)?.CachePolicyId).toBe(cachingDisabled)
  }
  expect(patterns).toContain('/uploads/*')
})

type Behavior = {
  PathPattern?: string
  TargetOriginId: string
  CachePolicyId: unknown
  FunctionAssociations?: unknown[]
}
const distributionConfig = () => {
  const [distribution] = Object.values(template.findResources('AWS::CloudFront::Distribution'))
  return distribution.Properties.DistributionConfig as {
    DefaultCacheBehavior: Behavior
    CacheBehaviors: Behavior[]
    Origins: { Id: string; DomainName: unknown; OriginAccessControlId?: unknown }[]
  }
}

test('sends pages to the server renderer and files to the site bucket', () => {
  const config = distributionConfig()
  const origin = (behavior: Behavior) =>
    JSON.stringify(config.Origins.find((o) => o.Id === behavior.TargetOriginId)?.DomainName)
  expect(origin(config.DefaultCacheBehavior)).toMatch(/RendererHandlerFunctionUrl/)
  // Without a default root object, / is a page like any other rather than index.html.
  expect(config).not.toHaveProperty('DefaultRootObject')

  const patterns = config.CacheBehaviors.map((behavior) => behavior.PathPattern)
  for (const pattern of ['/assets/*', '/*.*']) {
    const behavior = config.CacheBehaviors.find((b) => b.PathPattern === pattern)!
    expect(origin(behavior)).toMatch(/WebsiteBucket/)
    // The catch-all for files mustn't catch /api/* or the media files.
    for (const earlier of ['/api/*', '/photos/*', '/uploads/*']) {
      expect(patterns.indexOf(earlier)).toBeLessThan(patterns.indexOf(pattern))
    }
  }
})

test('keeps pages only as long as the renderer says, keyed by query string', () => {
  template.hasResourceProperties('AWS::CloudFront::CachePolicy', {
    CachePolicyConfig: Match.objectLike({
      MinTTL: 0,
      DefaultTTL: 0,
      ParametersInCacheKeyAndForwardedToOrigin: Match.objectLike({
        QueryStringsConfig: { QueryStringBehavior: 'all' },
      }),
    }),
  })
})

test('lets only CloudFront call the renderer', () => {
  template.hasResourceProperties('AWS::Lambda::Url', { AuthType: 'AWS_IAM' })
  template.hasResourceProperties('AWS::CloudFront::OriginAccessControl', {
    OriginAccessControlConfig: Match.objectLike({ OriginAccessControlOriginType: 'lambda' }),
  })
  for (const action of ['lambda:InvokeFunctionUrl', 'lambda:InvokeFunction']) {
    template.hasResourceProperties('AWS::Lambda::Permission', {
      Action: action,
      Principal: 'cloudfront.amazonaws.com',
      SourceArn: Match.anyValue(),
    })
  }
  template.hasResourceProperties('AWS::Lambda::Permission', {
    Action: 'lambda:InvokeFunction',
    InvokedViaFunctionUrl: true,
  })
})

test('runs the www redirect on pages and files', () => {
  template.hasResourceProperties('AWS::CloudFront::Function', {
    FunctionConfig: Match.objectLike({ Runtime: 'cloudfront-js-2.0' }),
  })
  const config = distributionConfig()
  for (const behavior of [
    config.DefaultCacheBehavior,
    ...config.CacheBehaviors.filter((b) => ['/assets/*', '/*.*'].includes(b.PathPattern!)),
  ]) {
    expect(behavior.FunctionAssociations).toHaveLength(1)
  }
})

test('uploads hashed assets as immutable, and the rest revalidated by browsers but kept at the edge', () => {
  template.hasResourceProperties('Custom::CDKBucketDeployment', {
    DestinationBucketKeyPrefix: 'assets/',
    SystemMetadata: { 'cache-control': 'public, max-age=31536000, immutable' },
  })
  template.hasResourceProperties('Custom::CDKBucketDeployment', {
    SystemMetadata: { 'cache-control': 'public, max-age=0, s-maxage=31536000, must-revalidate' },
    // The deploy invalidation is what makes the long edge TTL safe.
    DistributionPaths: ['/*'],
  })
})

test('works without a custom domain', () => {
  const noDomain = synth({ withDomain: false })
  noDomain.resourceCountIs('AWS::CertificateManager::Certificate', 0)
  noDomain.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: Match.objectLike({ Aliases: Match.absent() }),
  })
})
