import * as acm from 'aws-cdk-lib/aws-certificatemanager'
import type * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as route53 from 'aws-cdk-lib/aws-route53'
import * as targets from 'aws-cdk-lib/aws-route53-targets'
import { Construct } from 'constructs'

export interface SiteDomainProps {
  /** Apex domain, e.g. "danireyss.dev". www.<name> is covered too. */
  readonly name: string
  /** The domain's Route 53 hosted zone (created when the domain was registered). */
  readonly hostedZoneId: string
}

/**
 * A custom domain for the site: a DNS-validated certificate for the apex and www, and alias
 * records pointing both at a CloudFront distribution. Must be in us-east-1, since CloudFront only
 * accepts certificates from there.
 */
export class SiteDomain extends Construct {
  /** The apex, then www. */
  readonly names: [string, string]
  readonly certificate: acm.ICertificate
  private readonly zone: route53.IHostedZone

  constructor(scope: Construct, id: string, props: SiteDomainProps) {
    super(scope, id)
    this.names = [props.name, `www.${props.name}`]
    this.zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: props.hostedZoneId,
      zoneName: props.name,
    })
    this.certificate = new acm.Certificate(this, 'Certificate', {
      domainName: props.name,
      subjectAlternativeNames: [this.names[1]],
      validation: acm.CertificateValidation.fromDns(this.zone),
    })
  }

  /** Points the apex and www at `distribution` with A and AAAA alias records. */
  pointTo(distribution: cloudfront.IDistribution) {
    const target = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution))
    const records = [
      ['Apex', this.names[0]],
      ['Www', this.names[1]],
    ] as const
    for (const [id, recordName] of records) {
      new route53.ARecord(this, `${id}A`, { zone: this.zone, recordName, target })
      new route53.AaaaRecord(this, `${id}Aaaa`, { zone: this.zone, recordName, target })
    }
  }
}
