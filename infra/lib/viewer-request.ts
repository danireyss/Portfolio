/**
 * CloudFront Function (cloudfront-js-2.0) for the site's pages and files, run on every viewer
 * request: `www.<domain>` redirects to the apex domain; everything else passes through.
 *
 * /api/* and /photos/* use other behaviors, so this never touches them. Kept to ES5-style
 * syntax because that's what the CloudFront Functions runtime supports.
 */
export const VIEWER_REQUEST_CODE = `
function handler(event) {
  var request = event.request;
  var host = request.headers.host ? request.headers.host.value : '';
  if (host.indexOf('www.') === 0) {
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: { location: { value: 'https://' + host.slice(4) + request.uri } },
    };
  }
  return request;
}
`
