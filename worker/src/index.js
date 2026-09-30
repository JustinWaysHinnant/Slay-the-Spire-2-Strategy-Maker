const STEAM_OPENID_URL = 'https://steamcommunity.com/openid/login'
const TOKEN_ISSUER = 'sts2-strategy-maker-auth'
const SESSION_SECONDS = 60 * 60 * 24 * 7
const STATE_SECONDS = 60 * 10

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function base64UrlEncode(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
}

async function signingKey(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

export async function signValue(value, secret) {
  const payload = base64UrlEncode(encoder.encode(JSON.stringify(value)))
  const signature = await crypto.subtle.sign('HMAC', await signingKey(secret), encoder.encode(payload))
  return `${payload}.${base64UrlEncode(new Uint8Array(signature))}`
}

export async function verifyValue(token, secret) {
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra) return null
  try {
    const valid = await crypto.subtle.verify('HMAC', await signingKey(secret), base64UrlDecode(signature), encoder.encode(payload))
    if (!valid) return null
    return JSON.parse(decoder.decode(base64UrlDecode(payload)))
  } catch {
    return null
  }
}

export function isAllowedReturnUrl(candidate, configuredFrontend) {
  try {
    const requested = new URL(candidate)
    const allowed = new URL(configuredFrontend)
    return requested.origin === allowed.origin
      && requested.pathname === allowed.pathname
      && !requested.search
      && !requested.hash
  } catch {
    return false
  }
}

function corsHeaders(env) {
  const origin = new URL(env.FRONTEND_URL).origin
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
  }
}

function json(value, status, env) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...corsHeaders(env), 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function fail(message, status = 400) {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  })
}

async function beginSteamLogin(request, env) {
  const requestUrl = new URL(request.url)
  const returnUrl = requestUrl.searchParams.get('returnUrl') ?? ''
  if (!isAllowedReturnUrl(returnUrl, env.FRONTEND_URL)) return fail('Invalid return URL.')

  const now = Math.floor(Date.now() / 1000)
  const state = await signValue({ kind: 'login', returnUrl, exp: now + STATE_SECONDS, nonce: crypto.randomUUID() }, env.SESSION_SECRET)
  const callback = new URL('/auth/steam/callback', requestUrl.origin)
  callback.searchParams.set('state', state)
  const steam = new URL(STEAM_OPENID_URL)
  steam.searchParams.set('openid.ns', 'http://specs.openid.net/auth/2.0')
  steam.searchParams.set('openid.mode', 'checkid_setup')
  steam.searchParams.set('openid.return_to', callback.toString())
  steam.searchParams.set('openid.realm', `${requestUrl.origin}/`)
  steam.searchParams.set('openid.identity', 'http://specs.openid.net/auth/2.0/identifier_select')
  steam.searchParams.set('openid.claimed_id', 'http://specs.openid.net/auth/2.0/identifier_select')
  return Response.redirect(steam.toString(), 302)
}

async function finishSteamLogin(request, env) {
  const requestUrl = new URL(request.url)
  const stateToken = requestUrl.searchParams.get('state') ?? ''
  const state = await verifyValue(stateToken, env.SESSION_SECRET)
  const now = Math.floor(Date.now() / 1000)
  if (!state || state.kind !== 'login' || typeof state.exp !== 'number' || state.exp < now
    || typeof state.returnUrl !== 'string' || !isAllowedReturnUrl(state.returnUrl, env.FRONTEND_URL)) {
    return fail('The Steam login request expired or was invalid.')
  }

  if (requestUrl.searchParams.get('openid.mode') !== 'id_res') return fail('Steam sign-in was cancelled.')
  if (requestUrl.searchParams.get('openid.op_endpoint') !== STEAM_OPENID_URL) return fail('Unexpected OpenID provider.')
  const claimedId = requestUrl.searchParams.get('openid.claimed_id') ?? ''
  const identity = requestUrl.searchParams.get('openid.identity') ?? ''
  const match = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/.exec(claimedId)
  if (!match || identity !== claimedId) return fail('Steam did not return a valid SteamID64.')

  const expectedReturn = new URL('/auth/steam/callback', requestUrl.origin)
  expectedReturn.searchParams.set('state', stateToken)
  if (requestUrl.searchParams.get('openid.return_to') !== expectedReturn.toString()) return fail('OpenID return URL did not match.')

  const verification = new URLSearchParams(requestUrl.searchParams)
  verification.delete('state')
  verification.set('openid.mode', 'check_authentication')
  const steamResponse = await fetch(STEAM_OPENID_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: verification.toString(),
  })
  if (!steamResponse.ok || !(await steamResponse.text()).split(/\r?\n/).includes('is_valid:true')) {
    return fail('Steam could not verify this sign-in.', 401)
  }

  const session = await signValue({ iss: TOKEN_ISSUER, sub: match[1], iat: now, exp: now + SESSION_SECONDS }, env.SESSION_SECRET)
  return Response.redirect(`${state.returnUrl}#steam_session=${encodeURIComponent(session)}`, 302)
}

async function readSession(request, env) {
  const authorization = request.headers.get('Authorization') ?? ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  const value = await verifyValue(token, env.SESSION_SECRET)
  const now = Math.floor(Date.now() / 1000)
  if (!value || value.iss !== TOKEN_ISSUER || typeof value.sub !== 'string' || !/^\d{17}$/.test(value.sub)
    || typeof value.exp !== 'number' || value.exp < now) {
    return json({ error: 'Invalid or expired session.' }, 401, env)
  }
  return json({ steamId: value.sub, expiresAt: value.exp }, 200, env)
}

export default {
  async fetch(request, env) {
    if (!env.FRONTEND_URL || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
      return fail('Authentication service is not configured.', 503)
    }
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env) })
    if (request.method !== 'GET') return fail('Method not allowed.', 405)
    if (url.pathname === '/auth/steam') return beginSteamLogin(request, env)
    if (url.pathname === '/auth/steam/callback') return finishSteamLogin(request, env)
    if (url.pathname === '/auth/session') return readSession(request, env)
    if (url.pathname === '/health') return json({ ok: true }, 200, env)
    return fail('Not found.', 404)
  },
}
