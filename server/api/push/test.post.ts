import { sendPush } from '../../utils/push'

/** Fire a one-off test notification to every subscribed device. */
export default defineEventHandler(async () => {
  const result = await sendPush({
    title: 'Flow Hub',
    body: 'Notifications are working 🎉',
    url: '/',
    tag: 'flow-hub-test'
  })
  return result
})
