import { requireUser } from '../../utils/auth'
import { priceIdForPlan, type PlanId } from '../../utils/plans'
import { ensureCustomer, getStripe } from '../../utils/stripe'

/** Start a Stripe Checkout session for a paid plan; returns the redirect URL. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{ plan?: PlanId }>(event)
  const plan = body.plan
  if (plan !== 'starter' && plan !== 'pro') {
    throw createError({ statusCode: 422, statusMessage: 'Choose a paid plan to subscribe to.' })
  }
  const price = priceIdForPlan(plan)
  if (!price) throw createError({ statusCode: 400, statusMessage: 'This plan is not available for purchase yet.' })

  const appUrl = useRuntimeConfig().public.appUrl || getRequestURL(event).origin
  const customer = await ensureCustomer(user)

  const session = await getStripe().checkout.sessions.create({
    mode: 'subscription',
    customer,
    line_items: [{ price, quantity: 1 }],
    client_reference_id: user.id,
    subscription_data: { metadata: { userId: user.id, plan } },
    success_url: `${appUrl}/app/account?checkout=success`,
    cancel_url: `${appUrl}/pricing?checkout=cancelled`
  })

  return { url: session.url }
})
