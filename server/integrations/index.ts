import { registerIntegration } from '../engine/registry'
import { aiIntegration } from './ai'
import { bookloreIntegration } from './booklore'
import { browserIntegration } from './browser'
import { bunnyIntegration } from './bunny'
import { dokployIntegration } from './dokploy'
import { fetchIntegration } from './fetch'
import { googleAnalyticsIntegration } from './google-analytics'
import { homeAssistantIntegration } from './homeassistant'
import { jellyfinIntegration } from './jellyfin'
import { komgaIntegration } from './komga'
import { kumaIntegration } from './kuma'
import { mailgunIntegration } from './mailgun'
import { mongoIntegration } from './mongo'
import { notifyIntegration } from './notify'
import { pingIntegration } from './ping'
import { plausibleIntegration } from './plausible'
import { probeIntegration } from './probe'
import { qbittorrentIntegration } from './qbittorrent'
import { s3Integration } from './s3'
import { seerrIntegration } from './seerr'
import { servarrIntegration } from './servarr'
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
    fetchIntegration,
    notifyIntegration,
    browserIntegration,
    telegramIntegration,
    mailgunIntegration,
    mongoIntegration,
    s3Integration,
    aiIntegration,
    homeAssistantIntegration,
    plausibleIntegration,
    googleAnalyticsIntegration,
    servarrIntegration,
    qbittorrentIntegration,
    jellyfinIntegration,
    seerrIntegration,
    komgaIntegration,
    bookloreIntegration
  ]) {
    registerIntegration(i)
  }
  registered = true
}
