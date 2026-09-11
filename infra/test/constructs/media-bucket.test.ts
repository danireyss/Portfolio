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
