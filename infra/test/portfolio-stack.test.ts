import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { App } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { PortfolioStack, type PortfolioStackProps } from '../lib/portfolio-stack'

/** Stand-ins for the Lambda binary and the frontend build, so tests don't need real builds. */
function fakeBuilds() {
  const root = mkdtempSync(join(tmpdir(), 'portfolio-infra-'))
  const lambdaCodePath = join(root, 'lambda')
  const siteAssetPath = join(root, 'dist')
  mkdirSync(lambdaCodePath)
  mkdirSync(join(siteAssetPath, 'assets'), { recursive: true })
  writeFileSync(join(lambdaCodePath, 'bootstrap'), '')
  writeFileSync(join(siteAssetPath, 'index.html'), '')
  writeFileSync(join(siteAssetPath, 'assets', 'index-abc.js'), '')
  return { lambdaCodePath, siteAssetPath }
}

function synth(overrides: Partial<PortfolioStackProps> = {}) {
  const stack = new PortfolioStack(new App(), 'Test', {
    env: { account: '123456789012', region: 'us-east-1' },
    domain: { name: 'example.dev', hostedZoneId: 'Z123' },
    contactEmail: 'me@example.com',
    ...fakeBuilds(),
    ...overrides,
  })
  return Template.fromStack(stack)
}

const template = synth()

test('runs the API as an arm64 custom-runtime Lambda with its configuration', () => {
  template.hasResourceProperties('AWS::Lambda::Function', {
    Runtime: 'provided.al2023',
    Architectures: ['arm64'],
    Handler: 'bootstrap',
    Environment: {
      Variables: Match.objectLike({
        CONTACT_TO_EMAIL: 'me@example.com',
        CONTACT_FROM_EMAIL: 'me@example.com',
        MEDIA_BUCKET: Match.anyValue(),
      }),
    },
  })
})

test('lets the API list only the photos prefix of the media bucket', () => {
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

test('throttles the HTTP API stage', () => {
  template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
    StageName: '$default',
    DefaultRouteSettings: { ThrottlingRateLimit: 10, ThrottlingBurstLimit: 20 },
  })
})

test('keeps the media bucket, versioned and private, if the stack is deleted', () => {
  template.hasResource('AWS::S3::Bucket', {
    DeletionPolicy: 'Retain',
    Properties: Match.objectLike({
      VersioningConfiguration: { Status: 'Enabled' },
      PublicAccessBlockConfiguration: Match.objectLike({ BlockPublicAcls: true }),
    }),
  })
})

test('routes /api/* to API Gateway and /photos/* to the media bucket', () => {
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
  template.hasResourceProperties('AWS::CloudFront::Function', {
    FunctionConfig: Match.objectLike({ Runtime: 'cloudfront-js-2.0' }),
  })
})

test('serves the custom domain with a certificate and apex + www DNS records', () => {
  template.hasResourceProperties('AWS::CertificateManager::Certificate', {
    DomainName: 'example.dev',
    SubjectAlternativeNames: ['www.example.dev'],
    ValidationMethod: 'DNS',
  })
  template.resourceCountIs('AWS::Route53::RecordSet', 4)
})

test('verifies the contact address in SES', () => {
  template.hasResourceProperties('AWS::SES::EmailIdentity', { EmailIdentity: 'me@example.com' })
})

test('works without a custom domain', () => {
  const noDomain = synth({ domain: undefined })
  noDomain.resourceCountIs('AWS::CertificateManager::Certificate', 0)
  noDomain.resourceCountIs('AWS::Route53::RecordSet', 0)
  noDomain.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: Match.objectLike({ Aliases: Match.absent() }),
  })
})
