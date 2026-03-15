import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/supabase/helpers'
import {
  exchangeGoogleCode,
  fetchGoogleUserInfo,
  encryptGoogleTokens,
} from '@/lib/oauth/google'
import type { ConnectedService } from '@/lib/types'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const stateParam = searchParams.get('state')
  const error = searchParams.get('error')

  // Handle user denial
  if (error) {
    return NextResponse.redirect(
      new URL(`/settings?oauth_error=${encodeURIComponent(error)}`, request.url)
    )
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(new URL('/settings?oauth_error=missing_params', request.url))
  }

  // Verify state cookie to prevent CSRF
  const stateCookie = request.cookies.get('oauth_google_state')?.value
  if (!stateCookie) {
    return NextResponse.redirect(new URL('/settings?oauth_error=state_missing', request.url))
  }

  let stateData: { state: string; redirect: string; userId: string }
  try {
    stateData = JSON.parse(stateCookie) as { state: string; redirect: string; userId: string }
  } catch {
    return NextResponse.redirect(new URL('/settings?oauth_error=state_invalid', request.url))
  }

  if (stateData.state !== stateParam) {
    return NextResponse.redirect(new URL('/settings?oauth_error=state_mismatch', request.url))
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || user.id !== stateData.userId) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const orgId = await getCurrentOrgId(supabase)
  if (!orgId) {
    return NextResponse.redirect(new URL('/settings?oauth_error=no_org', request.url))
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeGoogleCode(code)

    // Get user info (email, name)
    const userInfo = await fetchGoogleUserInfo(tokens.access_token)

    // Encrypt tokens before storing
    const encrypted = encryptGoogleTokens(tokens)

    // Determine connected services from granted scopes
    const grantedScope = tokens.scope ?? ''
    const connectedServices: ConnectedService[] = []
    if (grantedScope.includes('webmasters')) connectedServices.push('search_console')
    if (grantedScope.includes('business.manage')) connectedServices.push('business_profile')
    if (grantedScope.includes('analytics')) connectedServices.push('analytics')
    if (grantedScope.includes('adwords')) connectedServices.push('ads')

    // Upsert the oauth_connection record
    const { error: upsertError } = await supabase
      .from('oauth_connections')
      .upsert(
        {
          org_id: orgId,
          provider: 'google',
          provider_account_id: userInfo.id,
          provider_email: userInfo.email,
          access_token: encrypted.access_token,
          refresh_token: encrypted.refresh_token,
          token_type: tokens.token_type ?? 'Bearer',
          scope: tokens.scope ?? null,
          expires_at: encrypted.expires_at,
          last_refreshed_at: new Date().toISOString(),
          refresh_error: null,
          refresh_error_count: 0,
          status: 'active',
          connected_services: connectedServices,
        },
        { onConflict: 'org_id,provider' }
      )

    if (upsertError) {
      console.error({ upsertError })
      return NextResponse.redirect(
        new URL(`${stateData.redirect}?oauth_error=save_failed`, request.url)
      )
    }

    // Clear the state cookie and redirect
    const redirectUrl = stateData.redirect.startsWith('/')
      ? stateData.redirect
      : '/settings'
    const response = NextResponse.redirect(
      new URL(`${redirectUrl}?oauth_success=google`, request.url)
    )
    response.cookies.delete('oauth_google_state')
    return response
  } catch (err) {
    console.error({ err })
    return NextResponse.redirect(
      new URL(`${stateData.redirect}?oauth_error=exchange_failed`, request.url)
    )
  }
}
