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

Platform config (`railway.json`, `render.yaml`) points at `docker/signer-dmz/Dockerfile.signer`. See [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md) and [docs/signer-deployment-options.md](../../docs/signer-deployment-options.md).
