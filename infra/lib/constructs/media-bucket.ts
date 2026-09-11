import { Duration, RemovalPolicy } from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as s3 from 'aws-cdk-lib/aws-s3'
import { Construct } from 'constructs'

/**
 * Gallery photos. They're uploaded separately (`make upload-photos`) and never in git, so the
 * bucket outlives the stack and keeps overwritten or deleted versions for 30 days.
 */
export class MediaBucket extends Construct {
  readonly bucket: s3.Bucket

  constructor(scope: Construct, id: string) {
    super(scope, id)
    this.bucket = new s3.Bucket(this, 'Bucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
      versioned: true,
      lifecycleRules: [{ noncurrentVersionExpiration: Duration.days(30) }],
    })
  }

  /** Lets `grantee` list keys under `prefix`, but not read them (CloudFront serves the files). */
  grantList(grantee: iam.IGrantable, prefix: string) {
    grantee.grantPrincipal.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['s3:ListBucket'],
        resources: [this.bucket.bucketArn],
        conditions: { StringLike: { 's3:prefix': `${prefix}*` } },
      }),
    )
  }
}
