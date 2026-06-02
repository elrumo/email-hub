import { getClient } from '../db'

export default defineEventHandler(async (event) => {
  try {
    await getClient().unsafe('select 1')
    return { ok: true }
  } catch {
    setResponseStatus(event, 503)
    return { ok: false }
  }
})
