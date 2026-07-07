import { pingParse } from '../utils/parse'

export default defineEventHandler(async (event) => {
  try {
    await pingParse()
    return { ok: true }
  } catch {
    setResponseStatus(event, 503)
    return { ok: false }
  }
})
