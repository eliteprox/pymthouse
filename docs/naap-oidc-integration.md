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
| **`naap-web`**  | NaaP web (authorize in browser; **token exchange on NaaP server only**) | Confidential (`client_secret_post`) | `authorization_code`, `refresh_token` | `openid gateway sign:job discover:orchestrators` (see [`NAAP_WEB_OIDC_SCOPES`](../src/lib/oidc/scopes.ts)) |
| **`naap-service`** | NaaP backends (machine tokens) | Confidential (`client_secret_post`) | `client_credentials` | `sign:job discover:orchestrators users:read users:write users:token` |

### Redirect URIs (`naap-web`)

Wildcard patterns are stored in the database and expanded for localhost ports inside the provider. Registered patterns:

- `http://localhost:*/api/v1/auth/providers/*/callback`
- `https://*.naap.dev/api/v1/auth/providers/*/callback`
- `https://*.vercel.app/api/v1/auth/providers/*/callback`

These align with NaaP’s provider callback shape:  
`/api/v1/auth/providers/{providerSlug}/callback` (see NaaP docs).

### Web client secret (`naap-web`)

- Set **`NAAP_WEB_CLIENT_SECRET`** in the environment before first seed to pin a known secret (the same value must be available to NaaP **server-side** code that calls the token endpoint — never expose it to the browser). On the NaaP app, the same secret is read as **`PMTHOUSE_CLIENT_SECRET`** (see NaaP `docs/pymthouse-integration.md`).
- If the client does not exist and the variable is unset, `oidc:seed` **generates** a secret once and prints it — store it in your secrets manager and set the env var on future runs.
- If **`naap-web` already exists** as a legacy **public** client (`token_endpoint_auth_method: none`), seed **does not** change it until `NAAP_WEB_CLIENT_SECRET` is set; re-run `oidc:seed` after setting the variable to migrate to confidential.
- If **`naap-web` already exists** as confidential, seed **does not** change the secret unless `NAAP_WEB_CLIENT_SECRET` is set (rotation).

### Service client secret (`naap-service`)

- Set **`NAAP_SERVICE_CLIENT_SECRET`** in the environment before first seed to pin a known secret.
- If the client does not exist and the variable is unset, `oidc:seed` **generates** a secret once and prints it — store it in your secrets manager and set the env var on future runs.
- If **`naap-service` already exists**, seed **does not** change the secret unless `NAAP_SERVICE_CLIENT_SECRET` is set (rotation).

### Legacy `naap` `client_id`

Older databases may still have a single client **`naap`**. It remains in the **trusted first-party** set (see [`src/lib/oidc/trusted-clients.ts`](../src/lib/oidc/trusted-clients.ts)) so existing integrations keep working. New deployments should use **`naap-web`** for browser login.

## Interactive login (NaaP web)

1. Use **`naap-web`** as `client_id` with the configured **`client_secret`** on the **token** request only (confidential client, `client_secret_post`).
2. Start the Authorization Code flow from the user agent (redirect to `{issuer}/auth` with `response_type=code`, `client_id`, `redirect_uri`, `scope`, `state`, and optional `nonce` as needed).
3. Use a `redirect_uri` that matches one of the registered patterns (exact match after wildcard expansion for localhost).
4. On your **NaaP backend**, exchange the code at `{issuer}/token` with `grant_type=authorization_code`, the same `redirect_uri`, `code`, **`client_id`**, and **`client_secret`** (form body). Do not rely on PKCE for **confidential** clients: PymtHouse only requires PKCE for **public** clients; confidential clients authenticate at the token endpoint with the secret.
5. Request scopes allowed for that client (at minimum `openid` plus product scopes; include **`gateway`** if you will exchange for a long-lived gateway session token below).

## NaaP gateway session token (RFC 8693)

After the authorization-code step, NaaP holds a **short-lived OIDC access token** (JWT). To obtain the long-lived **`pmth_*`** gateway session used by NaaP’s billing link storage, NaaP calls **`POST {issuer}/token`** with **RFC 8693 token exchange**:

- `grant_type=urn:ietf:params:oauth:grant-type:token-exchange`
- `client_id` / `client_secret`: the **same confidential client** used in the authorization-code step (often **`naap-web`**; any confidential client whose access JWT carries matching `client_id` / `azp`)
- `subject_token`: the OIDC **access token** from the previous step
- `subject_token_type=urn:ietf:params:oauth:token-type:access_token`
- `scope=gateway` (subject token must already include `gateway`)

The handler requires the subject JWT’s **`client_id` (or `azp`)** to equal the authenticated **`client_id`** so one client cannot exchange tokens minted for another.

Implementation: [`src/lib/oidc/naap-gateway-token-exchange.ts`](../src/lib/oidc/naap-gateway-token-exchange.ts) (invoked from [`src/app/api/v1/oidc/[...oidc]/route.ts`](../src/app/api/v1/oidc/[...oidc]/route.ts) before the developer-app JWT token exchange handler).

Response: OAuth token JSON with **`access_token`** set to the opaque `pmth_*` gateway session (90-day lifetime), plus `expires_in`, `token_type`, `issued_token_type`, `scope`.

## Machine access (NaaP service)

1. Obtain **`client_id`** `naap-service` and the configured **client secret**.
2. `POST {issuer}/token` with `grant_type=client_credentials` and authenticate the client (e.g. `client_id` + `client_secret` in the form body for `client_secret_post`).
3. Request a subset of the service client’s allowed scopes. Resource indicators (RFC 8707) follow your PymtHouse configuration (issuer as resource).

## Deprecated PymtHouse endpoints

Do **not** build new flows on:

- `GET /api/v1/naap/auth`
- `POST /api/v1/naap/exchange` (superseded for NaaP by **RFC 8693** at `{issuer}/token` as documented above; may remain for older clients until removed)

Use OIDC **`{issuer}/auth`**, **`{issuer}/token`** (authorization code + token exchange) instead.

## Related: tenant / builder APIs

Programmatic **app user** provisioning for **developer apps** (not NaaP’s own OIDC clients) uses Basic auth with each app’s credentials under `/api/v1/apps/{appId}/users`. See [builder API](builder-api.md) for details.

## Trust model

Trusted client IDs are centralized in **`TRUSTED_FIRST_PARTY_CLIENT_IDS`**. Adding a new first-party integration requires updating that module and the consent / grant logic in [`src/lib/oidc/provider.ts`](../src/lib/oidc/provider.ts) only if behavior should differ from the current shared policy.

## NextAuth session decrypt errors

If you see repeated `JWT_SESSION_ERROR` / `JWEDecryptionFailed` in local logs:

- Ensure `NEXTAUTH_SECRET` is set to one stable value.
- Check env precedence: `.env.local` overrides `.env`.
- Clear browser cookies for the app origin and sign in again.
