/**
 * Proxies caniemail.com's public JSON data for client-side compliance checking.
 * Caches for 24 hours to avoid hammering their API.
 */
const CANIEMAIL_URL = 'https://www.caniemail.com/api/data.json'
const CACHE_TTL = 60 * 60 * 24 // 24 hours

export default defineCachedEventHandler(async () => {
  return await $fetch(CANIEMAIL_URL, { timeout: 15000 })
}, { maxAge: CACHE_TTL })
