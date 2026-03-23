import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildMetaAuthUrl } from '@/lib/oauth/meta'
import { randomBytes } from 'crypto'
import { portal } from '@/lib/logger'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const redirectAfter = request.nextUrl.searchParams.get('redirect') ?? '/settings'

  const state = randomBytes(16).toString('hex')
  const statePayload = JSON.stringify({ state, redirect: redirectAfter, userId: user.id })

  const authUrl = buildMetaAuthUrl(state)

  const response = NextResponse.redirect(authUrl)
  response.cookies.set('oauth_meta_state', statePayload, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  return response
}
