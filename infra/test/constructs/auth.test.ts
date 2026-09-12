import { Match, Template } from 'aws-cdk-lib/assertions'
import { Auth } from '../../lib/constructs/auth'
import { authProjectRoot, testStack } from '../helpers'

const stack = testStack()
new Auth(stack, 'Auth', {
  projectRoot: authProjectRoot,
  siteUrl: 'https://example.dev',
  adminEmail: 'admin@example.com',
  secretsPrefix: '/test/auth',
})
const template = Template.fromStack(stack)

test('runs the auth service on Node.js 24 (arm64) with the site and admin settings', () => {
  template.hasResourceProperties('AWS::Lambda::Function', {
    Runtime: 'nodejs24.x',
    Architectures: ['arm64'],
    Handler: 'index.handler',
    Environment: {
      Variables: {
        BETTER_AUTH_URL: 'https://example.dev',
        ADMIN_EMAIL: 'admin@example.com',
        SSM_PREFIX: '/test/auth',
        NODE_OPTIONS: '--enable-source-maps',
      },
    },
  })
})

test('may read only its own secrets from SSM', () => {
  template.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Action: 'ssm:GetParameters',
          Resource: {
            'Fn::Join': [
              '',
              Match.arrayWith([Match.stringLikeRegexp(':ssm:us-east-1:123456789012:parameter/test/auth/\\*$')]),
            ],
          },
        }),
      ]),
    },
  })
})
