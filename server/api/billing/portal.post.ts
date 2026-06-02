import { requireUser } from '../../utils/auth'
import { ensureCustomer, getStripe } from '../../utils/stripe'

/** Open the Stripe customer portal so users can manage/cancel their plan. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const appUrl = useRuntimeConfig().public.appUrl || getRequestURL(event).origin
  const customer = await ensureCustomer(user)

  const session = await getStripe().billingPortal.sessions.create({
    customer,
    return_url: `${appUrl}/app/account`
  })
  return { url: session.url }
})
