import { Match, Template } from 'aws-cdk-lib/assertions'
import { PortfolioStack, type PortfolioStackProps } from '../lib/portfolio-stack'
import { authProjectRoot, env, fakeBuilds, testApp } from './helpers'

// The constructs have their own tests; these check how the stack wires them together.

function synth(overrides: Partial<PortfolioStackProps> = {}) {
  const stack = new PortfolioStack(testApp(), 'Test', {
    env,
    domain: { name: 'example.dev', hostedZoneId: 'Z123' },
    contactEmail: 'me@example.com',
    ...fakeBuilds(),
    admin: { email: 'admin@example.com', secretsPrefix: '/test/auth', authProjectRoot },
    ...overrides,
  })
  return Template.fromStack(stack)
}

const template = synth()

test('gives the API the media bucket name and lets it list photos/', () => {
  template.hasResourceProperties('AWS::Lambda::Function', {
    Environment: {
      Variables: Match.objectLike({ MEDIA_BUCKET: { Ref: Match.stringLikeRegexp('^MediaBucket') } }),
    },
  })
  template.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Action: 's3:ListBucket',
          Condition: { StringLike: { 's3:prefix': 'photos/*' } },
        }),
      ]),
    },
  })
})

test('runs the auth service for the site and routes sign-in to it', () => {
  template.hasResourceProperties('AWS::Lambda::Function', {
    Runtime: 'nodejs24.x',
    Environment: {
      Variables: Match.objectLike({
        BETTER_AUTH_URL: 'https://example.dev',
        ADMIN_EMAIL: 'admin@example.com',
        SSM_PREFIX: '/test/auth',
      }),
    },
  })
  template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
    RouteKey: 'ANY /api/auth/{proxy+}',
  })
})

test('gives the API what admin needs', () => {
  template.hasResourceProperties('AWS::Lambda::Function', {
    Handler: 'bootstrap',
    Environment: {
      Variables: Match.objectLike({
        CONTENT_BUCKET: { Ref: Match.stringLikeRegexp('^MediaBucket') },
        ADMIN_EMAIL: 'admin@example.com',
        ADMIN_ORIGINS: 'https://example.dev',
        DISTRIBUTION_ID: { Ref: Match.stringLikeRegexp('^WebsiteDistribution') },
        AUTH_URL: Match.anyValue(),
      }),
    },
  })
  const policies = JSON.stringify(template.findResources('AWS::IAM::Policy'))
  for (const expected of ['cloudfront:CreateInvalidation', '/content/*', '/uploads/*', '/photos/*']) {
    expect(policies).toContain(expected)
  }
})

test('lets the site upload straight to the media bucket', () => {
  template.hasResourceProperties('AWS::S3::Bucket', {
    CorsConfiguration: {
      CorsRules: [
        Match.objectLike({ AllowedMethods: ['PUT'], AllowedOrigins: ['https://example.dev'] }),
      ],
    },
  })
})

test('serves the custom domain from the distribution', () => {
  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: Match.objectLike({ Aliases: ['example.dev', 'www.example.dev'] }),
  })
  template.resourceCountIs('AWS::Route53::RecordSet', 4)
  template.hasOutput('SiteUrl', { Value: 'https://example.dev' })
})

test('exports the outputs the Makefile relies on', () => {
  for (const output of ['MediaBucketName', 'DistributionId', 'DistributionDomainName', 'ApiEndpoint']) {
    template.hasOutput(output, {})
  }
})

test('works without a custom domain', () => {
  const noDomain = synth({ domain: undefined })
  noDomain.resourceCountIs('AWS::CertificateManager::Certificate', 0)
  noDomain.resourceCountIs('AWS::Route53::RecordSet', 0)
})
