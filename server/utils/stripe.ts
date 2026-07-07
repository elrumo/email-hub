import Stripe from 'stripe'
import { createError } from 'h3'
import { updateUser, type AppUser } from './parse'

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

export async function ensureCustomer(user: AppUser): Promise<string> {
  if (user.stripeCustomerId) return user.stripeCustomerId
  const customer = await getStripe().customers.create({
    email: user.email,
    name: user.name ?? undefined,
    metadata: { userId: user.id }
  })
  await updateUser(user.id, { stripeCustomerId: customer.id })
  return customer.id
}
