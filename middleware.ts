import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as Parameters<typeof supabaseResponse.cookies.set>[2])
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isAuthPage = pathname === '/login' || pathname === '/signup'
  const isOnboardingPage = pathname.startsWith('/onboarding')
  const isApiRoute = pathname.startsWith('/api')

  // Unauthenticated: redirect to login (except auth pages and API routes)
  if (!user && !isAuthPage && !isApiRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Authenticated: redirect away from auth pages to dashboard
  if (user && isAuthPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // Authenticated on a portal page (not onboarding, not API): check if onboarding is needed
  if (user && !isAuthPage && !isOnboardingPage && !isApiRoute) {
    const { data: progress } = await supabase
      .from('onboarding_progress')
      .select('is_complete, current_step')
      .eq('user_id', user.id)
      .single()

    // If onboarding record exists and is not complete, redirect to current step
    if (progress && !progress.is_complete) {
      const url = request.nextUrl.clone()
      url.pathname = `/onboarding/step/${progress.current_step}`
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
