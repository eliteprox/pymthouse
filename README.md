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

Once logged in, you can issue additional remote-signer tokens from the admin dashboard.

## OIDC seed and client registration

After migrations, initialize OIDC signing keys:

```bash
npm run oidc:seed
```

Then register application clients through the dashboard/API and rotate secrets per app from the credentials endpoint (`/api/v1/apps/{clientId}/credentials`). See [docs/builder-api.md](docs/builder-api.md) for OIDC, Builder, and Usage API integration.

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

## Deployment to Production

### Vercel + Railway/Render

Pymthouse can be deployed to Vercel (for the Next.js app) with the Docker signer running on Railway, Render, or Fly.io.

**Quick Deploy (15 minutes):**
See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for a quick checklist.

**Detailed Guide:**
See [docs/vercel-deployment.md](docs/vercel-deployment.md) for full step-by-step instructions including:
- Deploying the go-livepeer signer to Railway/Render/Fly.io
- Deploying the Next.js app to Vercel
- Configuring environment variables
- Setting up PostgreSQL (Neon/Vercel Postgres)
- OAuth callback URLs
- Custom domains

**Files included:**
- `vercel.json` - Vercel configuration
- `docker/signer-dmz/` — go-livepeer signer Dockerfiles, Apache JWT DMZ, `docker-compose.yml`, and `scripts/jwks_to_pem.py` (see [docker/signer-dmz/README.md](docker/signer-dmz/README.md))
- `railway.json` - Railway configuration
- `render.yaml` - Render Blueprint

## Troubleshooting

- `Signer is not running`: ensure `go-livepeer` is up (`docker compose ps`) and healthy.
- App can’t open DB: verify `DATABASE_URL` and that `npm run db:prepare` succeeds.
- OAuth buttons fail: set provider credentials in `.env` or use token login from `npm run bootstrap`.
- Repeating `JWT_SESSION_ERROR` / `JWEDecryptionFailed`:
  - Ensure one stable `NEXTAUTH_SECRET` value (watch `.env.local` overriding `.env`).
  - Clear `localhost` cookies (or open a private window), then sign in again.
