# dokploy-doctor

A self-hosted **DNS failover daemon** with a web dashboard. It watches host
health in [Uptime Kuma](https://uptime.kuma.pet/) and, when a host goes down,
automatically flips the active [Bunny.net](https://bunny.net/) DNS A record to a
healthy backup IP — so traffic moves to a working server without manual
intervention.

Built on [Nuxt 4](https://nuxt.com/) + [Nuxt UI](https://ui.nuxt.com/), it runs
as a single long-lived server process (Nitro) that does the monitoring in the
background and serves a dashboard for visibility and configuration.

---

## What problem it solves

You run the same service on two (or more) servers, each with its own IP. DNS
points at the "active" one. If that server dies, you normally have to notice the
outage and manually edit DNS to point at the surviving server — and wait for the
change to take effect.

dokploy-doctor automates that loop:

1. Uptime Kuma already monitors your hosts and exposes their up/down status.
2. dokploy-doctor polls Kuma, detects sustained downtime, **independently
   verifies** the failure, then swaps the Bunny.net DNS record to a backup IP
   that it has confirmed is actually responding.
3. It notifies you (Discord) and shows the whole state on a dashboard.

---

## How it works

### The polling loop

A background plugin ([server/plugins/failover.ts](server/plugins/failover.ts))
starts when the server boots and runs `tick()` forever on a fixed interval
(`NUXT_POLL_INTERVAL_MS`, default 30s). Each tick:

1. **Fetches Kuma status** ([server/utils/kuma.ts](server/utils/kuma.ts)) by
   scraping Kuma's Prometheus `/metrics` endpoint and parsing
   `monitor_status{monitor_name="..."} <0|1|2|3>` lines into a map of
   monitor → status (`0=down, 1=up, 2=pending, 3=maintenance`).
2. **Processes each mapping** ([server/utils/failover.ts](server/utils/failover.ts), `handleMapping`).
3. **Updates a snapshot** of current state + per-host history for the dashboard.
4. **Persists state** to disk.

If Kuma itself is unreachable for `NUXT_KUMA_ERROR_THRESHOLD` consecutive ticks,
it alerts once and stops trying to act until Kuma comes back.

### The failover decision (per mapping)

For each mapping ([server/utils/failover.ts:46](server/utils/failover.ts#L46)):

- **Status UP (1):** reset the failure counter. Done.
- **Status DOWN/pending/maintenance:** increment a consecutive-failure counter.
  - If failures are still below `NUXT_FAIL_THRESHOLD` (default 2) → wait, don't act.
  - If a failover happened recently (within `NUXT_COOLDOWN_MS`, default 5 min) →
    in cooldown, don't act. This prevents flapping.
  - Otherwise, proceed to the **switch logic**:
    1. Fetch the Bunny zone and find the *managed* A records — only records whose
       value is one of the IPs listed for this mapping
       ([server/utils/bunny.ts](server/utils/bunny.ts), `getManagedRecords`).
    2. Require at least 2 managed records and exactly one currently enabled
       ("active"); otherwise alert and bail (config problem, needs a human).
    3. **Probe the active IP directly** ([server/utils/probe.ts](server/utils/probe.ts)):
       an HTTPS GET sent straight to the IP with the correct `Host` header + SNI.
       If it responds (`status < 500`), Kuma is wrong / it's a transient blip —
       **do not switch.** This is the key safety check that avoids false failovers.
    4. If the active IP is truly dead, probe each backup IP in turn and pick the
       first one that responds.
    5. If no backup responds → alert "manual fix needed," don't switch.
    6. Otherwise **flip DNS**: disable the dead record and enable the healthy one
       via the Bunny API, record the switch time, reset the failure counter, and
       send a `🔁 failover` notification.

So a switch only happens when: the monitor reports down *and* it has been down
for N consecutive checks *and* not in cooldown *and* the active IP independently
fails a direct probe *and* a backup independently passes one.

### Notifications ([server/utils/notify.ts](server/utils/notify.ts))

Posts to a Discord webhook (if configured). Two kinds:

- **Transition alerts** (optional, `NUXT_NOTIFY_TRANSITIONS`): "monitor reports
  DOWN" / "recovered," debounced by the fail threshold and de-duplicated across
  ticks and restarts so you don't get spammed.
- **Action/warning alerts**: failover performed, config problems (too few
  records, no enabled record), "no backup responding," and Kuma connectivity
  loss/restore. These always fire.

### State & persistence ([server/utils/storage.ts](server/utils/storage.ts))

Two JSON files on a persisted volume (atomic write via temp-file + rename):

- **`mappings.json`** — the configured mappings. The dashboard is the source of
  truth and writes this file. On first boot, if it's missing, an optional
  `NUXT_SEED_MAPPINGS` JSON blob is written as the initial set (one-time
  migration aid).
- **`state.json`** — runtime memory across restarts: per-host failure counts,
  last-switch timestamps, and last-notified status.

All in-memory shared state lives in a single module
([server/utils/runtime.ts](server/utils/runtime.ts)) that Nitro keeps as one
instance per process.

---

## The dashboard

The single-page UI ([app/pages/index.vue](app/pages/index.vue)) polls
`/api/status` every 5 seconds ([app/composables/useStatus.ts](app/composables/useStatus.ts))
and shows, per mapping ([app/components/MappingCard.vue](app/components/MappingCard.vue)):

- Current Kuma status, the active IP, and the state of each managed A record
  (present / disabled).
- A short history sparkline of recent statuses.
- Consecutive-failure count and last-switch time.

From the UI you can **add, edit, and delete mappings**
([MappingEditor.vue](app/components/MappingEditor.vue),
[DeleteConfirm.vue](app/components/DeleteConfirm.vue)) and trigger an immediate
re-check. The footer shows poll/cooldown config at a glance.

---

## A "mapping" — the core config object

Defined in [server/utils/types.ts](server/utils/types.ts), validated in
[server/utils/validation.ts](server/utils/validation.ts):

| Field         | Meaning                                                                 |
| ------------- | ----------------------------------------------------------------------- |
| `kumaMonitor` | The exact monitor name as it appears in Uptime Kuma.                    |
| `fqdn`        | The hostname; also used as the `Host` header + SNI when probing. Unique key. |
| `bunnyZoneId` | The Bunny.net DNS zone ID.                                              |
| `recordName`  | The subdomain label within the zone, or `@` for the apex.              |
| `ips`         | The IPs this mapping may manage (≥2, unique). Only A records matching these IPs are touched. |
| `healthPath`  | Optional path to GET when probing (default `/`).                       |

---

## HTTP API

| Method & route                | Purpose                                                        |
| ----------------------------- | -------------------------------------------------------------- |
| `GET /api/status`             | Full snapshot + per-host history (what the dashboard polls).   |
| `GET /api/mappings`           | List configured mappings.                                      |
| `POST /api/mappings`          | Create a mapping (validated; rejects duplicate fqdn).          |
| `PUT /api/mappings/:fqdn`     | Update a mapping (handles fqdn rename + collision check).      |
| `DELETE /api/mappings/:fqdn`  | Delete a mapping and clear its runtime state.                  |
| `POST /api/trigger`           | Force an immediate tick (returns 202; coalesces with in-flight).|
| `GET /healthz`                | Liveness check, returns `ok` (never auth-gated).               |

Mutating a mapping triggers an immediate tick so the dashboard reflects it
right away.

### Auth ([server/middleware/auth.ts](server/middleware/auth.ts))

Optional HTTP Basic auth gating the whole app (except `/healthz`), enabled by
setting `NUXT_UI_USERNAME` / `NUXT_UI_PASSWORD`. Leave blank to run unprotected
(e.g. behind Tailscale or a private network).

---

## Configuration (env vars)

All config is via Nuxt `runtimeConfig`, set through `NUXT_`-prefixed env vars
(see [.env.example](.env.example)):

| Variable                     | Default            | Purpose                                            |
| ---------------------------- | ------------------ | -------------------------------------------------- |
| `NUXT_KUMA_URL`              | —                  | Uptime Kuma base URL.                              |
| `NUXT_KUMA_API_KEY`          | —                  | Kuma API key (used as Basic auth for `/metrics`).  |
| `NUXT_BUNNY_API_KEY`         | —                  | Bunny.net account API key.                         |
| `NUXT_UI_USERNAME` / `_PASSWORD` | blank          | Dashboard Basic auth (blank = no auth).            |
| `NUXT_DISCORD_WEBHOOK_URL`   | blank              | Discord webhook for notifications.                 |
| `NUXT_NOTIFY_TRANSITIONS`    | `true`             | Send up/down transition alerts.                    |
| `NUXT_KUMA_ERROR_THRESHOLD`  | `3`                | Consecutive Kuma failures before alerting.         |
| `NUXT_POLL_INTERVAL_MS`      | `30000`            | How often the loop ticks.                          |
| `NUXT_COOLDOWN_MS`           | `300000` (5 min)   | Min time between failovers per host (anti-flap).   |
| `NUXT_FAIL_THRESHOLD`        | `2`                | Consecutive downs before acting.                   |
| `NUXT_PROBE_TIMEOUT_MS`      | `5000`             | Direct-probe timeout.                              |
| `NUXT_HISTORY_MAX`           | `60`               | History points kept per host.                      |
| `NUXT_BUNNY_CACHE_MS`        | `60000`            | Bunny zone read cache (for the dashboard).         |
| `NUXT_STATE_FILE`            | `/data/state.json` | Persisted runtime state path.                      |
| `NUXT_MAPPINGS_FILE`         | `/data/mappings.json` | Mappings store path.                            |
| `NUXT_SEED_MAPPINGS`         | `[]`               | One-time initial mappings if the file is absent.   |

---

## Tech stack

- **Nuxt 4** with the Nitro server engine (one process: background loop + API + UI).
- **Nuxt UI 4** / **Tailwind CSS 4** for the dashboard.
- **Vue 3** SPA dashboard, prerendered shell.
- No database — state is two JSON files on a persisted volume.
- External integrations: **Uptime Kuma** (read status), **Bunny.net DNS**
  (read/write records), **Discord** (notify).

## Running

```bash
pnpm install
pnpm dev      # dev server on http://localhost:3000
pnpm build    # production build
pnpm preview  # run the production build
```

Provide the env vars above (a `.env` file works) and mount a persistent volume
for `/data` so mappings and state survive restarts.
