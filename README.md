# Postcard

**Design email like a native app.** Postcard is a beautiful, AI-native studio for
crafting emails that render everywhere — with a structured block model, reusable
mustache template variables, and a clean REST API to fetch your rendered HTML on
demand.

> Postcard began as the Flow Hub email designer and is now a standalone,
> self-contained product at the repository root — its own database, auth,
> billing and API, deployable on its own.

## Highlights

- 🎨 **Native-feeling studio** — a macOS-inspired UI with frosted materials,
  hairline detail and calm motion.
- ✨ **Postcard AI** — describe an email and the assistant builds & edits it block
  by block, live. The provider/model is an implementation detail and is never
  exposed to users.
- 🧩 **Structured blocks** — headings, text, buttons, images, columns, dividers,
  spacers and a raw-HTML escape hatch, rendered to email-safe, table-based HTML.
- 🔡 **Mustache variables** — drop `{{ firstName }}` anywhere; set sample values
  for previews and pass real values at render time via the API.
- 🔑 **REST API + OpenAPI** — list projects and fetch rendered HTML with variable
  substitution, authenticated by personal API keys.
- 💳 **Stripe billing** — Free / Starter / Pro plans with usage limits.
- 📈 **AI usage metering** — every assistant turn is recorded per user and
  enforced against the plan's monthly allowance.

## Stack

- [Nuxt 4](https://nuxt.com) + [Nuxt UI](https://ui.nuxt.com) (Vue 3, Tailwind 4)
- [Bun](https://bun.sh) runtime
- **Postgres** via Bun's native SQL driver + [Drizzle ORM](https://orm.drizzle.team)
- [Vercel AI SDK](https://sdk.vercel.ai) talking to an OpenAI-compatible
  **LiteLLM** gateway (model alias `mini-v2`)
- [Stripe](https://stripe.com) for subscriptions

## Quick start (Docker Compose)

```bash
cp .env.example .env       # fill in OPENAI_API_KEY (for the LiteLLM gateway), Stripe keys
docker compose up --build
# → app on http://localhost:3000, Postgres + LiteLLM run alongside it
```

The schema is created automatically on first boot. The first account you create
becomes the admin.

`docker-compose.override.yml` (merged automatically) publishes the app on host
port 3000. For a reverse-proxy / TLS deployment, delete that file or run
`docker compose -f docker-compose.yml up` and point your proxy at the `app`
service on port 3000, with `NUXT_SESSION_COOKIE_SECURE=1`.

## Local development

```bash
bun install
# point NUXT_DATABASE_URL at a local Postgres (or `docker compose up db`)
bun dev
```

## Configuration

All config is via environment variables — see [`.env.example`](./.env.example).
Notable groups:

| Group | Vars |
| --- | --- |
| Database | `NUXT_DATABASE_URL` |
| AI (hidden from users) | `NUXT_AI_BASE_URL`, `NUXT_AI_API_KEY`, `NUXT_AI_MODEL` |
| Billing | `NUXT_STRIPE_SECRET_KEY`, `NUXT_STRIPE_WEBHOOK_SECRET`, `NUXT_STRIPE_PRICE_STARTER`, `NUXT_STRIPE_PRICE_PRO` |
| App | `NUXT_PUBLIC_APP_URL` |

The AI provider is configured only in `litellm.config.yaml` and via env — the UI
only ever references "Postcard AI" and the `mini-v2` alias.

## Public API

Authenticate with a personal API key (`Authorization: Bearer pc_live_…`).

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/projects` | List your email projects |
| `GET` | `/api/v1/projects/{id}` | Get one project's metadata + variables |
| `GET` | `/api/v1/projects/{id}/html` | Render to HTML (substitutes `{{ vars }}` from query params; `?format=html` for raw HTML) |

The full machine-readable contract is served at `/api/openapi.json` and rendered
at `/docs/api`.

## License

MIT
