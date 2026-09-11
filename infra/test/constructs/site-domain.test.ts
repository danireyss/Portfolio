import { Template } from 'aws-cdk-lib/assertions'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import { SiteDomain } from '../../lib/constructs/site-domain'
import { testStack } from '../helpers'

const stack = testStack()
const domain = new SiteDomain(stack, 'Domain', { name: 'example.dev', hostedZoneId: 'Z123' })
const distribution = new cloudfront.Distribution(stack, 'Distribution', {
  defaultBehavior: { origin: new origins.HttpOrigin('origin.example.com') },
  domainNames: domain.names,
  certificate: domain.certificate,
})
domain.pointTo(distribution)
const template = Template.fromStack(stack)

test('covers the apex and www', () => {
  expect(domain.names).toEqual(['example.dev', 'www.example.dev'])
})

test('issues a DNS-validated certificate for both names', () => {
  template.hasResourceProperties('AWS::CertificateManager::Certificate', {
    DomainName: 'example.dev',
    SubjectAlternativeNames: ['www.example.dev'],
    ValidationMethod: 'DNS',
  })
})

test('points both names at the distribution over IPv4 and IPv6', () => {
  template.resourceCountIs('AWS::Route53::RecordSet', 4)
  for (const type of ['A', 'AAAA']) {
    for (const name of ['example.dev.', 'www.example.dev.']) {
      template.hasResourceProperties('AWS::Route53::RecordSet', { Name: name, Type: type })
    }
  }
})
