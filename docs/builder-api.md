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

## Complete device authorization (server-side)

`POST /api/v1/apps/{clientId}/device/approve`

- Authenticate with the same confidential client **Basic auth** (`client_id:client_secret`) as other Builder routes.
- Requires **`users:token`** or **`users:write`** in the client’s allowed scopes.
- Requires **Redirect device verification to initiate login URI** to be enabled for the app (same flag as OIDC third-party device login).
- JSON body (provide exactly one of `sub` or `externalUserId`):

```json
{
  "user_code": "ABCD-EFGH",
  "sub": "<PymtHouse account id: users.id or end_users.id>"
}
```

or

```json
{
  "user_code": "ABCD-EFGH",
  "externalUserId": "your-app-user-id"
}
```

When using `externalUserId`, the server resolves or creates the corresponding `end_users` row for your developer app (same mapping as token exchange). When using `sub`, that account must already exist in `users` or `end_users`.

The `user_code` must belong to the same `client_id` as the authenticated caller. Response: `{ "status": "authorized" }` on success.

## End-to-end flow (recommended)

1. Backend obtains machine token via `client_credentials`.
2. Backend creates or upserts external user mapping via `/users`.
3. Backend issues user-scoped JWT via `/users/{externalUserId}/token`.
4. Backend returns that JWT to the app session that represents the same external user.

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
- [`src/app/api/v1/apps/[id]/device/approve/route.ts`](../src/app/api/v1/apps/[id]/device/approve/route.ts)
- [`src/lib/auth.ts`](../src/lib/auth.ts) (`authenticateAppClient`, JWT auth parsing)
