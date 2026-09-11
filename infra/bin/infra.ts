#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { App } from 'aws-cdk-lib'
import { config } from '../lib/config'
import { GithubOidcStack } from '../lib/github-oidc-stack'
import { PortfolioStack } from '../lib/portfolio-stack'

const repoRoot = join(__dirname, '..', '..')
// Both are built before synth: `make build` (cargo lambda build --release --arm64, npm run build).
const lambdaCodePath = join(repoRoot, 'backend/target/lambda/portfolio-api')
const siteAssetPath = join(repoRoot, 'frontend/dist')
for (const [path, hint] of [
  [join(lambdaCodePath, 'bootstrap'), 'make build-backend'],
  [join(siteAssetPath, 'index.html'), 'make build-frontend'],
]) {
  if (!existsSync(path)) {
    throw new Error(`${path} is missing. Build it first with \`${hint}\`.`)
  }
}

const app = new App()
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: config.region }

new PortfolioStack(app, 'PortfolioStack', {
  env,
  description: 'Portfolio: React on S3 + CloudFront, Rust Axum API on Lambda, photos bucket, SES',
  domain: config.domain,
  contactEmail: config.contactEmail,
  lambdaCodePath,
  siteAssetPath,
})

new GithubOidcStack(app, 'PortfolioGithubOidc', {
  env,
  description: 'Lets GitHub Actions deploy PortfolioStack without long-lived AWS keys',
  repository: config.github.repository,
  branch: config.github.branch,
})
