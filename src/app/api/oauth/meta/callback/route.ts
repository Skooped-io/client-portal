import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/supabase/helpers'
import {
  exchangeMetaCode,
  exchangeMetaLongLivedToken,
  fetchMetaUserInfo,
  fetchMetaPages,
  encryptMetaTokens,
} from '@/lib/oauth/meta'
import type { ConnectedService } from '@/lib/types'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const stateParam = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings?oauth_error=${encodeURIComponent(error)}`, request.url)
    )
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(new URL('/settings?oauth_error=missing_params', request.url))
  }

  const stateCookie = request.cookies.get('oauth_meta_state')?.value
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
    // Exchange code for short-lived token
    const shortToken = await exchangeMetaCode(code)

    // Exchange for long-lived token (~60 days)
    const longToken = await exchangeMetaLongLivedToken(shortToken.access_token)

    // Get user info
    const userInfo = await fetchMetaUserInfo(longToken.access_token)

    // Get pages to determine connected services
    const pages = await fetchMetaPages(longToken.access_token)

    const connectedServices: ConnectedService[] = ['facebook']
    const hasInstagram = pages.some((p) => p.instagram_business_account)
    if (hasInstagram) connectedServices.push('instagram')

    // Build metadata with page list
    const metadata = {
      pages: pages.map((p) => ({ id: p.id, name: p.name })),
    }

    const encrypted = encryptMetaTokens(longToken)

    const { error: upsertError } = await supabase
      .from('oauth_connections')
      .upsert(
        {
          org_id: orgId,
          provider: 'meta',
          provider_account_id: userInfo.id,
          provider_email: userInfo.email ?? null,
          access_token: encrypted.access_token,
          refresh_token: null, // Meta uses long-lived tokens, no separate refresh token
          token_type: longToken.token_type ?? 'Bearer',
          scope: null,
          expires_at: encrypted.expires_at,
          last_refreshed_at: new Date().toISOString(),
          refresh_error: null,
          refresh_error_count: 0,
          status: 'active',
          connected_services: connectedServices,
          metadata,
        },
        { onConflict: 'org_id,provider' }
      )

    if (upsertError) {
      console.error({ upsertError })
      return NextResponse.redirect(
        new URL(`${stateData.redirect}?oauth_error=save_failed`, request.url)
      )
    }

    const redirectUrl = stateData.redirect.startsWith('/') ? stateData.redirect : '/settings'
    const response = NextResponse.redirect(
      new URL(`${redirectUrl}?oauth_success=meta`, request.url)
    )
    response.cookies.delete('oauth_meta_state')
    return response
  } catch (err) {
    console.error({ err })
    return NextResponse.redirect(
      new URL(`${stateData.redirect}?oauth_error=exchange_failed`, request.url)
    )
  }
}
