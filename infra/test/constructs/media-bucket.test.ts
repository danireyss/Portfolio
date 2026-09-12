import { Match, Template } from 'aws-cdk-lib/assertions'
import * as iam from 'aws-cdk-lib/aws-iam'
import { MediaBucket } from '../../lib/constructs/media-bucket'
import { testStack } from '../helpers'

const stack = testStack()
const media = new MediaBucket(stack, 'Media')
const reader = new iam.Role(stack, 'Reader', {
  assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
})
media.grantList(reader, 'photos/')
const template = Template.fromStack(stack)

test('keeps the bucket, versioned and private, if the stack is deleted', () => {
  template.hasResource('AWS::S3::Bucket', {
    DeletionPolicy: 'Retain',
    Properties: Match.objectLike({
      VersioningConfiguration: { Status: 'Enabled' },
      PublicAccessBlockConfiguration: Match.objectLike({ BlockPublicAcls: true }),
    }),
  })
})

test('takes no browser uploads unless given origins', () => {
  template.hasResourceProperties('AWS::S3::Bucket', { CorsConfiguration: Match.absent() })
})

test('allows uploads from the site; grantAdmin covers content, uploads, and photos', () => {
  const adminStack = testStack()
  const adminMedia = new MediaBucket(adminStack, 'Media', { uploadOrigins: ['https://example.dev'] })
  const admin = new iam.Role(adminStack, 'Admin', {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  })
  adminMedia.grantAdmin(admin)
  const adminTemplate = Template.fromStack(adminStack)

  adminTemplate.hasResourceProperties('AWS::S3::Bucket', {
    CorsConfiguration: {
      CorsRules: [
        Match.objectLike({ AllowedMethods: ['PUT'], AllowedOrigins: ['https://example.dev'] }),
      ],
    },
  })
  const policy = JSON.stringify(adminTemplate.findResources('AWS::IAM::Policy'))
  for (const expected of ['/content/*', '/uploads/*', '/photos/*', 's3:PutObject', 's3:DeleteObject']) {
    expect(policy).toContain(expected)
  }
})

test('grantList allows listing only under the prefix', () => {
  template.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: [
        Match.objectLike({
          Action: 's3:ListBucket',
          Condition: { StringLike: { 's3:prefix': 'photos/*' } },
        }),
      ],
    },
  })
})
