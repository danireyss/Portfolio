// The client build's index.html, built into the server bundle (`npm run build` builds the client
// first).
import template from '../dist/client/index.html?raw'
import { renderPage } from './entry-server'

// Node's, on Lambda; this file is only ever built for the server.
declare const process: { env: Record<string, string | undefined> }

// The API's own address (API Gateway), not the site's: page data doesn't go through CloudFront.
const apiOrigin = process.env.API_URL
if (!apiOrigin) {
  throw new Error('API_URL is not set')
}

/** The parts of a Lambda function URL request (payload format 2.0) the renderer reads. */
type FunctionUrlEvent = { rawPath: string; rawQueryString: string }

/** The server renderer on Lambda, behind the function URL CloudFront sends page requests to. */
export async function handler({ rawPath, rawQueryString }: FunctionUrlEvent) {
  const url = rawQueryString ? `${rawPath}?${rawQueryString}` : rawPath
  const { status, headers, body } = await renderPage(url, template, { apiOrigin: apiOrigin! })
  return { statusCode: status, headers, body }
}
