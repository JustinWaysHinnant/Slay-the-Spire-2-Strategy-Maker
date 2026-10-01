import { describe, expect, it } from 'vitest'
import { appReturnUrl, steamLoginUrl, takeSessionToken } from './auth'

describe('Steam authentication helpers', () => {
  it('extracts a session token from the login callback fragment', () => {
    expect(takeSessionToken('#steam_session=payload.signature')).toBe('payload.signature')
    expect(takeSessionToken('')).toBeNull()
  })

  it('builds the deployed app return URL', () => {
    expect(appReturnUrl({ origin: 'https://example.com' }, '/strategy/')).toBe('https://example.com/strategy/')
  })

  it('builds the backend login URL without exposing a secret', () => {
    expect(steamLoginUrl('https://auth.example.workers.dev/', 'https://example.com/strategy/')).toBe(
      'https://auth.example.workers.dev/auth/steam?returnUrl=https%3A%2F%2Fexample.com%2Fstrategy%2F',
    )
  })
})
