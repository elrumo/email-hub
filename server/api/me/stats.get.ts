import { requireUser } from '../../utils/auth'
import { computeUserStats } from '../../utils/stats'

/** The current user's aggregate stats (entity counts + flow-run metrics). */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return await computeUserStats(user.id)
})
