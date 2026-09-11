import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { App, Stack } from 'aws-cdk-lib'

export const env = { account: '123456789012', region: 'us-east-1' }

/** An empty stack to put a construct in. */
export const testStack = () => new Stack(new App(), 'Test', { env })

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
