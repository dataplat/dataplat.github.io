/**
 * Cloudflare Worker for Internal URL Rewriting
 *
 * This worker rewrites requests from dataplat.dbatools.io to dataplat.github.io
 * internally without exposing the upstream host to users.
 *
 * Route: dataplat.dbatools.io/*
 */

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  // Parse the request URL
  const url = new URL(request.url)

  // Only process requests for dataplat.dbatools.io
  if (url.hostname !== 'dataplat.dbatools.io') {
    // Pass through all other traffic unchanged
    return fetch(request)
  }

  // Create a new URL with the GitHub Pages hostname
  const rewrittenUrl = new URL(request.url)
  rewrittenUrl.hostname = 'dataplat.github.io'

  // Create a new request with the rewritten URL
  // Preserve the original method, headers, and body
  const modifiedRequest = new Request(rewrittenUrl.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.body,
    redirect: 'manual' // Important: Handle redirects manually to prevent GitHub Pages redirects
  })

  try {
    // Fetch from the GitHub Pages URL
    const response = await fetch(modifiedRequest)

    // Handle GitHub Pages redirects internally
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('Location')
      if (location) {
        // If GitHub Pages tries to redirect, modify the Location header
        const redirectUrl = new URL(location, rewrittenUrl.toString())
        if (redirectUrl.hostname === 'dataplat.github.io') {
          redirectUrl.hostname = 'dataplat.dbatools.io'
        }

        // Create a new response with the corrected Location header
        const newResponse = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        })
        newResponse.headers.set('Location', redirectUrl.toString())
        return newResponse
      }
    }

    // Create a new response to ensure we can modify headers if needed
    const newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    })

    // Remove any headers that might expose the upstream host
    newResponse.headers.delete('server')
    newResponse.headers.delete('x-github-request-id')

    // Set CORS headers if needed (optional, depending on your requirements)
    newResponse.headers.set('Access-Control-Allow-Origin', '*')

    return newResponse

  } catch (error) {
    // Log error for debugging (visible in Cloudflare dashboard)
    console.error('Worker error:', error)

    // Return a generic error response
    return new Response('Service temporarily unavailable', {
      status: 503,
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-cache'
      }
    })
  }
}