import { PLANS } from '../utils/plans'
import { billingConfigured } from '../utils/stripe'

export default defineEventHandler(() => {
  return {
    billingConfigured: billingConfigured(),
    plans: Object.values(PLANS)
  }
})
