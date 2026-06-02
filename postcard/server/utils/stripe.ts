/**
 * Stripe client + helpers. Lazily constructed so the app boots fine without
 * billing configured (the pricing page still renders; checkout 400s clearly).
 */
import Stripe from 'stripe'
import { eq } from 'drizzle-orm'
import { createError } from 'h3'
import { getDb } from '../db'
import { users, type UserRow } from '../db/schema'

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  const key = useRuntimeConfig().stripe.secretKey
  if (!key) {
    throw createError({ statusCode: 400, statusMessage: 'Billing is not configured on this instance.' })
  }
  if (!_stripe) _stripe = new Stripe(key, { apiVersion: '2025-08-27.basil' })
  return _stripe
}

export function billingConfigured(): boolean {
  return !!useRuntimeConfig().stripe.secretKey
}

/** Ensure the user has a Stripe customer, creating one on first need. */
export async function ensureCustomer(user: UserRow): Promise<string> {
  if (user.stripeCustomerId) return user.stripeCustomerId
  const customer = await getStripe().customers.create({
    email: user.email,
    name: user.name ?? undefined,
    metadata: { userId: user.id }
  })
  await getDb().update(users)
    .set({ stripeCustomerId: customer.id, updatedAt: Date.now() })
    .where(eq(users.id, user.id))
  return customer.id
}
