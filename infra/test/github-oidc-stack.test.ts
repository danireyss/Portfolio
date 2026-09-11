import { App } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { GithubOidcStack } from '../lib/github-oidc-stack'

const template = Template.fromStack(
  new GithubOidcStack(new App(), 'Test', {
    env: { account: '123456789012', region: 'us-east-1' },
    repository: 'someone/site',
    branch: 'main',
  }),
)

test('creates the GitHub OIDC provider for the STS audience', () => {
  template.hasResourceProperties('AWS::IAM::OIDCProvider', {
    Url: 'https://token.actions.githubusercontent.com',
    ClientIdList: ['sts.amazonaws.com'],
  })
})

test('only lets the configured repo and branch assume the deploy role', () => {
  template.hasResourceProperties('AWS::IAM::Role', {
    AssumeRolePolicyDocument: {
      Statement: [
        Match.objectLike({
          Action: 'sts:AssumeRoleWithWebIdentity',
          Condition: {
            StringEquals: {
              'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
              'token.actions.githubusercontent.com:sub': 'repo:someone/site:ref:refs/heads/main',
            },
          },
        }),
      ],
    },
  })
})

test('grants nothing but assuming the CDK bootstrap roles', () => {
  template.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: [
        Match.objectLike({
          Action: 'sts:AssumeRole',
          // arn:${Partition}:iam::... is rendered as a join around the partition token.
          Resource: {
            'Fn::Join': [
              '',
              Match.arrayWith([':iam::123456789012:role/cdk-hnb659fds-*-123456789012-us-east-1']),
            ],
          },
        }),
      ],
    },
  })
})
