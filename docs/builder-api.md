# Builder API (confidential clients)

This document defines the official PymtHouse Builder API for confidential OAuth clients. It covers machine authentication, end-user provisioning, and issuance of user-scoped JWTs to your backend.

The API follows OAuth 2.0 and OIDC conventions:
- OAuth 2.0 (RFC 6749) for token acquisition
- Bearer token usage (RFC 6750)
- JWT access tokens (RFC 9068)
- Token exchange for remote signer session flow (RFC 8693)
- Resource indicators (RFC 8707)

For issuer-level OIDC behavior and token endpoint details, see [NaaP OIDC integration](naap-oidc-integration.md).

## Identity model

- `client_id` is the canonical app identifier in Builder API URLs.
- Builder API paths use `/api/v1/apps/{clientId}/...`.
- Internal database IDs are implementation details and are not part of the public API contract.

## Authentication

### 1) Obtain machine token (client credentials grant)

Call the OIDC token endpoint:

```http
POST /api/v1/oidc/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&
client_id=<client_id>&
client_secret=<client_secret>&
scope=users:read users:write users:token
```

The requested `scope` must be a subset of the client's allowed scopes.

### 2) Call Builder API

Use either:

```http
Authorization: Bearer <access_token>
```

or confidential client Basic auth:

```http
Authorization: Basic base64(client_id:client_secret)
```

## User management endpoints

Base path: `/api/v1/apps/{clientId}/users`

| Method | Path | Required scope | Description |
|---|---|---|---|
| `GET` | `/api/v1/apps/{clientId}/users` | `users:read` | List provisioned users |
| `POST` | `/api/v1/apps/{clientId}/users` | `users:write` | Create/upsert user (`externalUserId` required) |
| `PUT` | `/api/v1/apps/{clientId}/users` | `users:write` | Update user attributes |
| `DELETE` | `/api/v1/apps/{clientId}/users?externalUserId=...` | `users:write` | Deactivate user (`status: inactive`) |

## Issue user-scoped JWT

`POST /api/v1/apps/{clientId}/users/{externalUserId}/token`

- Requires `users:token`.
- Optional JSON body:

```json
{ "scope": "sign:job" }
```

- Requested scope must be a subset of the calling client's allowed scopes.
- `admin` is explicitly rejected.
- Default scope (when omitted): `sign:job`.

## Complete device authorization (server-side, RFC 8693)

Use the **token endpoint** (`POST {issuer}/token`) with `grant_type=urn:ietf:params:oauth:grant-type:token-exchange` — not a separate Builder URL.

1. Mint a **user-scoped access token** (JWT) for the end user via `POST /api/v1/apps/{publicClientId}/users/{externalUserId}/token` (same as normal Builder flow; subject token must carry `client_id` = public `app_…`).
2. Call **`POST {issuer}/token`** with confidential **M2M Basic auth** (`m2m_…` client) and form body:

| Field | Value |
| --- | --- |
| `grant_type` | `urn:ietf:params:oauth:grant-type:token-exchange` |
| `subject_token` | JWT from step 1 |
| `subject_token_type` | `urn:ietf:params:oauth:token-type:access_token` |
| `resource` | `urn:pmth:device_code:<user_code>` (same code the CLI received; normalization matches `/oidc/device`) |

- M2M client must allow **`device:approve`** or **`users:token`**.
- **`subject_token`** must be a valid access token issued by this issuer to the **public** `app_…` client for that app (`client_id` / `azp` claim).
- The **public** OIDC client must have **Redirect device verification to initiate login URI** enabled (`device_third_party_initiate_login`).
- On success, the pending RFC 8628 device grant is bound; response follows RFC 8693 (`access_token`, `issued_token_type`, etc.). Implementation: [`src/lib/oidc/device-token-exchange.ts`](../src/lib/oidc/device-token-exchange.ts).

## End-to-end flow (recommended)

1. Backend obtains machine token via `client_credentials`.
2. Backend creates or upserts external user mapping via `/users`.
3. Backend issues user-scoped JWT via `/users/{externalUserId}/token`.
4. Backend returns that JWT to the app session that represents the same external user.

For **RFC 8628 device login** (after step 3), call **`POST {issuer}/token`** with RFC 8693 token exchange and `resource=urn:pmth:device_code:<user_code>` as described under “Complete device authorization” above.

## Security boundaries and privilege model

- Tenant boundary is enforced by `client_id` matching between route path and authenticated confidential client.
- User token scopes are bounded by the parent client's allowed scopes.
- `admin` escalation is blocked in user-token issuance path.
- Confidential secrets must stay server-side only.

## Example

```bash
CLIENT_ID="app_1234567890abcdef"
CLIENT_SECRET="pmth_cs_..."

curl -sS -u "${CLIENT_ID}:${CLIENT_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"externalUserId":"user-123","email":"a@example.com","status":"active"}' \
  "https://your-pymthouse.example/api/v1/apps/${CLIENT_ID}/users"
```

## Key design decisions and trade-offs

1. `client_id` is used as the external identifier to reduce API ambiguity and avoid ID translation in integrators.
2. Builder endpoints keep internal FK usage server-side to preserve relational integrity without exposing internal IDs.
3. User JWT issuance is explicit and scoped, preventing implicit privilege inheritance from machine tokens.
4. Basic auth remains supported for confidential server-to-server clients to simplify bootstrap and operational tooling.

## Implementation tasks

- Ensure each integrating app is registered as a confidential OIDC client.
- Grant only minimum scopes (`users:read`, `users:write`, `users:token`) needed per backend.
- Store and rotate client secrets via app credentials endpoint.
- Validate your backend maps one external user identifier to one Builder API user record.

## Implementation reference

- [`src/app/api/v1/apps/[id]/users/route.ts`](../src/app/api/v1/apps/[id]/users/route.ts)
- [`src/app/api/v1/apps/[id]/users/[externalUserId]/token/route.ts`](../src/app/api/v1/apps/[id]/users/[externalUserId]/token/route.ts)
- [`src/lib/oidc/device-token-exchange.ts`](../src/lib/oidc/device-token-exchange.ts)
- [`src/lib/auth.ts`](../src/lib/auth.ts) (`authenticateAppClient`, JWT auth parsing)
