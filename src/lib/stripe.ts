import Stripe from 'stripe'

export type PlanName = 'Starter' | 'Growth' | 'Scale'

export const PLAN_PRICE_IDS: Record<PlanName, string> = {
  Starter: process.env.STRIPE_PRICE_STARTER!,
  Growth: process.env.STRIPE_PRICE_GROWTH!,
  Scale: process.env.STRIPE_PRICE_SCALE!,
}

export const VALID_PLANS = new Set<PlanName>(['Starter', 'Growth', 'Scale'])

export function isPlanName(value: unknown): value is PlanName {
  return VALID_PLANS.has(value as PlanName)
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover',
})
