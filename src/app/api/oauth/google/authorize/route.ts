import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildGoogleAuthUrl } from '@/lib/oauth/google'
import { randomBytes } from 'crypto'
import { portal } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const redirectAfter = request.nextUrl.searchParams.get('redirect') ?? '/settings'

    // Generate state parameter to prevent CSRF
    const state = randomBytes(16).toString('hex')

    // Store state + redirect target in a short-lived cookie
    const statePayload = JSON.stringify({ state, redirect: redirectAfter, userId: user.id })

    const authUrl = buildGoogleAuthUrl(state)

    const response = NextResponse.redirect(authUrl)
    response.cookies.set('oauth_google_state', statePayload, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    })

    portal.auth('google.authorize', 'completed', user.id)
    return response
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    portal.error('oauth.google.authorize', message)
    return NextResponse.json({ error: 'Failed to initiate Google auth' }, { status: 500 })
  }
}
