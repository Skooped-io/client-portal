import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe, isPlanName, PLAN_PRICE_IDS } from '@/lib/stripe'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { plan } = body as { plan: unknown }

  if (!isPlanName(plan)) {
    return NextResponse.json(
      { error: 'Invalid plan. Must be one of: Starter, Growth, Scale' },
      { status: 400 }
    )
  }

  const priceId = PLAN_PRICE_IDS[plan]
  if (!priceId) {
    console.error(`[stripe/checkout] Price ID not configured for plan: ${plan}`)
    return NextResponse.json(
      { error: `Stripe price ID not configured for plan: ${plan}` },
      { status: 500 }
    )
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    console.error('[stripe/checkout] NEXT_PUBLIC_APP_URL is not set')
    return NextResponse.json({ error: 'App URL not configured' }, { status: 500 })
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 14,
        metadata: {
          userId: user.id,
          plan,
        },
      },
      success_url: `${appUrl}/dashboard?checkout=success`,
      cancel_url: `${appUrl}/pricing?checkout=cancelled`,
      customer_email: user.email,
      metadata: {
        userId: user.id,
        plan,
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (err: unknown) {
    console.error('[stripe/checkout] Failed to create checkout session', err)
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }
}
