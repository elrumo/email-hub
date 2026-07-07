import { initParse } from '../utils/parse'

export default defineEventHandler(async (event) => {
  try {
    initParse()
    return { ok: true }
  } catch {
    setResponseStatus(event, 503)
    return { ok: false }
  }
})
