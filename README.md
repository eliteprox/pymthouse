# pymthouse Full Stack Quick Start

This guide starts the full local stack:
- Next.js app (UI + API) on `http://localhost:3001`
- SQLite database at `./data/pymthouse.db`
- `go-livepeer` remote signer via Docker Compose

## Prerequisites

- Node.js + npm
- Docker + Docker Compose

## 1) Install dependencies

```bash
npm install
```

## 2) Configure environment

Create your local env file:

```bash
cp .env.example .env
```

Minimum required for local startup:
- `NEXTAUTH_SECRET` (set to any long random string)
- `DATABASE_PATH` (default works)
- `SIGNER_INTERNAL_URL` (default works with compose)
- `SIGNER_NETWORK` and `ETH_RPC_URL` (defaults work)

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

Database tables are created automatically on first app load.

## 5) Create an admin token (first login)

In another terminal:

```bash
npm run bootstrap
```

This prints a `pmth_...` admin token. Paste it into the login page to sign in.

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
- App can’t open DB: verify `DATABASE_PATH` and write permissions for the `data/` directory.
- OAuth buttons fail: set provider credentials in `.env` or use token login from `npm run bootstrap`.
