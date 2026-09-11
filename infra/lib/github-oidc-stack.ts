import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import type { Construct } from 'constructs'

export interface GithubOidcStackProps extends StackProps {
  /** The repository whose workflows may deploy, with the numeric IDs GitHub puts in its tokens. */
  repository: { owner: string; ownerId: number; name: string; id: number }
  /** Only workflow runs on this branch may assume the role. */
  branch: string
}

/**
 * GitHub's immutable OIDC subject for pushes to `branch`, e.g.
 * "repo:danireyss@137007934/Portfolio@1366454259:ref:refs/heads/main". Unlike the name-only
 * form, a new repository that reuses the same owner/name can't match it.
 */
export const githubSubject = ({ repository: r, branch }: Pick<GithubOidcStackProps, 'repository' | 'branch'>) =>
  `repo:${r.owner}@${r.ownerId}/${r.name}@${r.id}:ref:refs/heads/${branch}`

/**
 * GitHub's OIDC identity provider plus a deploy role for GitHub Actions, so the deploy workflow
 * needs no long-lived AWS keys. The role's only permission is assuming CDK's bootstrap roles,
 * which do the actual deploying.
 *
 * Deploy this once from your machine (`make deploy-github-role`), then save the DeployRoleArn
 * output as the repository variable AWS_DEPLOY_ROLE_ARN.
 */
export class GithubOidcStack extends Stack {
  constructor(scope: Construct, id: string, props: GithubOidcStackProps) {
    super(scope, id, props)

    const issuer = 'token.actions.githubusercontent.com'
    const provider = new iam.OidcProviderNative(this, 'GithubProvider', {
      url: `https://${issuer}`,
      clientIds: ['sts.amazonaws.com'],
    })

    const role = new iam.Role(this, 'DeployRole', {
      roleName: 'portfolio-github-deploy',
      description: `GitHub Actions deploys from ${props.repository.owner}/${props.repository.name}@${props.branch}`,
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(provider.oidcProviderArn, {
        StringEquals: {
          [`${issuer}:aud`]: 'sts.amazonaws.com',
          [`${issuer}:sub`]: githubSubject(props),
        },
      }),
    })
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        // The deploy, file-publishing, and lookup roles created by `cdk bootstrap`.
        resources: [
          `arn:${this.partition}:iam::${this.account}:role/cdk-hnb659fds-*-${this.account}-${this.region}`,
        ],
      }),
    )

    new CfnOutput(this, 'DeployRoleArn', { value: role.roleArn })
  }
}
