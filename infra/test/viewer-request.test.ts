import { VIEWER_REQUEST_CODE } from '../lib/viewer-request'

type Request = { uri: string; headers: Record<string, { value: string }> }
type Redirect = { statusCode: number; headers: { location: { value: string } } }

// Evaluate the exact code CloudFront runs.
const handler = new Function(`${VIEWER_REQUEST_CODE}; return handler;`)() as (event: {
  request: Request
}) => Request | Redirect

const run = (uri: string, host = 'danireyss.dev') =>
  handler({ request: { uri, headers: { host: { value: host } } } })

test('passes pages and files through untouched, for the server renderer and the bucket', () => {
  for (const uri of ['/', '/projects/this-website', '/photos', '/assets/index-abc123.js', '/headshot.jpg']) {
    expect((run(uri) as Request).uri).toBe(uri)
  }
})

test('redirects www to the apex domain, keeping the path', () => {
  const response = run('/projects', 'www.danireyss.dev') as Redirect
  expect(response.statusCode).toBe(301)
  expect(response.headers.location.value).toBe('https://danireyss.dev/projects')
})
