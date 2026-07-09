import { PLANS, isSelfHosted } from '../utils/plans'
import { billingConfigured } from '../utils/stripe'
import { aiConfigured } from '../utils/ai'

export default defineEventHandler(() => {
  return {
    billingConfigured: billingConfigured(),
    selfHosted: isSelfHosted(),
    aiConfigured: aiConfigured(),
    plans: Object.values(PLANS)
  }
})
