import { buildOpenApiDocument } from '../utils/openapi'

export default defineEventHandler((event) => {
  const appUrl = useRuntimeConfig().public.appUrl || getRequestURL(event).origin
  setResponseHeader(event, 'content-type', 'application/json')
  return buildOpenApiDocument(appUrl)
})
