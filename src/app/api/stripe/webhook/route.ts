/*
 * Supabase migration — run this SQL to create the subscriptions table:
 *
 * create table if not exists public.subscriptions (
 *   id uuid primary key default gen_random_uuid(),
 *   org_id uuid not null references public.organizations(id) on delete cascade,
 *   user_id uuid not null references auth.users(id) on delete cascade,
 *   stripe_subscription_id text not null unique,
 *   stripe_customer_id text not null,
 *   plan text not null,
 *   status text not null,
 *   trial_end timestamptz,
 *   billing_cycle_anchor timestamptz,
 *   cancel_at timestamptz,
 *   created_at timestamptz not null default now(),
 *   updated_at timestamptz not null default now()
 * );
 *
 * create index if not exists subscriptions_org_id_idx on public.subscriptions(org_id);
 * create index if not exists subscriptions_user_id_idx on public.subscriptions(user_id);
 * create index if not exists subscriptions_stripe_subscription_id_idx on public.subscriptions(stripe_subscription_id);
 *
 * -- RLS
 * alter table public.subscriptions enable row level security;
 * create policy "Users can view their own subscription"
 *   on public.subscriptions for select
 *   using (auth.uid() = user_id);
 */

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId
  const plan = session.metadata?.plan

  if (!userId || !plan) {
    console.error('[stripe/webhook] checkout.session.completed missing metadata', {
      sessionId: session.id,
    })
    return
  }

  const subscriptionId = session.subscription as string | null
  const customerId = session.customer as string | null

  if (!subscriptionId || !customerId) {
    console.error('[stripe/webhook] checkout.session.completed missing subscription/customer', {
      sessionId: session.id,
    })
    return
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId)

  const supabase = await createClient()

  // Look up the org for this user (assumes a user belongs to one org)
  const { data: orgMember, error: orgError } = await supabase
    .from('organization_members')
    .select('org_id')
    .eq('user_id', userId)
    .single()

  if (orgError || !orgMember) {
    console.error('[stripe/webhook] Could not find org for user', { userId, error: orgError })
    return
  }

  const { error: upsertError } = await supabase.from('subscriptions').upsert(
    {
      org_id: orgMember.org_id,
      user_id: userId,
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: customerId,
      plan,
      status: subscription.status,
      trial_end: subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
      billing_cycle_anchor: new Date(subscription.billing_cycle_anchor * 1000).toISOString(),
      cancel_at: subscription.cancel_at
        ? new Date(subscription.cancel_at * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'stripe_subscription_id' }
  )

  if (upsertError) {
    console.error('[stripe/webhook] Failed to upsert subscription', upsertError)
  } else {
    console.log('[stripe/webhook] Subscription created for user', userId)
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('subscriptions')
    .update({
      status: subscription.status,
      trial_end: subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
      billing_cycle_anchor: new Date(subscription.billing_cycle_anchor * 1000).toISOString(),
      cancel_at: subscription.cancel_at
        ? new Date(subscription.cancel_at * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscription.id)

  if (error) {
    console.error('[stripe/webhook] Failed to update subscription', subscription.id, error)
  } else {
    console.log('[stripe/webhook] Subscription updated', subscription.id, subscription.status)
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('subscriptions')
    .update({
      status: 'canceled',
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscription.id)

  if (error) {
    console.error('[stripe/webhook] Failed to mark subscription canceled', subscription.id, error)
  } else {
    console.log('[stripe/webhook] Subscription canceled', subscription.id)
  }
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[stripe/webhook] STRIPE_WEBHOOK_SECRET is not set')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  const rawBody = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[stripe/webhook] Signature verification failed', message)
    return NextResponse.json({ error: `Webhook signature invalid: ${message}` }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session)
        break

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
        break

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break

      default:
        // Unhandled event type — safe to ignore
        console.log('[stripe/webhook] Unhandled event type:', event.type)
    }
  } catch (err: unknown) {
    console.error('[stripe/webhook] Handler error for event', event.type, err)
    return NextResponse.json({ error: 'Webhook handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
