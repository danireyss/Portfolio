import { VIEWER_REQUEST_CODE } from '../lib/viewer-request'

type Request = { uri: string; headers: Record<string, { value: string }> }
type Redirect = { statusCode: number; headers: { location: { value: string } } }

// Evaluate the exact code CloudFront runs.
const handler = new Function(`${VIEWER_REQUEST_CODE}; return handler;`)() as (event: {
  request: Request
}) => Request | Redirect

const run = (uri: string, host = 'danireyss.dev') =>
  handler({ request: { uri, headers: { host: { value: host } } } })

test('serves the app shell for extension-less routes', () => {
  expect((run('/projects/this-website') as Request).uri).toBe('/index.html')
  expect((run('/photos') as Request).uri).toBe('/index.html')
  expect((run('/') as Request).uri).toBe('/index.html')
})

test('passes files through untouched', () => {
  expect((run('/assets/index-abc123.js') as Request).uri).toBe('/assets/index-abc123.js')
  expect((run('/headshot.jpg') as Request).uri).toBe('/headshot.jpg')
})

test('redirects www to the apex domain, keeping the path', () => {
  const response = run('/projects', 'www.danireyss.dev') as Redirect
  expect(response.statusCode).toBe(301)
  expect(response.headers.location.value).toBe('https://danireyss.dev/projects')
})
