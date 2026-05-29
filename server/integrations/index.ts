import { registerIntegration } from "../engine/registry";
import { bunnyIntegration } from "./bunny";
import { dokployIntegration } from "./dokploy";
import { kumaIntegration } from "./kuma";
import { notifyIntegration } from "./notify";
import { probeIntegration } from "./probe";

let registered = false;

/**
 * Register every integration with the engine registry. Called once at boot.
 * Adding a new integration (e.g. S3) = import it and add it to this list — no
 * engine or UI changes required.
 */
export function registerAllIntegrations(): void {
  if (registered) return;
  for (const i of [
    dokployIntegration,
    bunnyIntegration,
    kumaIntegration,
    probeIntegration,
    notifyIntegration
  ]) {
    registerIntegration(i);
  }
  registered = true;
}
