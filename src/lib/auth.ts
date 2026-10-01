export const SESSION_STORAGE_KEY = 'sts2-strategy-maker-steam-session'

export interface SteamSession {
  steamId: string
  expiresAt: number
}

export type AuthState =
  | { status: 'checking' }
  | { status: 'signed-out'; error?: string }
  | { status: 'signed-in'; session: SteamSession }

export function takeSessionToken(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  return params.get('steam_session')
}

export function appReturnUrl(location: Pick<Location, 'origin'>, baseUrl: string): string {
  return new URL(baseUrl, `${location.origin}/`).toString()
}

export function steamLoginUrl(apiUrl: string, returnUrl: string): string {
  const url = new URL('/auth/steam', `${apiUrl.replace(/\/$/, '')}/`)
  url.searchParams.set('returnUrl', returnUrl)
  return url.toString()
}

export async function verifySession(apiUrl: string, token: string): Promise<SteamSession | null> {
  const response = await fetch(`${apiUrl.replace(/\/$/, '')}/auth/session`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) return null
  const value = await response.json() as Partial<SteamSession>
  return typeof value.steamId === 'string' && /^\d{17}$/.test(value.steamId) && typeof value.expiresAt === 'number'
    ? { steamId: value.steamId, expiresAt: value.expiresAt }
    : null
}
