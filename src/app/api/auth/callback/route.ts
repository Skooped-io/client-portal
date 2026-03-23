import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { portal } from '@/lib/logger'

export async function GET(request: Request) {
  try {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const nextParam = searchParams.get('next') ?? '/dashboard'

    // Validate redirect target: must be a relative path (no open redirects)
    const next =
      nextParam.startsWith('/') && !nextParam.startsWith('//') && !nextParam.includes(':')
        ? nextParam
        : '/dashboard'

    if (code) {
      const supabase = await createClient()
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (!error) {
        portal.auth('callback', 'completed')
        return NextResponse.redirect(`${origin}${next}`)
      }
      portal.auth('callback', 'failed', undefined, { error: error.message })
    }

    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    portal.error('auth.callback', message)
    const origin = new URL(request.url).origin
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
  }
}
