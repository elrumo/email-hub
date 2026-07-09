/**
 * Plan catalogue and entitlements. Plans are defined in code (the source of
 * truth for limits) and linked to Stripe prices via env. The webhook keeps a
 * user's `plan` column in sync; everything else reads limits from here.
 */
export type PlanId = 'free' | 'starter' | 'pro'

export interface Plan {
  id: PlanId
  name: string
  /** display price, in whole dollars per month (0 = free) */
  price: number
  tagline: string
  features: string[]
  limits: {
    /** max email projects */
    projects: number
    /** AI assistant messages per calendar month */
    aiMessagesPerMonth: number
    /** active API keys */
    apiKeys: number
  }
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    tagline: 'Everything you need to design your first emails.',
    features: ['3 email projects', '30 AI assistant messages / month', '1 API key', 'Mustache template variables', 'HTML export'],
    limits: { projects: 3, aiMessagesPerMonth: 30, apiKeys: 1 }
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    price: 12,
    tagline: 'For makers shipping email regularly.',
    features: ['50 email projects', '500 AI assistant messages / month', '5 API keys', 'Full REST API access', 'Priority rendering'],
    limits: { projects: 50, aiMessagesPerMonth: 500, apiKeys: 5 }
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 39,
    tagline: 'For teams and high-volume senders.',
    features: ['Unlimited email projects', '5,000 AI assistant messages / month', '25 API keys', 'Full REST API access', 'Highest priority AI'],
    limits: { projects: 100000, aiMessagesPerMonth: 5000, apiKeys: 25 }
  }
}

/**
 * Self-hosted mode: an operator running their own instance is paying for their
 * own AI provider and storage, so metering them against SaaS plan limits makes
 * no sense. When NUXT_PUBLIC_SELF_HOSTED is set, every account is treated as an
 * unlimited plan and the billing/pricing UI is hidden (see `public.selfHosted`).
 */
export function isSelfHosted(): boolean {
  const v = process.env.NUXT_PUBLIC_SELF_HOSTED ?? process.env.POSTCARD_SELF_HOSTED
  return v === 'true' || v === '1'
}

const UNLIMITED = Number.MAX_SAFE_INTEGER

const SELF_HOSTED_PLAN: Plan = {
  id: 'pro',
  name: 'Self-hosted',
  price: 0,
  tagline: 'Your instance, no limits.',
  features: ['Unlimited email projects', 'Unlimited AI assistant messages', 'Unlimited API keys', 'Full REST API access'],
  limits: { projects: UNLIMITED, aiMessagesPerMonth: UNLIMITED, apiKeys: UNLIMITED }
}

export function planFor(id: string | null | undefined): Plan {
  if (isSelfHosted()) return SELF_HOSTED_PLAN
  return PLANS[(id as PlanId)] ?? PLANS.free
}

/** Map a Stripe price id back to a plan id (for the webhook). */
export function planForPriceId(priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null
  const cfg = useRuntimeConfig().stripe
  if (priceId === cfg.priceStarter) return 'starter'
  if (priceId === cfg.pricePro) return 'pro'
  return null
}

export function priceIdForPlan(id: PlanId): string | null {
  const cfg = useRuntimeConfig().stripe
  if (id === 'starter') return cfg.priceStarter || null
  if (id === 'pro') return cfg.pricePro || null
  return null
}
