# Signer Docker assets

Everything needed to run the go-livepeer signer with an optional **Apache + mod_authnz_jwt** DMZ in front of it lives here.

| File / directory | Purpose |
|------------------|---------|
| `Dockerfile.signer` | Minimal Debian image that downloads go-livepeer (Railway/Render-style single-service signer). |
| `Dockerfile` | Multi-stage build: Apache gateway (`gateway` target) and combined Apache + livepeer (`signer-dmz` target). |
| `docker-compose.yml` | Local two-container stack: signer + gateway (JWT DMZ). |
| `apache/` | `envsubst` templates for Apache (`ports.conf`, `signer-dmz` vhost). |
| `entrypoint.sh` | JWKS → PEM sync, optional livepeer spawn, Apache foreground. |
| `scripts/jwks_to_pem.py` | Fetches OIDC JWKS and writes one RSA public key as PEM for `mod_authnz_jwt`. |

**Compose (from repo root):**

```bash
docker compose -f docker/signer-dmz/docker-compose.yml up --build
```

**Build the standalone signer image (from repo root):**

```bash
docker build -f docker/signer-dmz/Dockerfile.signer -t pymthouse-signer .
```

Platform config (`railway.json`, `render.yaml`) builds `docker/signer-dmz/Dockerfile` (final image: Apache JWT DMZ + livepeer). For **livepeer only** (no Apache), use `Dockerfile.signer` instead. See [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md) and [docs/signer-deployment-options.md](../../docs/signer-deployment-options.md).

## Troubleshooting DMZ `401` (HTML body from PymtHouse `/api/signer/*`)

PymtHouse validates your **OIDC** `Authorization: Bearer` token, then calls Apache with a **separate** short-lived RS256 JWT (`issueSignerDmzToken`, same `iss`/`aud` as `GET {issuer}/.well-known/openid-configuration`).

1. **Issuer string must match exactly** between Next (`getIssuer()` → `OIDC_ISSUER` or `NEXTAUTH_URL` + `/api/v1/oidc`) and the DMZ container (`OIDC_ISSUER` / `OIDC_AUDIENCE` in `entrypoint.sh`). A common break is `http://localhost:3001/...` in Docker vs `http://127.0.0.1:3001/...` in `.env.local` — pick one host form and use it everywhere.
2. **JWKS**: the DMZ container must fetch the same keys the app signs with (`JWKS_URI`; default rewrites `localhost` → `host.docker.internal` on Linux via `extra_hosts` in repo `docker-compose.yml`). Remote-only DMZ needs a **reachable** JWKS URL (tunnel, public URL, or VPN), not loopback on the PymtHouse laptop.
3. **Where PymtHouse sends traffic**: `SIGNER_INTERNAL_URL` (or DB signer URL / port) must be the **Apache** listener (e.g. `http://127.0.0.1:8080`), not go-livepeer `:8081` inside the container.
4. From **python-gateway**, run `examples/debug_signer_chain.py --billing-url …` with your access token to print discovery `issuer` vs token claims and to POST `sign-orchestrator-info` in one step.
