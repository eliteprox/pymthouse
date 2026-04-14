# Builder / tenant HTTP API (developer apps)

These routes manage **provisioned end users** for a **developer app** registered in PymtHouse (`developer_apps`). They are **not** the NaaP platform OIDC clients; see [NaaP OIDC integration](naap-oidc-integration.md) for `naap-web` / `naap-service`.

## Authentication

First obtain an access token via **OAuth 2.0 Client Credentials** (`POST /api/v1/oidc/token`) using `client_id` and `client_secret`. The token must include the `users:token` scope (for issuing end-user tokens) or `users:read`/`users:write` as needed.

Then use **Bearer** authentication on builder API calls:

```http
Authorization: Bearer <access_token>
```

Alternatively, you can use **HTTP Basic** authentication directly:

```http
Authorization: Basic base64(client_id:client_secret)
```

`client_id` / `client_secret` are the OIDC credentials for the **developer app** (from the dashboard or credentials API), **not** the NaaP service client.

## App identifier in URLs

`{appId}` is the **internal UUID** of the developer app (`developer_apps.id`), **not** the OIDC `client_id` string (e.g. `app_…`).

## Endpoints

Base path: `/api/v1/apps/{appId}/users`

| Method | Path | Required scope | Description |
|--------|------|----------------|-------------|
| `GET` | `/api/v1/apps/{appId}/users` | `users:read` | List provisioned users |
| `POST` | `/api/v1/apps/{appId}/users` | `users:write` | Create or upsert user (`externalUserId` required) |
| `PUT` | `/api/v1/apps/{appId}/users` | `users:write` | Update existing user |
| `DELETE` | `/api/v1/apps/{appId}/users?externalUserId=…` | `users:write` | Deactivate user (`status: inactive`) |

### Issue tokens for a provisioned user

`POST /api/v1/apps/{appId}/users/{externalUserId}/token`

- Auth: same Basic app credentials.
- OIDC access token on the app must include **`users:token`** (e.g. from `client_credentials` with that scope).
- Body (JSON, optional): `{ "scope": "sign:job discover:orchestrators" }` — must be a subset of the client’s allowed scopes; cannot request `admin`.

Default scopes when `scope` is omitted: `sign:job discover:orchestrators` (see implementation).

## Example: create user

```bash
APP_ID="<developer_apps.uuid>"
curl -sS -u "${CLIENT_ID}:${CLIENT_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"externalUserId":"user-123","email":"a@example.com","status":"active"}' \
  "https://your-pymthouse.example/api/v1/apps/${APP_ID}/users"
```

## Implementation reference

- [`src/app/api/v1/apps/[id]/users/route.ts`](../src/app/api/v1/apps/[id]/users/route.ts)
- [`src/app/api/v1/apps/[id]/users/[externalUserId]/token/route.ts`](../src/app/api/v1/apps/[id]/users/[externalUserId]/token/route.ts)
- [`src/lib/auth.ts`](../src/lib/auth.ts) — `authenticateAppClient`
