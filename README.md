# pymthouse Full Stack Quick Start

This guide starts the full local stack:
- Next.js app (UI + API) on `http://localhost:3001`
- PostgreSQL database (set `DATABASE_URL`; Neon or local Postgres)
- `go-livepeer` remote signer via Docker Compose

## Prerequisites

- Node.js + npm
- Docker + Docker Compose
- A PostgreSQL instance and `DATABASE_URL` connection string

## 1) Install dependencies

```bash
npm install
```

## 2) Configure environment

Create your local env file:

```bash
cp .env.example .env
```

If you also use `.env.local`, remember Next.js precedence: `.env.local` overrides `.env`.
Keep `NEXTAUTH_SECRET` consistent across files (or only set it in one place) to avoid
session cookie decrypt errors.

Minimum required for local startup:
- `NEXTAUTH_SECRET` (set to any long random string)
- `DATABASE_URL` (PostgreSQL connection string; migrations run on `npm run dev` / `npm run build`)
- `SIGNER_INTERNAL_URL` (default works with compose)
- `SIGNER_NETWORK` and `ETH_RPC_URL` (defaults work)

Generate a strong secret with:

```bash
openssl rand -base64 32
```

Optional (only if needed):
- Google/GitHub OAuth vars (for OAuth login)
- Privy vars (for end-user wallet flows)
- `NAAP_METRICS_URL` (metrics sink)

## 3) Start the signer service

```bash
docker compose up -d go-livepeer
```

Check signer logs (optional):

```bash
docker compose logs -f go-livepeer
```

## 4) Start the app

```bash
npm run dev
```

Open:
- Dashboard: `http://localhost:3001`
- Login: `http://localhost:3001/login`
- Health: `http://localhost:3001/api/v1/health`

Database migrations run automatically before dev/build (`npm run db:prepare`).

## 5) Create an admin token (first login)

In another terminal:

```bash
DATABASE_URL='postgresql://...' npm run bootstrap
```

This creates an admin user and prints a `pmth_...` bearer token. The token is valid for 1 year.

Optionally specify an email for the admin user:

```bash
DATABASE_URL='postgresql://...' npm run bootstrap admin@example.com
```

If an admin already exists, the script issues a new token for the existing admin instead of creating a new user.

**Using the token:**

- **Web login**: Paste the token into the login page at `http://localhost:3001/login`
- **API requests**: Use the `Authorization` header:

```bash
curl -H "Authorization: Bearer pmth_..." http://localhost:3001/api/v1/signers
```

Once logged in, you can issue additional gateway tokens from the admin dashboard.

## OIDC seed (NaaP + SDK clients)

After migrations, register built-in OIDC clients (signing key, **`naap-web`**, **`naap-service`**, `livepeer-sdk`):

```bash
npm run oidc:seed
```

Optional: set `NAAP_SERVICE_CLIENT_SECRET` in `.env` before seeding so the `naap-service` secret is known. See [docs/naap-oidc-integration.md](docs/naap-oidc-integration.md) and [docs/builder-api.md](docs/builder-api.md).

## Common commands

```bash
# Start signer
docker compose up -d go-livepeer

# Stop signer
docker compose stop go-livepeer

# Stop and remove signer container
docker compose down

# Run linter
npm run lint
```

## Troubleshooting

- `Signer is not running`: ensure `go-livepeer` is up (`docker compose ps`) and healthy.
- App can’t open DB: verify `DATABASE_URL` and that `npm run db:prepare` succeeds.
- OAuth buttons fail: set provider credentials in `.env` or use token login from `npm run bootstrap`.
- Repeating `JWT_SESSION_ERROR` / `JWEDecryptionFailed`:
  - Ensure one stable `NEXTAUTH_SECRET` value (watch `.env.local` overriding `.env`).
  - Clear `localhost` cookies (or open a private window), then sign in again.
