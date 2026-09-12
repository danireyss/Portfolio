import { Match, Template } from 'aws-cdk-lib/assertions'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import { Api } from '../../lib/constructs/api'
import { fakeBuilds, testStack } from '../helpers'

const stack = testStack()
new Api(stack, 'Api', {
  codePath: fakeBuilds().lambdaCodePath,
  contactEmail: 'me@example.com',
  environment: { EXTRA: 'yes' },
})
const template = Template.fromStack(stack)

test('runs as an arm64 custom-runtime Lambda with the contact address and extra env', () => {
  template.hasResourceProperties('AWS::Lambda::Function', {
    Runtime: 'provided.al2023',
    Architectures: ['arm64'],
    Handler: 'bootstrap',
    MemorySize: 1024,
    Environment: {
      Variables: {
        CONTACT_TO_EMAIL: 'me@example.com',
        CONTACT_FROM_EMAIL: 'me@example.com',
        EXTRA: 'yes',
      },
    },
  })
})

test('verifies the contact address in SES and may send email as it', () => {
  template.hasResourceProperties('AWS::SES::EmailIdentity', { EmailIdentity: 'me@example.com' })
  template.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({ Action: Match.arrayWith(['ses:SendEmail']) }),
      ]),
    },
  })
})

test('addAuth routes /api/auth/* to the auth service and tells the API where it is', () => {
  const authStack = testStack()
  const api = new Api(authStack, 'Api', {
    codePath: fakeBuilds().lambdaCodePath,
    contactEmail: 'me@example.com',
  })
  api.addAuth(
    new lambda.Function(authStack, 'Auth', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline('exports.handler = async () => {}'),
    }),
  )
  const authTemplate = Template.fromStack(authStack)
  authTemplate.hasResourceProperties('AWS::ApiGatewayV2::Route', {
    RouteKey: 'ANY /api/auth/{proxy+}',
  })
  authTemplate.hasResourceProperties('AWS::Lambda::Function', {
    Handler: 'bootstrap',
    Environment: { Variables: Match.objectLike({ AUTH_URL: Match.anyValue() }) },
  })
})

test('throttles the HTTP API stage', () => {
  template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
    StageName: '$default',
    AutoDeploy: true,
    DefaultRouteSettings: { ThrottlingRateLimit: 10, ThrottlingBurstLimit: 20 },
  })
})
