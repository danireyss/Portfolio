import { Duration, RemovalPolicy } from 'aws-cdk-lib'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as logs from 'aws-cdk-lib/aws-logs'
import { Construct } from 'constructs'

export interface PageRendererProps {
  /** The frontend's server build, `dist/server/` (npm run build), with `lambda.mjs` in it. */
  readonly codePath: string
  /** The API's own address (https://<id>.execute-api...), where pages get their data. */
  readonly apiUrl: string
}

/**
 * The frontend's server renderer (frontend/src/lambda.ts): renders a page to HTML with its data,
 * behind a function URL that only CloudFront may call (see Website).
 */
export class PageRenderer extends Construct {
  readonly handler: lambda.Function
  readonly url: lambda.FunctionUrl

  constructor(scope: Construct, id: string, props: PageRendererProps) {
    super(scope, id)

    this.handler = new lambda.Function(this, 'Handler', {
      description: 'Server renderer for the site pages (frontend/src/lambda.ts)',
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      // Vite already bundled every dependency in, so the build goes up as it is.
      code: lambda.Code.fromAsset(props.codePath),
      handler: 'lambda.handler',
      // CPU scales with memory, and rendering React is CPU-bound, cold starts most of all.
      memorySize: 1024,
      // The API answers in milliseconds; this only bounds a hung request.
      timeout: Duration.seconds(10),
      environment: { API_URL: props.apiUrl },
      logGroup: new logs.LogGroup(this, 'Logs', {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    })

    // Signed requests only: CloudFront signs them through origin access control.
    this.url = this.handler.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.AWS_IAM })
  }
}
