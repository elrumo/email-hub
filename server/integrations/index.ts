import { registerIntegration } from '../engine/registry'
import { aiIntegration } from './ai'
import { browserIntegration } from './browser'
import { bunnyIntegration } from './bunny'
import { dokployIntegration } from './dokploy'
import { homeAssistantIntegration } from './homeassistant'
import { kumaIntegration } from './kuma'
import { mailgunIntegration } from './mailgun'
import { mongoIntegration } from './mongo'
import { notifyIntegration } from './notify'
import { pingIntegration } from './ping'
import { probeIntegration } from './probe'
import { s3Integration } from './s3'
import { telegramIntegration } from './telegram'

let registered = false

/**
 * Register every integration with the engine registry. Called once at boot.
 * Adding a new integration (e.g. S3) = import it and add it to this list — no
 * engine or UI changes required.
 */
export function registerAllIntegrations(): void {
  if (registered) return
  for (const i of [
    dokployIntegration,
    bunnyIntegration,
    kumaIntegration,
    probeIntegration,
    pingIntegration,
    notifyIntegration,
    browserIntegration,
    telegramIntegration,
    mailgunIntegration,
    mongoIntegration,
    s3Integration,
    aiIntegration,
    homeAssistantIntegration
  ]) {
    registerIntegration(i)
  }
  registered = true
}
