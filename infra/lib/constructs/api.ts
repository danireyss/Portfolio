import { Duration, Fn, RemovalPolicy } from 'aws-cdk-lib'
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2'
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as ses from 'aws-cdk-lib/aws-ses'
import { Construct } from 'constructs'

export interface ApiProps {
  /** Directory containing the `bootstrap` binary (cargo lambda build --release --arm64). */
  readonly codePath: string
  /** Contact-form messages are sent to and from this address, verified in SES. */
  readonly contactEmail: string
  /** Extra environment variables for the Lambda. */
  readonly environment?: Record<string, string>
  /** Requests per second across the whole API, and the burst allowed above that. */
  readonly throttle?: { rateLimit: number; burstLimit: number }
}

/**
 * The Rust Axum API (backend/): an arm64 Lambda behind a throttled HTTP API, allowed to send the
 * contact-form email through SES.
 */
export class Api extends Construct {
  readonly handler: lambda.Function
  readonly httpApi: apigwv2.HttpApi
  /** The HTTP API's hostname, for use as a CloudFront origin. */
  readonly originDomain: string

  constructor(scope: Construct, id: string, props: ApiProps) {
    super(scope, id)

    const contactIdentity = new ses.EmailIdentity(this, 'ContactEmail', {
      identity: ses.Identity.email(props.contactEmail),
    })

    this.handler = new lambda.Function(this, 'Handler', {
      description: 'Rust Axum API (backend/, portfolio-api)',
      runtime: lambda.Runtime.PROVIDED_AL2023,
      architecture: lambda.Architecture.ARM_64,
      handler: 'bootstrap',
      code: lambda.Code.fromAsset(props.codePath),
      memorySize: 256,
      timeout: Duration.seconds(10),
      environment: {
        CONTACT_TO_EMAIL: props.contactEmail,
        CONTACT_FROM_EMAIL: props.contactEmail,
        ...props.environment,
      },
      logGroup: new logs.LogGroup(this, 'Logs', {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    })
    contactIdentity.grantSendEmail(this.handler)

    this.httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      description: 'Portfolio API (reached through CloudFront at /api/*)',
      defaultIntegration: new HttpLambdaIntegration('Integration', this.handler),
      createDefaultStage: false,
    })
    new apigwv2.HttpStage(this, 'Stage', {
      httpApi: this.httpApi,
      stageName: '$default',
      autoDeploy: true,
      // Caps abuse (e.g. contact-form spam). The account's Lambda concurrency quota is too small
      // to reserve concurrency from, so this is the limit instead.
      throttle: props.throttle ?? { rateLimit: 10, burstLimit: 20 },
    })

    // "https://abc123.execute-api.us-east-1.amazonaws.com" -> "abc123.execute-api.us-east-1.amazonaws.com"
    this.originDomain = Fn.select(2, Fn.split('/', this.httpApi.apiEndpoint))
  }
}
