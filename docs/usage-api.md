# Usage API

This document specifies the PymtHouse Usage API, which exposes aggregated request and fee usage for a developer application. It is a read-only, tenant-scoped endpoint intended for billing dashboards, cost analytics, and per-user attribution.

The API follows the same conventions as the [Builder API](builder-api.md):
- OAuth 2.0 client credentials (RFC 6749) for machine authentication
- HTTP Basic auth for confidential clients (RFC 7617)
- `client_id` as the canonical tenant identifier in the URL path

## Identity model

- `client_id` is the canonical app identifier in Usage API URLs.
- Path uses `/api/v1/apps/{clientId}/usage`.
- Per-user breakdowns return the internal `endUserId` (PymtHouse-assigned UUID) alongside the app's own `externalUserId` for correlation to the builder's user system.
- Internal database IDs for the app record itself are never exposed.

## Authentication

Two auth modes are accepted. The tenant boundary (path `clientId` must match the authenticated principal's app) is enforced in both cases.

### 1) Confidential client (recommended for server-to-server)

HTTP Basic auth with the OAuth client credentials:

```http
GET /api/v1/apps/{clientId}/usage HTTP/1.1
Authorization: Basic base64(client_id:client_secret)
```

No additional scope is required beyond possessing valid client credentials; the endpoint only returns data for the authenticated client's own app.

### 2) Provider session (dashboard)

A logged-in provider session whose user is the app's owner, a platform admin, or a team member with a `providerAdmins` row for the app may call the endpoint without Basic auth. This is what powers the in-app usage dashboard.

Requests that satisfy neither auth mode (or whose authenticated principal does not match the path `clientId`) receive `404 Not Found`. The endpoint deliberately does not distinguish "unauthenticated" from "not found" to avoid leaking app existence.

## Endpoint

```http
GET /api/v1/apps/{clientId}/usage
```

### Path parameters

| Name | Type | Description |
|---|---|---|
| `clientId` | string | OAuth `client_id` of the developer app. Must match the authenticated client. |

### Query parameters

All query parameters are optional.

| Name | Type | Default | Description |
|---|---|---|---|
| `startDate` | ISO 8601 timestamp | — | Inclusive lower bound on `usage_records.created_at`. |
| `endDate` | ISO 8601 timestamp | — | Inclusive upper bound on `usage_records.created_at`. |
| `groupBy` | `none` \| `user` | `none` | When `user`, response includes a `byUser` array keyed by internal `endUserId`. |
| `userId` | string | — | Internal `endUserId` filter. Restricts the result to a single provisioned app user. |

Date values are validated with `Date.parse`. Strings such as `2026-01-01T00:00:00.000Z` or `2026-01-01` are accepted; anything `Date.parse` rejects returns `400 Bad Request`.

Note that `userId` takes the internal PymtHouse user id (`endUserId`), not the builder's `externalUserId`. The typical flow is: list users via the Builder API, or call once with `groupBy=user` and take `byUser[].endUserId`.

## Response

### 200 OK

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

Fields:

| Field | Type | Description |
|---|---|---|
| `clientId` | string | Echo of the path `clientId`. |
| `period.start` | string \| null | Echo of the `startDate` query parameter, or `null` if omitted. |
| `period.end` | string \| null | Echo of the `endDate` query parameter, or `null` if omitted. |
| `totals.requestCount` | integer | Number of `usage_records` rows matching the filter. |
| `totals.totalFeeWei` | string | Sum of `usage_records.fee` over matching rows, as a base-10 string of wei. |
| `byUser` | array | Present only when `groupBy=user`. One entry per distinct `userId` (records with no `userId` roll up under the synthetic key `"unknown"` and have `externalUserId: null`). |
| `byUser[].endUserId` | string | Internal PymtHouse user id, or `"unknown"` for unattributed records. |
| `byUser[].externalUserId` | string \| null | Builder-supplied identifier from `app_users.external_user_id`, when resolvable. |
| `byUser[].requestCount` | integer | Number of records attributed to this user. |
| `byUser[].feeWei` | string | Sum of `fee` for this user, as a base-10 string of wei. |

Monetary totals are encoded as **decimal strings of wei**, not numbers. They can exceed `Number.MAX_SAFE_INTEGER` and must be parsed with a BigInt-capable library. This matches the on-chain unit used in `usage_records.fee`.

### Error responses

| Status | Condition |
|---|---|
| `400 Bad Request` | `startDate` or `endDate` is not parseable by `Date.parse`. |
| `404 Not Found` | No authenticated principal, credentials valid but for a different app, or `clientId` does not resolve to a known app. |

## Examples

Set `BASE_URL` to your deployment (`http://localhost:3001` in development, since `next dev` is configured for port 3001), and export the confidential client credentials:

```bash
export BASE_URL="http://localhost:3001"
export CLIENT_ID="app_yourClientId"
export CLIENT_SECRET="pmth_cs_yourSecret"
```

### App-level totals

```bash
curl -sS -u "${CLIENT_ID}:${CLIENT_SECRET}" \
  "${BASE_URL}/api/v1/apps/${CLIENT_ID}/usage"
```

### Breakdown by user

```bash
curl -sS -u "${CLIENT_ID}:${CLIENT_SECRET}" \
  "${BASE_URL}/api/v1/apps/${CLIENT_ID}/usage?groupBy=user"
```

### Date window (ISO 8601)

```bash
curl -sS -u "${CLIENT_ID}:${CLIENT_SECRET}" \
  "${BASE_URL}/api/v1/apps/${CLIENT_ID}/usage?startDate=2026-01-01T00:00:00.000Z&endDate=2026-12-31T23:59:59.999Z"
```

### Date window combined with per-user breakdown

```bash
curl -sS -u "${CLIENT_ID}:${CLIENT_SECRET}" \
  "${BASE_URL}/api/v1/apps/${CLIENT_ID}/usage?groupBy=user&startDate=2026-01-01T00:00:00.000Z&endDate=2026-12-31T23:59:59.999Z"
```

### Filter to a single internal user

`USER_ID` is the internal `endUserId` (obtainable from a prior `groupBy=user` response or the `app_users` table); it is **not** the app's `externalUserId`.

```bash
export USER_ID="internal-app-user-uuid"

curl -sS -u "${CLIENT_ID}:${CLIENT_SECRET}" \
  "${BASE_URL}/api/v1/apps/${CLIENT_ID}/usage?userId=${USER_ID}"
```

### Pretty-print with jq

```bash
curl -sS -u "${CLIENT_ID}:${CLIENT_SECRET}" \
  "${BASE_URL}/api/v1/apps/${CLIENT_ID}/usage?groupBy=user" | jq .
```

## Data model reference

The endpoint aggregates rows from the `usage_records` table:

| Column | Type | Meaning |
|---|---|---|
| `id` | text | Primary key. |
| `request_id` | text | Upstream signer/request identifier; unique together with `client_id`. |
| `user_id` | text (nullable) | Internal `endUserId`; `null` for records not attributable to a provisioned user. |
| `client_id` | text | FK to `developer_apps.id` (internal, not the OAuth `client_id`). The route resolves OAuth `client_id` to this internal id before querying. |
| `model_id` | text (nullable) | Model that serviced the request, if known. Not currently projected in the response. |
| `units` | text | Metered units as a decimal string. Not currently projected in the response. |
| `fee` | text | Fee in wei as a decimal string; summed into `totalFeeWei` / `byUser[].feeWei`. |
| `created_at` | text | ISO 8601 timestamp; used for `startDate` / `endDate` filtering. |

## Security boundaries

- Tenant isolation is enforced by requiring the authenticated client's app to match the path `clientId`; a mismatched but otherwise valid Basic-auth call returns `404`.
- Provider sessions must be the app owner, a platform admin, or a recorded `providerAdmins` team member.
- No secrets, signer material, per-request payloads, or customer PII are returned; the endpoint only exposes aggregate counters and user id correlation.
- Confidential client secrets must stay server-side; do not call this endpoint from the browser with Basic auth.

## Key design decisions and trade-offs

1. **`client_id` as the path tenant identifier.** Consistent with the Builder API and avoids exposing the internal `developer_apps.id`. Internal ids are resolved server-side via `getProviderApp`.
2. **`404` for all auth/tenant-mismatch failures.** Collapsing `401`, `403`, and "wrong app" into `404` prevents enumeration of valid `client_id`s and keeps the surface area small.
3. **`totalFeeWei` as a decimal string.** Fees are wei-denominated and frequently exceed 2^53; returning a string guarantees lossless JSON round-trips in any language.
4. **Aggregation in application code.** Sums and grouping are computed in the route handler rather than SQL. This keeps the Drizzle query trivially portable and lets the handler use `BigInt` arithmetic for fees, at the cost of scanning all matching rows per request. Revisit with SQL aggregation if row counts per app become large.
5. **Per-user grouping is opt-in.** The default response is cheap to compute and safe to poll; `groupBy=user` adds a second query against `app_users` and a larger payload, so it is only run when explicitly requested.
6. **`userId` accepts the internal id, not `externalUserId`.** Keeps the filter a direct index lookup on `usage_records.user_id` and avoids an extra join on the hot path. Callers that only have `externalUserId` must resolve it first via the Builder API.
7. **Inclusive date bounds with no default window.** Omitting dates returns all-time usage, which matches how finance consumers typically reconcile. Callers that need month-to-date must supply explicit bounds.
8. **Unattributed records surface as `endUserId: "unknown"`.** Preferred over silently dropping them so that `totals` always equals the sum of `byUser[].feeWei` (including the `"unknown"` bucket).

## Implementation tasks

- Populate `usage_records.user_id` wherever the request is attributable to a provisioned `app_users` row; otherwise the row ends up in the `"unknown"` bucket.
- Write `usage_records.fee` as a decimal wei string; do not store it as a float or in ETH units.
- Ensure `(client_id, request_id)` is unique at write time to satisfy `idx_usage_records_client_request` and to keep `requestCount` equal to distinct request count.
- When exposing usage in a UI, render `totalFeeWei` / `feeWei` through a BigInt-aware formatter (e.g. `viem`'s `formatEther`).
- For high-volume apps, prefer `groupBy=user` with a bounded `startDate`/`endDate` window; the handler scans all matching rows in memory.
- Rotate client secrets via the app credentials endpoint; Basic auth to this endpoint uses the same credentials.

## Implementation reference

- [`src/app/api/v1/apps/[id]/usage/route.ts`](../src/app/api/v1/apps/[id]/usage/route.ts)
- [`src/lib/auth.ts`](../src/lib/auth.ts) (`authenticateAppClient`)
- [`src/lib/provider-apps.ts`](../src/lib/provider-apps.ts) (`getAuthorizedProviderApp`, `getProviderApp`)
- [`src/db/schema.ts`](../src/db/schema.ts) (`usageRecords`, `appUsers`)
- [Builder API](builder-api.md) for the companion confidential-client and user-provisioning endpoints.
