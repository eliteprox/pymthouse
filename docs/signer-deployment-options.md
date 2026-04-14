# go-livepeer Signer Deployment Options

The go-livepeer signer can be deployed in several ways. Choose the option that best fits your needs.

## Binary vs Docker Image

### Binary Release (Recommended)

**Pros:**
- ✅ Smaller size (~50MB compressed vs 500MB+ Docker image)
- ✅ Faster deployments and startup
- ✅ Works with more platforms (Heroku buildpacks, Railway Nixpacks)
- ✅ Lower memory footprint
- ✅ Easier to debug (just a binary)

**Cons:**
- ⚠️ Platform-specific (linux-amd64, darwin-amd64, etc.)
- ⚠️ Manual updates required

**Use for:** Railway (Nixpacks), Render, Fly.io, Heroku, or any buildpack-based platform

### Docker Image

**Pros:**
- ✅ Official maintained image
- ✅ Platform-independent
- ✅ Easy updates (just change tag)
- ✅ Pre-configured environment

**Cons:**
- ⚠️ Larger size
- ⚠️ Slower deployments
- ⚠️ More memory usage

**Use for:** Docker Compose (local dev), Kubernetes, AWS ECS, or platforms requiring Docker images

## Deployment Methods

### Option 1: Railway (Nixpacks) - Easiest with Binary

Railway's Nixpacks automatically detects and uses `nixpacks.toml`:

1. **Create new project on Railway**
2. **Connect GitHub repository**
3. **Railway auto-detects `nixpacks.toml`**
4. **Add environment variables:**
   ```
   SIGNER_NETWORK=arbitrum-one-mainnet
   PORT=8081
   ETH_RPC_URL=https://arb1.arbitrum.io/rpc
   SIGNER_ETH_ADDR=<optional>
   ```
5. **Add a volume** at `/app/data` for persistent storage
6. **Deploy** - Railway will download the binary and run it

**Cost:** ~$5-10/month for 500MB RAM

### Option 2: Railway (Dockerfile)

If you prefer Docker on Railway:

1. **Create new project**
2. **Settings → Deploy → Dockerfile Path:** `Dockerfile.signer`
3. **Add environment variables** (same as above)
4. **Add volume** at `/data`
5. **Deploy**

### Option 3: Render (Docker)

Render uses the `render.yaml` blueprint:

1. **Import repository** on Render
2. **Render auto-detects `render.yaml`**
3. **Adjust environment variables** in dashboard
4. **Deploy**

Render downloads the binary inside the Dockerfile for faster builds.

**Cost:** $7/month for starter tier (or free tier with spindown)

### Option 4: Fly.io (Binary or Docker)

#### Using Binary (Recommended)

Create a `fly.toml`:

```toml
app = "pymthouse-signer"

[build]
  [build.args]
    LIVEPEER_VERSION = "0.8.10"

[env]
  SIGNER_NETWORK = "arbitrum-one-mainnet"
  ETH_RPC_URL = "https://arb1.arbitrum.io/rpc"

[[services]]
  internal_port = 8081
  protocol = "tcp"

  [[services.ports]]
    port = 80
    handlers = ["http"]

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

[mounts]
  source = "livepeer_data"
  destination = "/app/data"
```

Create a `Dockerfile.fly`:

```dockerfile
FROM debian:bookworm-slim

RUN apt-get update && \
    apt-get install -y wget ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    wget -q https://github.com/livepeer/go-livepeer/releases/download/v0.8.10/livepeer-linux-amd64.tar.gz && \
    tar -xzf livepeer-linux-amd64.tar.gz && \
    mv livepeer-linux-amd64/livepeer /usr/local/bin/livepeer && \
    chmod +x /usr/local/bin/livepeer && \
    rm -rf livepeer-linux-amd64*

RUN mkdir -p /app/data && echo "" > /app/.eth-password

WORKDIR /app

CMD ["livepeer", "-remoteSigner", "-network", "${SIGNER_NETWORK}", "-httpAddr", "0.0.0.0:8081", "-cliAddr", "0.0.0.0:4935", "-ethUrl", "${ETH_RPC_URL}", "-ethPassword", "/app/.eth-password", "-datadir", "/app/data", "-v", "99"]
```

Deploy:
```bash
fly launch
fly deploy
```

**Cost:** ~$3-5/month for shared-cpu-1x

### Option 5: Google Cloud Run (Docker)

Cloud Run can run the Docker container:

```bash
# Build and push to GCR
gcloud builds submit --tag gcr.io/PROJECT_ID/pymthouse-signer

# Deploy
gcloud run deploy pymthouse-signer \
  --image gcr.io/PROJECT_ID/pymthouse-signer \
  --platform managed \
  --port 8081 \
  --set-env-vars SIGNER_NETWORK=arbitrum-one-mainnet,ETH_RPC_URL=https://arb1.arbitrum.io/rpc \
  --allow-unauthenticated
```

**Note:** Cloud Run is stateless by default. You'll need to add a volume for `/data` or use Cloud Storage.

### Option 6: DigitalOcean App Platform

1. **Create new app** from GitHub
2. **Detect Dockerfile:** Select `Dockerfile.signer`
3. **Add environment variables**
4. **Attach a managed database** or volume for `/data`
5. **Deploy**

**Cost:** $5/month for basic tier

### Option 7: AWS ECS/Fargate

For production-grade AWS deployment:

1. **Push to ECR:**
   ```bash
   docker build -f Dockerfile.signer -t pymthouse-signer .
   docker tag pymthouse-signer:latest AWS_ACCOUNT.dkr.ecr.REGION.amazonaws.com/pymthouse-signer:latest
   docker push AWS_ACCOUNT.dkr.ecr.REGION.amazonaws.com/pymthouse-signer:latest
   ```

2. **Create ECS task definition** with:
   - Container image from ECR
   - Port mappings: 8081
   - Environment variables
   - EFS volume for `/data`

3. **Create ECS service** with Application Load Balancer

**Cost:** ~$15-30/month for Fargate + ALB

## Binary Releases Available

From https://github.com/livepeer/go-livepeer/releases:

- `livepeer-linux-amd64.tar.gz` - Most common (Railway, Render, Fly.io)
- `livepeer-linux-arm64.tar.gz` - ARM servers
- `livepeer-darwin-amd64.tar.gz` - macOS Intel (local dev)
- `livepeer-darwin-arm64.tar.gz` - macOS Apple Silicon (local dev)
- `livepeer-windows-amd64.tar.gz` - Windows (local dev)

## Recommended: Railway with nixpacks.toml

**Why?**
- ✅ Simplest setup (just push code)
- ✅ Automatic binary download
- ✅ Built-in health checks
- ✅ Easy volume management
- ✅ Great developer experience
- ✅ Pay-as-you-go pricing

**Steps:**
1. Push code with `nixpacks.toml` to GitHub
2. Import to Railway
3. Add env vars
4. Add volume at `/app/data`
5. Deploy

Done in 5 minutes!

## Testing the Deployment

After deployment, test your signer:

```bash
# Health check
curl https://your-signer-url/status

# Should return JSON with orchestrator info
curl https://your-signer-url/registeredOrchestrators
```

## Connecting to Vercel

Once deployed, add to Vercel environment variables:

```
SIGNER_INTERNAL_URL=https://your-signer-url
SIGNER_CLI_URL=https://your-signer-url
```

Then redeploy your Vercel app.

## Monitoring

All platforms provide logs:

- **Railway:** Dashboard → Deployments → View Logs
- **Render:** Dashboard → Logs
- **Fly.io:** `fly logs`
- **Cloud Run:** Cloud Console → Logs

Look for:
- `HTTP server listening` - Signer started successfully
- `Livepeer Node` version info
- No connection errors to `ETH_RPC_URL`

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Binary not found | Ensure wget/tar worked in build phase |
| Permission denied | Add `chmod +x livepeer` after download |
| Port binding error | Use `0.0.0.0:${PORT}` not `localhost` |
| Data persistence lost | Add volume/disk mount at `/data` or `/app/data` |
| Can't reach from Vercel | Ensure public URL is exposed, test with curl |

## Performance Comparison

| Platform | Cold Start | Memory Usage | Cost/mo |
|----------|-----------|--------------|---------|
| Railway (Binary) | ~5s | ~200MB | $5-10 |
| Railway (Docker) | ~10s | ~250MB | $5-10 |
| Render (Free) | ~30s | ~250MB | $0 (spindown) |
| Render (Starter) | ~10s | ~250MB | $7 |
| Fly.io | ~8s | ~200MB | $3-5 |
| Cloud Run | ~15s | ~250MB | Pay per use |

## Security Notes

- 🔒 Never commit `.eth-password` or keystore files to git
- 🔒 Use environment variables for sensitive data
- 🔒 Consider using HTTPS for all signer communication
- 🔒 Restrict network access if possible (VPC, private networks)
- 🔒 Monitor logs for unusual activity

## Updating the Binary

To update to a new version:

1. **Update the download URL** in:
   - `Dockerfile.signer` (line with wget)
   - `nixpacks.toml` (install phase)
   
2. **Change version number:**
   ```
   v0.8.10 → v0.8.11
   ```

3. **Redeploy** on your platform

4. **Test** the new version

## Next Steps

- ✅ Deploy signer to chosen platform
- ✅ Get public URL
- ✅ Add URL to Vercel environment variables
- ✅ Deploy Next.js app to Vercel
- ✅ Test end-to-end flow
