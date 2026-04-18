# PymtHouse Builder API — developer guide

This document is the single reference for integrating applications with PymtHouse using the **Builder API** (REST), the **Usage API**, and the **OIDC issuer**. Together they form the “Builder” product surface for provisioning users, issuing tokens, completing device login, and reading metered usage.

**Conventions used throughout**

- **`client_id`** — Canonical OAuth application identifier in URL paths (`/api/v1/apps/{clientId}/...`). Internal database IDs are not part of the public contract.
- **Standards** — OAuth 2.0 (RFC 6749), Bearer tokens (RFC 6750), JWT access tokens (RFC 9068), PKCE (RFC 7636), token exchange (RFC 8693), resource indicators (RFC 8707).

---

## Table of contents

1. [Architecture overview](#architecture-overview)
2. [OIDC issuer](#oidc-issuer)
3. [Authentication for Builder and Usage APIs](#authentication-for-builder-and-usage-apis)
4. [User management](#user-management)
5. [Issue user-scoped JWT](#issue-user-scoped-jwt)
6. [Complete device authorization (RFC 8628 + RFC 8693)](#complete-device-authorization-rfc-8628--rfc-8693)
7. [Remote signer session exchange (RFC 8693)](#remote-signer-session-exchange-rfc-8693)
8. [Interactive login and machine access](#interactive-login-and-machine-access)
9. [Usage API](#usage-api)
10. [End-to-end integration flows](#end-to-end-integration-flows)
11. [Security boundaries and privilege model](#security-boundaries-and-privilege-model)
12. [Implementation checklist](#implementation-checklist)
13. [Implementation reference](#implementation-reference)
14. [Design notes](#design-notes)
15. [Troubleshooting](#troubleshooting)

---

## Architecture overview

PymtHouse exposes:

| Surface | Base path | Role |
| --- | --- | --- |
| **OIDC issuer** | `/api/v1/oidc` | Discovery, authorization, token, JWKS, device flow, session end |
| **Builder API** | `/api/v1/apps/{clientId}/users` | Provision users and mint user-scoped JWTs (confidential clients) |
| **Usage API** | `/api/v1/apps/{clientId}/usage` | Aggregated request counts and fees (read-only) |

Use **discovery** in production so paths stay aligned with the deployment:

`{issuer}/.well-known/openid-configuration`

**Two clients per interactive app.** Apps that need a public client (browser, SDK, RFC 8628 device flow) *and* a confidential backend (Builder routes, RFC 8693 device approval) typically register **two** OIDC clients for one developer app: a primary public `app_…` client and an optional confidential **`m2m_…`** sibling (`developer_apps.m2m_oidc_client_id`). Generating a secret on the public client breaks device login; secrets belong only on the M2M client.

Clients are created through app registration (dashboard/API). `npm run oidc:seed` initializes signing keys only.

### API surfaces (at a glance)

```mermaid
flowchart TB
  subgraph callers["Integrator side"]
    direction TB
    BE["Backend service<br/>(Bearer or Basic, confidential)"]
    UA["Browser, CLI, or SDK<br/>(public client, PKCE / device codes)"]
  end
  subgraph ph["PymtHouse"]
    direction TB
    OIDC["OIDC issuer<br/>/api/v1/oidc"]
    BLDR["Builder API<br/>/api/v1/apps/.../users"]
    USE["Usage API<br/>/api/v1/apps/.../usage"]
  end
  UA --> OIDC
  BE --> OIDC
  BE --> BLDR
  BE --> USE
```

---

## OIDC issuer

### Issuer and discovery

- **Issuer (local default):** `http://localhost:3001/api/v1/oidc`
- **Discovery:** `{issuer}/.well-known/openid-configuration`
- **JWKS:** `{issuer}/jwks`
- **Authorization:** `{issuer}/auth`
- **Token:** `{issuer}/token`
- **UserInfo:** `{issuer}/me` (when enabled)
- **RP-initiated logout:** discovery advertises `end_session_endpoint` (`{issuer}/session/end`); use registered **`post_logout_redirect_uris`**

All clients are registered application clients (no special first-party exceptions).

### Supported grants

| Grant | Typical use |
| --- | --- |
| `authorization_code` | Interactive login |
| `refresh_token` | Token rotation |
| `client_credentials` | Machine-to-machine |
| `urn:ietf:params:oauth:grant-type:token-exchange` | Device approval binding, remote signer session, app token exchange |
| Device code (RFC 8628) | CLI / limited-input devices |

### Client authentication

- **Confidential clients** authenticate at the token endpoint with `client_id` + `client_secret`.
- **Public clients** use `token_endpoint_auth_method: none` and PKCE where required.

Requested scopes must be a subset of each client’s configured scope policy.

---

## Authentication for Builder and Usage APIs

Tenant boundary: the path **`clientId`** must match the authenticated app (public `app_…` id for Builder user routes — see implementation).

### 1) Machine token (client credentials)

Call the OIDC token endpoint:

```http
POST /api/v1/oidc/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&
client_id=<client_id>&
client_secret=<client_secret>&
scope=users:read users:write users:token
```

Or equivalently: `POST {issuer}/token` with the same body (issuer includes `/api/v1/oidc`).

### 2) Calling Builder and Usage routes

Use either:

```http
Authorization: Bearer <access_token>
```

or confidential **HTTP Basic** auth:

```http
Authorization: Basic base64(client_id:client_secret)
```

**Usage API:** Basic auth (or an authorized provider dashboard session — see [Usage API](#usage-api)) is typical; no extra OAuth scope is required beyond valid credentials for that app.

---

## User management

**Base path:** `/api/v1/apps/{clientId}/users`

| Method | Path | Required scope | Description |
| --- | --- | --- | --- |
| `GET` | `/api/v1/apps/{clientId}/users` | `users:read` | List provisioned users |
| `POST` | `/api/v1/apps/{clientId}/users` | `users:write` | Create/upsert user (`externalUserId` required) |
| `PUT` | `/api/v1/apps/{clientId}/users` | `users:write` | Update user attributes |
| `DELETE` | `/api/v1/apps/{clientId}/users?externalUserId=...` | `users:write` | Deactivate user (`status: inactive`) |

---

## Issue user-scoped JWT

`POST /api/v1/apps/{clientId}/users/{externalUserId}/token`

- Requires **`users:token`** on the calling client.
- Optional JSON body:

```json
{ "scope": "sign:job" }
```

- Requested scope must be a subset of the **public app client’s** allowed scopes (see product-specific validation in code).
- `admin` is explicitly rejected.
- Default scope when omitted: `sign:job`.

---

## Complete device authorization (RFC 8628 + RFC 8693)

Device login uses the **OIDC token endpoint** `POST {issuer}/token` with `grant_type=urn:ietf:params:oauth:grant-type:token-exchange` — not a separate Builder URL.

### Verification URLs

For device code clients, `/device/auth` responses use:

- **`verification_uri`** — Short URL: `{public origin}/oidc/device`
- **`verification_uri_complete`** — Includes `user_code`, `client_id`, and `iss` so the browser can resume without retyping the code

Unauthenticated users may be redirected once to your registered **`initiate_login_uri`** (third-party initiate login) when the app opts in. The redirect target is loaded **from the database for `client_id`** (open-redirect safe).

**Opt-in:** Enable **Redirect device verification to initiate login URI** and set **Initiate login URI** to your HTTPS endpoint that accepts `iss`, `target_link_uri`, and optional `login_hint`. Validate `iss` against discovery and validate `target_link_uri`. **Option B (NaaP):** after login, mint a user JWT via Builder, then call `POST {issuer}/token` with token exchange and `resource=urn:pmth:device_code:<user_code>` (M2M Basic auth), and show `/oidc/device-approved` instead of sending the browser back to `target_link_uri`.

Treat `initiate_login_uri` as a sensitive redirect (HTTPS in production; HTTP on localhost in dev). Avoid open redirects; use CSRF protection on forms that start login.

### Server-side completion (RFC 8693)

1. Mint a **user-scoped access token** (JWT) via `POST /api/v1/apps/{publicClientId}/users/{externalUserId}/token` (subject token must be issued to the **public** `app_…` client).
2. Call **`POST {issuer}/token`** with confidential **M2M Basic auth** (`m2m_…` client) and form body:

| Field | Value |
| --- | --- |
| `grant_type` | `urn:ietf:params:oauth:grant-type:token-exchange` |
| `subject_token` | JWT from step 1 |
| `subject_token_type` | `urn:ietf:params:oauth:token-type:access_token` |
| `resource` | `urn:pmth:device_code:<user_code>` (same code the CLI received; normalization matches `/oidc/device`) |

- M2M client must allow **`device:approve`** or **`users:token`**.
- **`subject_token`** must be a valid access token issued by this issuer to the **public** `app_…` client (`client_id` / `azp`).
- The **public** OIDC client must have **Redirect device verification to initiate login URI** enabled (`device_third_party_initiate_login`) where required.
- On success, the pending RFC 8628 device grant is bound; the response follows RFC 8693 (`access_token`, `issued_token_type`, etc.).

**End-to-end device login** (high level):

```mermaid
sequenceDiagram
  autonumber
  participant Dev as CLI or device
  participant Tok as Issuer POST /token
  participant Br as Browser
  participant IdP as Your login / session
  participant Bld as Builder API
  participant M2M as Your backend M2M

  Dev->>Tok: Device authorization (RFC 8628)<br/>public app client_id
  Tok-->>Dev: device_code, user_code, verification URIs
  Br->>Tok: User opens verification UI
  Note over Br,IdP: Optional third-party initiate_login to your IdP
  IdP->>M2M: User authenticated
  M2M->>Bld: Mint user JWT for end user<br/>Basic m2m credentials
  Bld-->>M2M: Access JWT (audience = public app_)
  M2M->>Tok: Token exchange RFC 8693<br/>resource = urn:pmth:device_code:...<br/>Basic m2m credentials
  Note right of Tok: Binds pending device grant
  Tok-->>M2M: 200 RFC 8693 response
  Dev->>Tok: Poll with device_code
  Tok-->>Dev: End-user tokens for device session
```

**Token-exchange step only** (what most server integrations implement after minting `USER_JWT`):

```mermaid
sequenceDiagram
  autonumber
  participant M2M as M2M client
  participant Tok as Issuer POST /token

  M2M->>Tok: grant_type=token-exchange
  Note right of M2M: Authorization Basic<br/>client_id:client_secret = m2m_:secret
  Note right of M2M: subject_token = user JWT from Builder<br/>subject_token_type = access_token<br/>resource = urn:pmth:device_code:USERCODE
  Tok-->>M2M: access_token, issued_token_type, ...<br/>device grant bound as side effect
```

Example (after minting `USER_JWT` via Builder):

```bash
ISSUER="https://your-pymthouse.example/api/v1/oidc"
M2M_ID="m2m_..."
M2M_SECRET="pmth_cs_..."
USER_JWT="eyJ..."   # access_token from Builder user-token step (sign:job)

curl -sS -u "${M2M_ID}:${M2M_SECRET}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  --data-urlencode "subject_token=${USER_JWT}" \
  --data-urlencode "subject_token_type=urn:ietf:params:oauth:token-type:access_token" \
  --data-urlencode "resource=urn:pmth:device_code:ABCD-EFGH" \
  "${ISSUER}/token"
```

**Implied consent:** For confidential clients with third-party device login enabled, when the user opens the verification UI with a **prefilled** `user_code` from `verification_uri_complete`, the secondary “Authorize” step may be skipped after a successful lookup (the user still authenticated at your site or the OP).

---

## Remote signer session exchange (RFC 8693)

Exchange a short-lived access token for a long-lived opaque remote signer session token (`pmth_*`):

```http
POST {issuer}/token
grant_type=urn:ietf:params:oauth:grant-type:token-exchange
subject_token_type=urn:ietf:params:oauth:token-type:access_token
subject_token=<access_token>
scope=sign:job
```

**Constraints:**

- The authenticated `client_id` must match the `subject_token` audience / client binding (`client_id` or `azp`).
- The `subject_token` must already include `sign:job` scope.

```mermaid
sequenceDiagram
  autonumber
  participant Cli as OAuth client
  participant Tok as Issuer POST /token

  Cli->>Tok: grant_type=token-exchange<br/>subject_token = short-lived access JWT
  Note right of Cli: Same client_id/azp as subject JWT
  Tok-->>Cli: Remote signer session token pmth_*
```

---

## Interactive login and machine access

### Authorization code (interactive)

1. Redirect the user to `{issuer}/auth` with `response_type=code`, `client_id`, `redirect_uri`, `scope`, `state`.
2. Exchange the code at `{issuer}/token` with `grant_type=authorization_code`, the same `redirect_uri`, and `client_id` + `client_secret` for confidential clients.
3. Request only scopes allowed for that client. **Public clients:** PKCE is required. **Confidential clients:** client authentication is required.

### Client credentials (machine)

```http
POST {issuer}/token
grant_type=client_credentials
client_id=...
client_secret=...
scope=...
```

---

## Usage API

Aggregated request and fee usage for a developer application — read-only, tenant-scoped, for billing dashboards and analytics. It follows the same **`client_id`** path convention as the Builder API.

**Endpoint:** `GET /api/v1/apps/{clientId}/usage`

### Identity model

- **`clientId`** in the path is the OAuth `client_id` of the developer app.
- Per-user breakdowns include internal **`endUserId`** (PymtHouse UUID) and the builder’s **`externalUserId`** for correlation.

### Authentication

| Mode | Description |
| --- | --- |
| **Confidential client (recommended)** | `Authorization: Basic base64(client_id:client_secret)` — same credentials as other server-to-server calls |
| **Provider session** | Logged-in app owner, platform admin, or team member with `providerAdmins` access — powers the in-app dashboard |

Requests that fail auth or tenant match receive **`404 Not Found`** (not `401`/`403`) to avoid leaking whether a `client_id` exists.

### Query parameters (all optional)

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `startDate` | ISO 8601 | — | Inclusive lower bound on `usage_records.created_at` |
| `endDate` | ISO 8601 | — | Inclusive upper bound |
| `groupBy` | `none` \| `user` | `none` | `user` adds a `byUser` array |
| `userId` | string | — | Filter to one internal **`endUserId`** (not `externalUserId`) |

Invalid dates return `400 Bad Request`. Resolve `externalUserId` → internal id via the Builder user listing or a prior `groupBy=user` response.

### Response shape (`200 OK`)

```json
{
  "clientId": "app_f4c21e7ac5f35d3e91bfad7f",
  "period": {
    "start": "2026-01-01T00:00:00.000Z",
    "end":   "2026-12-31T23:59:59.999Z"
  },
  "totals": {
    "requestCount": 1423,
    "totalFeeWei":  "128750000000000000"
  },
  "byUser": [
    {
      "endUserId":      "5d2b...-uuid",
      "externalUserId": "user-123",
      "requestCount":   42,
      "feeWei":         "3750000000000000"
    }
  ]
}
```

- **`totalFeeWei`** and **`feeWei`** are **decimal strings of wei** (use BigInt-safe parsing; they may exceed `Number.MAX_SAFE_INTEGER`).
- **`byUser`** appears only when `groupBy=user`. Records with no user roll up under `endUserId: "unknown"` and `externalUserId: null`.

### Usage examples

```bash
export BASE_URL="http://localhost:3001"
export CLIENT_ID="app_yourClientId"
export CLIENT_SECRET="pmth_cs_yourSecret"
```

App-level totals:

```bash
curl -sS -u "${CLIENT_ID}:${CLIENT_SECRET}" \
  "${BASE_URL}/api/v1/apps/${CLIENT_ID}/usage"
```

Per-user breakdown:

```bash
curl -sS -u "${CLIENT_ID}:${CLIENT_SECRET}" \
  "${BASE_URL}/api/v1/apps/${CLIENT_ID}/usage?groupBy=user"
```

Date window:

```bash
curl -sS -u "${CLIENT_ID}:${CLIENT_SECRET}" \
  "${BASE_URL}/api/v1/apps/${CLIENT_ID}/usage?startDate=2026-01-01T00:00:00.000Z&endDate=2026-12-31T23:59:59.999Z"
```

Filter by internal user id:

```bash
export USER_ID="internal-app-user-uuid"

curl -sS -u "${CLIENT_ID}:${CLIENT_SECRET}" \
  "${BASE_URL}/api/v1/apps/${CLIENT_ID}/usage?userId=${USER_ID}"
```

**Security:** Do not call the Usage API from a browser with Basic auth; keep secrets server-side.

### Usage data model (`usage_records`)

| Column | Meaning |
| --- | --- |
| `user_id` | Internal `endUserId`; `null` if unattributed |
| `fee` | Wei as decimal string; summed into responses |
| `created_at` | Used for `startDate` / `endDate` filters |

---

## End-to-end integration flows

### Recommended backend flow

1. Backend obtains a machine token via `client_credentials`.
2. Backend creates or upserts the external user via `/users`.
3. Backend issues a user-scoped JWT via `/users/{externalUserId}/token`.
4. Backend returns that JWT to the app session for the same external user.

```mermaid
flowchart LR
  A["1. client_credentials"] --> B["2. POST .../users"]
  B --> C["3. POST .../users/.../token"]
  C --> D["4. Deliver JWT to app session"]
```

For **RFC 8628 device login**, after step 3 call **`POST {issuer}/token`** with RFC 8693 token exchange and `resource=urn:pmth:device_code:<user_code>` as described in [Complete device authorization](#complete-device-authorization-rfc-8628--rfc-8693).

### Example (upsert user)

```bash
CLIENT_ID="app_1234567890abcdef"
CLIENT_SECRET="pmth_cs_..."

curl -sS -u "${CLIENT_ID}:${CLIENT_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"externalUserId":"user-123","email":"a@example.com","status":"active"}' \
  "https://your-pymthouse.example/api/v1/apps/${CLIENT_ID}/users"
```

---

## Security boundaries and privilege model

- **Tenant boundary** is enforced by matching `client_id` between the route path and the authenticated confidential client (and related checks in code).
- **User token scopes** are bounded by the parent app’s allowed scopes; **`admin`** escalation is blocked on user-token issuance.
- **Usage API:** tenant isolation and `404` behavior reduce enumeration of valid apps.
- **Confidential secrets** must remain server-side only.

---

## Implementation checklist

- Register each integrating app as an OIDC client; use discovery metadata rather than hard-coded paths.
- Grant minimum scopes (`users:read`, `users:write`, `users:token`, etc.) per backend.
- Store and rotate client secrets via the app credentials endpoint (`/api/v1/apps/{clientId}/credentials`).
- Map one external user identifier to one Builder API user record.
- Migrate away from legacy `/api/v1/naap/*` routes to OIDC + Builder APIs.
- For usage attribution, populate `usage_records.user_id` when a request maps to a provisioned user; store fees as decimal wei strings.
- Ensure `(client_id, request_id)` uniqueness for usage rows where applicable.

---

## Implementation reference

**Builder and users**

- [`src/app/api/v1/apps/[id]/users/route.ts`](../src/app/api/v1/apps/[id]/users/route.ts)
- [`src/app/api/v1/apps/[id]/users/[externalUserId]/token/route.ts`](../src/app/api/v1/apps/[id]/users/[externalUserId]/token/route.ts)

**OIDC and token exchange**

- [`src/app/api/v1/oidc/[...oidc]/route.ts`](../src/app/api/v1/oidc/[...oidc]/route.ts)
- [`src/lib/oidc/device-token-exchange.ts`](../src/lib/oidc/device-token-exchange.ts)
- [`src/lib/oidc/gateway-token-exchange.ts`](../src/lib/oidc/gateway-token-exchange.ts)

**Auth and usage**

- [`src/lib/auth.ts`](../src/lib/auth.ts) (`authenticateAppClient`, JWT parsing)
- [`src/app/api/v1/apps/[id]/usage/route.ts`](../src/app/api/v1/apps/[id]/usage/route.ts)
- [`src/lib/provider-apps.ts`](../src/lib/provider-apps.ts) (`getAuthorizedProviderApp`, `getProviderApp`)
- [`src/db/schema.ts`](../src/db/schema.ts) (`usageRecords`, `appUsers`)

---

## Design notes

1. **`client_id` as the external app identifier** reduces ambiguity and avoids exposing internal foreign keys.
2. **Builder endpoints** keep internal FK usage server-side for relational integrity.
3. **User JWT issuance** is explicit and scoped — machine tokens do not implicitly inherit end-user privileges.
4. **Basic auth** remains supported for confidential server-to-server clients.
5. **OIDC** uses one registration model for all clients to avoid special-case trust paths.
6. **RFC 8693** preserves auditable token transitions for device binding and remote signer sessions.
7. **Usage totals** use wei strings to avoid JSON precision loss; **404** on usage routes limits information leakage.

---

## Troubleshooting

### NextAuth session decrypt errors

If logs show repeated `JWT_SESSION_ERROR` or `JWEDecryptionFailed`:

- Keep `NEXTAUTH_SECRET` stable.
- Ensure `.env.local` is not unintentionally overriding `.env`.
- Clear browser cookies for the app origin and sign in again.
