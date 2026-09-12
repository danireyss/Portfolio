import { Duration, RemovalPolicy } from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as s3 from 'aws-cdk-lib/aws-s3'
import { Construct } from 'constructs'

export interface MediaBucketProps {
  /** Origins allowed to upload straight to the bucket with presigned URLs (admin uploads). */
  readonly uploadOrigins?: string[]
}

/**
 * Everything that changes without a deploy, none of it in git: the site's content (`content/`,
 * edited through admin), gallery photos (`photos/`, also `make upload-photos`), and uploaded
 * headshots (`uploads/`). The bucket outlives the stack and keeps overwritten or deleted versions
 * for 30 days, so any change can be undone.
 */
export class MediaBucket extends Construct {
  readonly bucket: s3.Bucket

  constructor(scope: Construct, id: string, props: MediaBucketProps = {}) {
    super(scope, id)
    const uploadOrigins = props.uploadOrigins ?? []
    this.bucket = new s3.Bucket(this, 'Bucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
      versioned: true,
      lifecycleRules: [{ noncurrentVersionExpiration: Duration.days(30) }],
      cors:
        uploadOrigins.length > 0
          ? [
              {
                allowedMethods: [s3.HttpMethods.PUT],
                allowedOrigins: uploadOrigins,
                allowedHeaders: ['*'],
                maxAge: 3600,
              },
            ]
          : undefined,
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

  /**
   * What admin needs: read and write the site's content, and sign upload URLs for headshots and
   * photos (the browser uploads with the grantee's permission) and delete photos.
   */
  grantAdmin(grantee: iam.IGrantable) {
    this.bucket.grantReadWrite(grantee, 'content/*')
    this.bucket.grantPut(grantee, 'uploads/*')
    this.bucket.grantPut(grantee, 'photos/*')
    this.bucket.grantDelete(grantee, 'photos/*')
  }
}
