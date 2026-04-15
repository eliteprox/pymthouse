# OIDC Integration with PymtHouse

PymtHouse exposes a standards-based OpenID Connect issuer under `/api/v1/oidc`. All clients are treated uniformly as registered application clients — there are no seeded first-party exceptions or privileged trust paths.

## Table of Contents

1. [Issuer and Discovery](#issuer-and-discovery)
2. [Supported Standards and Grants](#supported-standards-and-grants)
3. [Scope Reference](#scope-reference)
4. [Client Registration Model](#client-registration-model)
5. [Interactive Login (Authorization Code)](#interactive-login-authorization-code)
6. [Machine Access (Client Credentials)](#machine-access-client-credentials)
7. [Remote Signer Session Exchange (RFC 8693)](#remote-signer-session-exchange-rfc-8693)
8. [Per-User Billing Token Exchange (RFC 8693)](#per-user-billing-token-exchange-rfc-8693)
9. [Programmatic User Tokens](#programmatic-user-tokens)
10. [White-Label Branding and Custom Domains](#white-label-branding-and-custom-domains)
11. [Issuer Resolution and Multi-Tenancy](#issuer-resolution-and-multi-tenancy)
12. [Related Builder API](#related-builder-api)
13. [Key Design Decisions and Trade-offs](#key-design-decisions-and-trade-offs)
14. [Implementation Tasks](#implementation-tasks)
15. [Troubleshooting](#troubleshooting)

---

## Issuer and Discovery

| Endpoint | URL |
|---|---|
| Issuer (local default) | `http://localhost:3001/api/v1/oidc` |
| Discovery | `{issuer}/.well-known/openid-configuration` |
| JWKS | `{issuer}/jwks` |
| Authorization | `{issuer}/auth` |
| Token | `{issuer}/token` |
| UserInfo | `{issuer}/userinfo` |
| Device Authorization | `{issuer}/device/authorization` |

Always resolve endpoints via discovery metadata in production. Do not hard-code paths.

---

## Supported Standards and Grants

### Standards

- OAuth 2.0 Authorization Framework (RFC 6749)
- OAuth 2.0 Bearer Token Usage (RFC 6750)
- Proof Key for Code Exchange (RFC 7636) — required for public clients
- OAuth 2.0 Token Exchange (RFC 8693) — two distinct flows, see below
- OAuth 2.0 Resource Indicators (RFC 8707)
- JWT Profile for OAuth 2.0 Access Tokens (RFC 9068)
- OAuth 2.0 Device Authorization Grant (RFC 8628)

### Grants in use

| Grant | Use case |
|---|---|
| `authorization_code` | Interactive user login |
| `refresh_token` | Token rotation for interactive and programmatic sessions |
| `client_credentials` | Machine-to-machine access (Builder API authentication) |
| `urn:ietf:params:oauth:grant-type:token-exchange` | Remote signer session exchange **or** per-user billing exchange |

> **Important:** The token exchange grant serves two distinct flows distinguished by `subject_token_type`. See [Remote Signer Session Exchange](#remote-signer-session-exchange-rfc-8693) and [Per-User Billing Token Exchange](#per-user-billing-token-exchange-rfc-8693).

---

## Scope Reference

| Scope | Label | Description |
|---|---|---|
| `openid` | OpenID | Required. Identifies the PymtHouse account. |
| `sign:job` | Sign Jobs | Access all remote signer endpoints, including discovery and payment signing. |
| `users:read` | Read Users | Read provisioned app-managed users. |
| `users:write` | Write Users | Create, update, and deactivate app-managed users. |
| `users:token` | Issue User Tokens | Issue user-scoped access tokens for provider-managed backends. |
| `admin` | Admin | Administrative access to provider configuration surfaces. Blocked from user-token issuance paths. |

---

## Client Registration Model

- Clients are created and managed through app registration (dashboard or API).
- `npm run oidc:seed` initializes signing keys only; no clients are seeded.
- Each confidential client authenticates at the token endpoint using `client_id` + `client_secret`.
- `client_id` is the canonical external app identifier used across all Builder API paths.
- Apps must be in `approved` status for token exchange and marketplace access.

---

## Interactive Login (Authorization Code)

1. Redirect the user agent to `{issuer}/auth` with `response_type=code`, `client_id`, `redirect_uri`, `scope`, and `state`.
2. Exchange the code on your backend at `{issuer}/token` with `grant_type=authorization_code`, the same `redirect_uri`, `client_id`, and `client_secret`.
3. Request only the scopes your client is configured for.

**Public clients** must use PKCE (RFC 7636). **Confidential clients** must authenticate with their client secret at the token endpoint.

Apps with white-label branding configured will display a customized consent and login UI reflecting the app's `brandingLogoUrl`, `brandingPrimaryColor`, and `brandingSupportEmail`.

---

## Machine Access (Client Credentials)

Backend services obtain machine tokens via:

```http
POST {issuer}/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&
client_id=<client_id>&
client_secret=<client_secret>&
scope=users:read users:write users:token
```

The requested `scope` must be a subset of the client's configured allowed scopes. Machine tokens are used as the authentication mechanism for Builder API calls.

---

## Remote Signer Session Exchange (RFC 8693)

Exchanges a short-lived JWT access token for a long-lived opaque remote signer session token (`pmth_*`). This is the **gateway token exchange** flow.

```http
POST {issuer}/token
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:token-exchange&
subject_token_type=urn:ietf:params:oauth:token-type:access_token&
subject_token=<access_token>&
client_id=<client_id>&
client_secret=<client_secret>&
scope=sign:job
```

**Security constraints:**
- The authenticated `client_id` must match the `subject_token`'s audience or `azp` claim.
- The `subject_token` must already carry `sign:job` scope.
- Returns `issued_token_type: urn:ietf:params:oauth:token-type:access_token`.

**Implementation:**
- [`src/lib/oidc/gateway-token-exchange.ts`](../src/lib/oidc/gateway-token-exchange.ts)
- [`src/app/api/v1/oidc/[...oidc]/route.ts`](../src/app/api/v1/oidc/[...oidc]/route.ts)

---

## Per-User Billing Token Exchange (RFC 8693)

Exchanges a platform-issued JWT (from the integrating app's own identity system) for a PymtHouse access token bound to a specific end user. This enables **per-user billing** where each user's signer activity is tracked separately.

```http
POST {issuer}/token
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:token-exchange&
subject_token_type=urn:ietf:params:oauth:token-type:jwt&
subject_token=<platform_jwt>&
client_id=<client_id>&
client_secret=<client_secret>&
scope=sign:job
```

**Key distinction from the gateway exchange:** `subject_token_type` is `urn:ietf:params:oauth:token-type:jwt` (not `access_token`). This routes the request to the per-user billing handler.

### Prerequisites

The following must all be true before this exchange will succeed:

| Requirement | Where configured |
|---|---|
| App status is `approved` | Admin review |
| App `billingPattern` is `per_user` | App creation wizard → Billing Pattern step |
| App has a valid `jwksUri` configured | App creation wizard → Billing Pattern step |
| The client authenticates with a valid `client_secret` | App credentials |

### Flow

1. PymtHouse fetches and caches the JWKS from the app's configured `jwksUri`.
2. The `subject_token` is verified using the JWKS.
3. The `sub` claim of the verified JWT is used as the `externalUserId`.
4. PymtHouse upserts an end-user record (`findOrCreateAppEndUser`) binding the external user to the app.
5. A short-lived PymtHouse access token (1 hour) is issued with:
   - `sub`: internal end-user ID
   - `client_id`: the authenticated client
   - `scope`: intersection of requested scopes and client's allowed scopes (defaults to `sign:job`)
   - `token_exchange: true` marker claim

### Response

```json
{
  "access_token": "<pymthouse_jwt>",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "sign:job",
  "issued_token_type": "urn:ietf:params:oauth:token-type:access_token"
}
```

**Implementation:**
- [`src/lib/oidc/token-exchange.ts`](../src/lib/oidc/token-exchange.ts)
- [`src/lib/oidc/jwks-fetch.ts`](../src/lib/oidc/jwks-fetch.ts)
- [`src/lib/billing.ts`](../src/lib/billing.ts) (`findOrCreateAppEndUser`)

---

## Programmatic User Tokens

For apps with `per_user` billing, backends can issue user-scoped JWTs directly via the Builder API without requiring the user to complete an interactive login. This is the preferred path when the integrating app already has an authenticated session for the user.

Tokens issued programmatically carry a `user_type: "app_user"` claim and include a refresh token valid for 30 days. Refresh tokens are rotated on each use (consume-and-reissue).

**Token lifetimes:**
- Access token: 15 minutes
- Refresh token: 30 days (rotating)

See [Builder API — Issue User-Scoped JWT](builder-api.md#issue-user-scoped-jwt) for the full endpoint reference.

**Implementation:**
- [`src/lib/oidc/programmatic-tokens.ts`](../src/lib/oidc/programmatic-tokens.ts)

---

## White-Label Branding and Custom Domains

Apps can customize the OIDC consent, device verification, and login UI by configuring branding fields through the app settings:

| Field | Purpose |
|---|---|
| `brandingMode` | `"default"` or `"custom"` |
| `brandingLogoUrl` | Logo displayed on consent/login screens |
| `brandingPrimaryColor` | Accent color for buttons and highlights |
| `brandingSupportEmail` | Contact email shown to users |

Branding is resolved at request time from the `developerApps` record associated with the authenticated `client_id`. The `branded-layout` component renders this context on OIDC-facing pages.

### Custom Domains

Apps may configure a custom domain for their OIDC-facing flows. DNS verification is required before a custom domain can be activated. Once enabled, OIDC consent and login pages are served from the custom domain origin.

> **Note:** Custom per-tenant issuer URLs (`customIssuerUrl`) are stored in the schema but not yet active — `canEnableCustomIssuer` returns `allowed: false` pending a future release. The canonical issuer remains `{PUBLIC_URL}/api/v1/oidc` for all apps.

**Implementation:**
- [`src/lib/oidc/branding.ts`](../src/lib/oidc/branding.ts)
- [`src/lib/oidc/custom-domains.ts`](../src/lib/oidc/custom-domains.ts)
- [`src/lib/oidc/host-resolution.ts`](../src/lib/oidc/host-resolution.ts)
- [`src/components/oidc/branded-layout.tsx`](../src/components/oidc/branded-layout.tsx)

---

## Issuer Resolution and Multi-Tenancy

All tokens are issued by the canonical issuer derived from `PUBLIC_URL`:

```
{PUBLIC_URL}/api/v1/oidc
```

The `resolveIssuerForApp` function looks up whether an app has a `customIssuerUrl` configured, but multi-tenant per-app issuers are not yet active. All production integrations should use the discovery document to obtain the issuer and never hard-code it.

```typescript
// issuer-resolution.ts — safe helper for token validation
export function getIssuerForTokenValidation(): string {
  return getCanonicalIssuer();
}
```

**Implementation:**
- [`src/lib/oidc/issuer-resolution.ts`](../src/lib/oidc/issuer-resolution.ts)

---

## Related Builder API

For app-user provisioning, API key management, subscription plans, and user-scoped token issuance, use the Builder API:

- [`docs/builder-api.md`](builder-api.md)

Builder API paths use `client_id` as the canonical app identifier:

| Path | Description |
|---|---|
| `/api/v1/apps/{clientId}/users` | Provision and manage app users |
| `/api/v1/apps/{clientId}/users/{externalUserId}/token` | Issue user-scoped JWT |
| `/api/v1/apps/{clientId}/keys` | Issue and revoke API keys |
| `/api/v1/apps/{clientId}/plans` | Manage subscription plans |
| `/api/v1/apps/{clientId}/usage` | Query usage records (per-user breakdown available) |

---

## Key Design Decisions and Trade-offs

1. **Uniform client registration** — all clients use one registration model to eliminate special-case trust paths and ensure consistent audit trails.

2. **`client_id` as the external identifier** — using `client_id` in Builder API URLs avoids ambiguous `appId` mappings and removes the need for ID translation in integrator backends.

3. **Two distinct token exchange paths under one grant** — the RFC 8693 grant type is dispatched by `subject_token_type`: `access_token` routes to the gateway signer session exchange; `jwt` routes to the per-user billing exchange. This keeps the token endpoint standard-compliant while supporting both flows.

4. **JWKS caching for external JWT verification** — the per-user billing exchange fetches and caches the app's `jwksUri` rather than trusting the token directly. This keeps PymtHouse decoupled from the integrator's identity system while providing cryptographic assurance.

5. **Rotating refresh tokens for programmatic sessions** — programmatic user tokens use consume-and-reissue refresh token rotation, limiting the blast radius of a compromised refresh token to a single rotation window.

6. **App approval gate on token exchange** — the `approved` status requirement on token exchange prevents unapproved apps from accessing user billing flows, ensuring admin oversight before an app can bill per-user activity.

7. **Branding resolved at request time** — branding is not baked into tokens or cached in middleware; it is resolved per-request from the database to ensure changes take effect immediately without a deployment.

8. **Internal FK isolation** — internal database primary keys are not exposed in any external API contract. `client_id` is the sole external identifier, preserving the ability to migrate internal storage without breaking integrator contracts.

---

## Implementation Tasks

- [ ] Register each integrating app as a confidential OIDC client via the dashboard before requesting tokens.
- [ ] For per-user billing apps, configure `billingPattern: per_user` and a valid `jwksUri` during app registration.
- [ ] Ensure your platform JWTs include a `sub` claim that stably identifies the user across sessions.
- [ ] Use discovery metadata (`/.well-known/openid-configuration`) in all clients — do not hard-code endpoint paths.
- [ ] Rotate confidential client secrets via the app credentials endpoint on a regular schedule.
- [ ] Migrate any remaining integrations away from the deleted legacy `/api/v1/naap/*` routes to OIDC token endpoints and Builder API routes.
- [ ] Validate that your JWKS endpoint is publicly reachable from the PymtHouse deployment origin.
- [ ] For interactive flows, verify that your `redirect_uri` values are registered on the OIDC client before going to production.
- [ ] If using white-label branding, complete DNS verification before enabling a custom domain.

---

## Troubleshooting

### `JWT_SESSION_ERROR` / `JWEDecryptionFailed` in logs

- Ensure `NEXTAUTH_SECRET` is stable across restarts and not overridden by conflicting `.env` files.
- Clear browser cookies for the app origin and sign in again.
- See [`src/lib/next-auth-secret.ts`](../src/lib/next-auth-secret.ts) for secret validation logic.

### Token exchange returns `invalid_client`

- Confirm the app status is `approved` in the admin review panel.
- Confirm `client_id` and `client_secret` are correct and not rotated.

### Token exchange returns `invalid_request` with "per_user billing" message

- The app must have `billingPattern` set to `per_user`. App-level billing apps cannot use the per-user token exchange path.

### Token exchange returns `invalid_request` with JWKS fetch failure

- Verify the `jwksUri` configured on the app is publicly reachable and returns a valid JWK Set.
- Check for firewall or DNS resolution issues between the PymtHouse deployment and the JWKS host.

### `invalid_grant` — subject token verification failed

- Confirm the `subject_token` is signed by a key present in the JWKS at the app's `jwksUri`.
- Check that the JWT has not expired (`exp` claim) and that clock skew between issuer and PymtHouse is within tolerance.
