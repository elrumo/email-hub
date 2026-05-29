import { getVapidPublicKey } from '../../utils/push'

/** The browser needs the VAPID public key to create a PushSubscription. */
export default defineEventHandler(async () => {
  return { publicKey: await getVapidPublicKey() }
})
