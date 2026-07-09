# Postcard

**Design email like a native app.** Postcard is a beautiful, AI-native studio for
crafting emails that render everywhere — with a structured block model, reusable
mustache template variables, and a clean REST API to fetch your rendered HTML on
demand.

> Postcard began as the Flow Hub email designer and is now a standalone,
> self-contained product — its own database, auth and API, deployable on its own.

## Highlights

- 🎨 **Native-feeling studio** — a macOS-inspired UI with frosted materials,
  hairline detail and calm motion.
- ✨ **Postcard AI** — describe an email and the assistant builds & edits it block
  by block, live. Works with any OpenAI-compatible provider.
- 🧩 **Structured blocks** — headings, text, buttons, images, columns, dividers,
  spacers and a raw-HTML escape hatch, rendered to email-safe, table-based HTML.
- 🔡 **Mustache variables** — drop `{{ firstName }}` anywhere; set sample values
  for previews and pass real values at render time via the API.
- 🔑 **REST API + OpenAPI** — list projects and fetch rendered HTML with variable
  substitution, authenticated by personal API keys.
- 🏠 **Self-hostable** — one `docker compose up` brings up the whole stack with no
  usage limits and no billing.

## Self-host in one command

You need [Docker](https://docs.docker.com/get-docker/) (with Compose). That's it.

```bash
git clone https://github.com/elrumo/email-hub.git
cd email-hub
docker compose up --build
# → open http://localhost:3000
```

The first account you create becomes the **admin**. The database, schema, auth and
API are all built in and initialise themselves on first boot — no external
services to sign up for, no config files to edit.

Self-hosted instances run with **unlimited** projects, AI messages and API keys,
and the billing/pricing UI is hidden.

### Enable the AI assistant

The studio works without AI, but Postcard AI is the fun part. It talks to any
**OpenAI-compatible** endpoint. The quickest path is an OpenAI key:

```bash
cp .env.example .env
# edit .env and set:
#   NUXT_AI_API_KEY=sk-...
docker compose up --build
```

Point it elsewhere by setting `NUXT_AI_BASE_URL` (and `NUXT_AI_MODEL`):

| Provider | `NUXT_AI_BASE_URL` | `NUXT_AI_MODEL` |
| --- | --- | --- |
| OpenAI (default) | *(empty)* | `gpt-4o-mini` |
| Ollama (local) | `http://host.docker.internal:11434/v1` | `llama3.1` |
| LiteLLM / other gateway | `http://your-gateway:4000/v1` | your alias |

If no provider is configured, the app runs fine — the AI features just return a
clear "not configured" message.

## What's in the box

`docker compose up` starts four services on a private network; only the app is
published (on port 3000):

| Service | Image | Role |
| --- | --- | --- |
| `app` | built from `./Dockerfile` (Nuxt + Bun) | the studio, API and server |
| `parse-server` | built from `./parse` (Parse Server 9) | data layer / auth |
| `mongo` | `mongo:8` | Parse's database (persisted in a volume) |
| `redis` | `redis:7-alpine` | caching / background jobs |

Data persists in the `postcard_mongo` and `postcard_redis` Docker volumes across
restarts.

## Configuration

Every value has a working default in `docker-compose.yml`, so **no `.env` is
required** to boot. Copy [`.env.example`](./.env.example) to `.env` to customise.
Notable groups:

| Group | Vars |
| --- | --- |
| AI (optional) | `NUXT_AI_API_KEY`, `NUXT_AI_BASE_URL`, `NUXT_AI_MODEL` |
| App | `NUXT_PUBLIC_APP_URL`, `NUXT_PUBLIC_SELF_HOSTED`, `NUXT_SESSION_COOKIE_SECURE`, `ADMIN_EMAILS` |
| Parse + Mongo | `PARSE_APP_ID`, `PARSE_MASTER_KEY`, `MONGO_PASSWORD` |
| File storage (optional) | `PARSE_SERVER_FILES_ADAPTER`, `S3_BUCKET`, `S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` |
| Mail (optional) | `NUXT_MAIL_SMTP_HOST`, `NUXT_MAIL_SMTP_PORT`, `NUXT_MAIL_SMTP_USER`, `NUXT_MAIL_SMTP_PASS`, `NUXT_MAIL_FROM` |

### Exposing it to the internet

`docker-compose.override.yml` (merged automatically) publishes the app on host
port 3000 for local use. For a production, TLS-terminated deployment:

1. Generate unique internal secrets:
   ```bash
   ./scripts/gen-secrets.sh   # writes a .env with random PARSE_MASTER_KEY / MONGO_PASSWORD
   ```
2. Set `NUXT_PUBLIC_APP_URL` to your real URL and `NUXT_SESSION_COOKIE_SECURE=1`.
3. Put a reverse proxy (Caddy, Nginx, Traefik…) in front of the `app` service —
   either point it at port 3000, or run `docker compose -f docker-compose.yml up`
   (without the override) so the port isn't published directly.

### Using a prebuilt image

Every push to `main` publishes an image to the GitHub Container Registry, so you
can skip the local build:

```bash
POSTCARD_IMAGE=ghcr.io/elrumo/email-hub:latest docker compose up
```

## Local development

```bash
bun install
docker compose up -d mongo parse-server redis   # backing services
export PARSE_SERVER_URL=http://localhost:1337/parse
export PARSE_MASTER_KEY=postcard-selfhosted-master-key-change-me
export NUXT_PUBLIC_SELF_HOSTED=true
bun dev   # → http://localhost:3000
```

## Public API

Authenticate with a personal API key (`Authorization: Bearer pc_live_…`).

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/projects` | List your email projects |
| `GET` | `/api/v1/projects/{id}` | Get one project's metadata + variables |
| `GET` | `/api/v1/projects/{id}/html` | Render to HTML (substitutes `{{ vars }}` from query params; `?format=html` for raw HTML) |

The full machine-readable contract is served at `/api/openapi.json` and rendered
at `/docs/api`.

## Stack

- [Nuxt 4](https://nuxt.com) + [Nuxt UI](https://ui.nuxt.com) (Vue 3, Tailwind 4)
- [Bun](https://bun.sh) runtime
- [Parse Server](https://parseplatform.org) + [MongoDB](https://www.mongodb.com)
- [Vercel AI SDK](https://sdk.vercel.ai) against any OpenAI-compatible endpoint

## License

MIT
