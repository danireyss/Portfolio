import { App } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { PortfolioStack, type PortfolioStackProps } from '../lib/portfolio-stack'
import { env, fakeBuilds } from './helpers'

// The constructs have their own tests; these check how the stack wires them together.

function synth(overrides: Partial<PortfolioStackProps> = {}) {
  const stack = new PortfolioStack(new App(), 'Test', {
    env,
    domain: { name: 'example.dev', hostedZoneId: 'Z123' },
    contactEmail: 'me@example.com',
    ...fakeBuilds(),
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
