# NaaP integration with PymtHouse (OIDC)

PymtHouse exposes a standards-based OpenID Connect provider under the issuer path **`/api/v1/oidc`**. NaaP is registered as a **first-party** integration: interactive consent is skipped for the NaaP client IDs listed below, and grants are created automatically for interactive flows.

## Issuer and discovery

- **Issuer** (default local): `http://localhost:3001/api/v1/oidc`  
  Derived from `NEXTAUTH_URL` (or `OIDC_ISSUER` if set) + `/api/v1/oidc`.
- **Discovery**: `{issuer}/.well-known/openid-configuration`
- **JWKS**: `{issuer}/jwks`
- **Authorization**: `{issuer}/auth`
- **Token**: `{issuer}/token`
- **UserInfo**: `{issuer}/me` (if enabled in deployment)

Use discovery in production to avoid hard-coding path drift.

## Registered NaaP clients

Two clients are seeded by `npm run oidc:seed` (see [`scripts/seed-oidc.ts`](../scripts/seed-oidc.ts)):

| `client_id`     | Use case | Auth | Grant types | Scopes |
|-----------------|----------|------|-------------|--------|
| **`naap-web`**  | NaaP browser app (Authorization Code + **PKCE**) | Public (`token_endpoint_auth_method: none`) | `authorization_code`, `refresh_token` | `openid sign:job discover:orchestrators` |
| **`naap-service`** | NaaP backends (machine tokens) | Confidential (`client_secret_post`) | `client_credentials` | `sign:job discover:orchestrators users:read users:write users:token` |

### Redirect URIs (`naap-web`)

Wildcard patterns are stored in the database and expanded for localhost ports inside the provider. Registered patterns:

- `http://localhost:*/api/v1/auth/providers/*/callback`
- `https://*.naap.dev/api/v1/auth/providers/*/callback`
- `https://*.vercel.app/api/v1/auth/providers/*/callback`

These align with NaaP’s provider callback shape:  
`/api/v1/auth/providers/{providerSlug}/callback` (see NaaP docs).

### Service client secret (`naap-service`)

- Set **`NAAP_SERVICE_CLIENT_SECRET`** in the environment before first seed to pin a known secret.
- If the client does not exist and the variable is unset, `oidc:seed` **generates** a secret once and prints it — store it in your secrets manager and set the env var on future runs.
- If **`naap-service` already exists**, seed **does not** change the secret unless `NAAP_SERVICE_CLIENT_SECRET` is set (rotation).

### Legacy `naap` `client_id`

Older databases may still have a single client **`naap`**. It remains in the **trusted first-party** set (see [`src/lib/oidc/trusted-clients.ts`](../src/lib/oidc/trusted-clients.ts)) so existing integrations keep working. New deployments should use **`naap-web`** for browser login.

## Interactive login (NaaP web)

1. Use **`naap-web`** as `client_id` (public client).
2. Start the Authorization Code flow with **PKCE** (`code_challenge` / `code_challenge_method=S256`).
3. Use a `redirect_uri` that matches one of the registered patterns (exact match after wildcard expansion for localhost).
4. Request scopes from the `naap-web` row (at minimum `openid` plus product scopes as needed).

## Machine access (NaaP service)

1. Obtain **`client_id`** `naap-service` and the configured **client secret**.
2. `POST {issuer}/token` with `grant_type=client_credentials` and authenticate the client (e.g. `client_id` + `client_secret` in the form body for `client_secret_post`).
3. Request a subset of the service client’s allowed scopes. Resource indicators (RFC 8707) follow your PymtHouse configuration (issuer as resource).

## Deprecated PymtHouse endpoints

Do **not** build new flows on:

- `GET /api/v1/naap/auth`
- `POST /api/v1/naap/exchange`

Use OIDC **`/api/v1/oidc/authorize`** and **`/api/v1/oidc/token`** instead.

## Related: tenant / builder APIs

Programmatic **app user** provisioning for **developer apps** (not NaaP’s own OIDC clients) uses Basic auth with each app’s credentials under `/api/v1/apps/{appId}/users`. See [builder API](builder-api.md) for details.

## Trust model

Trusted client IDs are centralized in **`TRUSTED_FIRST_PARTY_CLIENT_IDS`**. Adding a new first-party integration requires updating that module and the consent / grant logic in [`src/lib/oidc/provider.ts`](../src/lib/oidc/provider.ts) only if behavior should differ from the current shared policy.

## NextAuth session decrypt errors

If you see repeated `JWT_SESSION_ERROR` / `JWEDecryptionFailed` in local logs:

- Ensure `NEXTAUTH_SECRET` is set to one stable value.
- Check env precedence: `.env.local` overrides `.env`.
- Clear browser cookies for the app origin and sign in again.
