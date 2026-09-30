import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import worker, { isAllowedReturnUrl, signValue, verifyValue } from '../src/index.js'

const secret = 'test-only-secret-that-is-at-least-32-characters-long'
const frontend = 'https://example.github.io/strategy/'
const env = { FRONTEND_URL: frontend, SESSION_SECRET: secret }

describe('Steam auth worker', () => {
  it('signs and validates a session value', async () => {
    const value = { sub: '76561198000000000', exp: 2_000_000_000 }
    const token = await signValue(value, secret)
    assert.deepEqual(await verifyValue(token, secret), value)
  })

  it('rejects a modified session value', async () => {
    const token = await signValue({ sub: '76561198000000000' }, secret)
    assert.equal(await verifyValue(`${token}changed`, secret), null)
  })

  it('allows only the exact configured frontend return path', () => {
    assert.equal(isAllowedReturnUrl(frontend, frontend), true)
    assert.equal(isAllowedReturnUrl('https://attacker.example/strategy/', frontend), false)
    assert.equal(isAllowedReturnUrl('https://example.github.io/strategy/other', frontend), false)
    assert.equal(isAllowedReturnUrl('https://example.github.io/strategy/?next=attacker', frontend), false)
  })

  it('starts at Steam and completes a verified login session', async () => {
    const start = await worker.fetch(new Request(`https://auth.example.workers.dev/auth/steam?returnUrl=${encodeURIComponent(frontend)}`), env)
    assert.equal(start.status, 302)
    const steamUrl = new URL(start.headers.get('Location'))
    assert.equal(steamUrl.origin, 'https://steamcommunity.com')
    const returnTo = steamUrl.searchParams.get('openid.return_to')
    assert.ok(returnTo)

    const callback = new URL(returnTo)
    callback.searchParams.set('openid.mode', 'id_res')
    callback.searchParams.set('openid.op_endpoint', 'https://steamcommunity.com/openid/login')
    callback.searchParams.set('openid.claimed_id', 'https://steamcommunity.com/openid/id/76561198000000000')
    callback.searchParams.set('openid.identity', 'https://steamcommunity.com/openid/id/76561198000000000')
    callback.searchParams.set('openid.return_to', returnTo)

    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n')
    try {
      const completed = await worker.fetch(new Request(callback), env)
      assert.equal(completed.status, 302)
      const destination = new URL(completed.headers.get('Location'))
      assert.equal(`${destination.origin}${destination.pathname}`, frontend)
      const token = new URLSearchParams(destination.hash.slice(1)).get('steam_session')
      assert.ok(token)

      const session = await worker.fetch(new Request('https://auth.example.workers.dev/auth/session', {
        headers: { Authorization: `Bearer ${token}` },
      }), env)
      assert.equal(session.status, 200)
      assert.deepEqual(await session.json(), {
        steamId: '76561198000000000',
        expiresAt: (await verifyValue(token, secret)).exp,
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('rejects an unapproved login return URL', async () => {
    const response = await worker.fetch(new Request('https://auth.example.workers.dev/auth/steam?returnUrl=https://attacker.example/'), env)
    assert.equal(response.status, 400)
  })
})
