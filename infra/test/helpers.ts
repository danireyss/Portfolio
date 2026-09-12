import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { App, Stack } from 'aws-cdk-lib'

export const env = { account: '123456789012', region: 'us-east-1' }

/** An app that skips asset bundling (esbuild for the auth service), so tests need no installs. */
export const testApp = () => new App({ context: { 'aws:cdk:bundling-stacks': [] } })

/** An empty stack to put a construct in. */
export const testStack = () => new Stack(testApp(), 'Test', { env })

/** The real auth service: NodejsFunction checks that its entry file and lock file exist. */
export const authProjectRoot = join(__dirname, '..', '..', 'auth')

/** Stand-ins for the Lambda binary and the frontend build, so tests don't need real builds. */
export function fakeBuilds() {
  const root = mkdtempSync(join(tmpdir(), 'portfolio-infra-'))
  const lambdaCodePath = join(root, 'lambda')
  const siteAssetPath = join(root, 'dist')
  mkdirSync(lambdaCodePath)
  mkdirSync(join(siteAssetPath, 'assets'), { recursive: true })
  writeFileSync(join(lambdaCodePath, 'bootstrap'), '')
  writeFileSync(join(siteAssetPath, 'index.html'), '')
  writeFileSync(join(siteAssetPath, 'assets', 'index-abc.js'), '')
  return { lambdaCodePath, siteAssetPath }
}
