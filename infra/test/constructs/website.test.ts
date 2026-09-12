import { Match, Template } from 'aws-cdk-lib/assertions'
import * as s3 from 'aws-cdk-lib/aws-s3'
import { SiteDomain } from '../../lib/constructs/site-domain'
import { Website } from '../../lib/constructs/website'
import { fakeBuilds, testStack } from '../helpers'

function synth({ withDomain }: { withDomain: boolean }) {
  const stack = testStack()
  new Website(stack, 'Website', {
    assetPath: fakeBuilds().siteAssetPath,
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
      DefaultRootObject: 'index.html',
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

test('runs the viewer-request function on the site', () => {
  template.hasResourceProperties('AWS::CloudFront::Function', {
    FunctionConfig: Match.objectLike({ Runtime: 'cloudfront-js-2.0' }),
  })
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
