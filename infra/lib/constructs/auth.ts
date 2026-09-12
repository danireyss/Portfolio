import { join } from 'node:path'
import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as logs from 'aws-cdk-lib/aws-logs'
import { Construct } from 'constructs'

export interface AuthProps {
  /** The auth service (auth/), with its dependencies installed (`npm ci`) for bundling. */
  readonly projectRoot: string
  /** Where the site runs, e.g. https://danireyss.dev; Google sends people back here. */
  readonly siteUrl: string
  /** The only Google account allowed to keep a session. */
  readonly adminEmail: string
  /**
   * Prefix of the SecureString parameters holding the Google client ID and secret and the session
   * secret (`make auth-secrets` creates them), e.g. "/portfolio/auth".
   */
  readonly secretsPrefix: string
}

/**
 * The Better Auth service (auth/): Google sign-in for the site's admin. esbuild bundles it at synth
 * (installed in infra/, so no Docker); it reads its secrets from SSM when an instance starts.
 */
export class Auth extends Construct {
  readonly handler: nodejs.NodejsFunction

  constructor(scope: Construct, id: string, props: AuthProps) {
    super(scope, id)

    this.handler = new nodejs.NodejsFunction(this, 'Handler', {
      description: 'Better Auth: Google sign-in for the site admin (auth/)',
      entry: join(props.projectRoot, 'src/lambda.ts'),
      handler: 'handler',
      projectRoot: props.projectRoot,
      depsLockFilePath: join(props.projectRoot, 'package-lock.json'),
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      // CPU scales with memory: at 512 MB a warm session check took ~300 ms of cookie crypto.
      // It's only called when signing in and on admin requests, so the extra memory costs ~nothing.
      memorySize: 1024,
      timeout: Duration.seconds(10),
      bundling: {
        format: nodejs.OutputFormat.ESM,
        target: 'node24',
        minify: true,
        sourceMap: true,
        // A few dependencies still call require(); give the ESM bundle one.
        banner:
          "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
        // The Lambda runtime provides the AWS SDK, used to read the secrets.
        externalModules: ['@aws-sdk/*'],
      },
      environment: {
        BETTER_AUTH_URL: props.siteUrl,
        ADMIN_EMAIL: props.adminEmail,
        SSM_PREFIX: props.secretsPrefix,
        NODE_OPTIONS: '--enable-source-maps',
      },
      logGroup: new logs.LogGroup(this, 'Logs', {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    })

    // SecureStrings encrypted with the AWS-managed SSM key need only ssm:GetParameters to read.
    this.handler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameters'],
        resources: [
          Stack.of(this).formatArn({
            service: 'ssm',
            resource: 'parameter',
            resourceName: `${props.secretsPrefix.replace(/^\//, '')}/*`,
          }),
        ],
      }),
    )
  }
}
