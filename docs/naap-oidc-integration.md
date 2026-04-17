# OIDC integration with PymtHouse

PymtHouse exposes a standards-based OpenID Connect issuer under `/api/v1/oidc`. All clients are treated uniformly as registered application clients (no seeded first-party exceptions).

## Issuer and discovery

- Issuer (local default): `http://localhost:3001/api/v1/oidc`
- Discovery: `{issuer}/.well-known/openid-configuration`
- JWKS: `{issuer}/jwks`
- Authorization endpoint: `{issuer}/auth`
- Token endpoint: `{issuer}/token`
- UserInfo endpoint: `{issuer}/me` (when enabled)

Use discovery metadata in all production integrations to avoid path drift.

## Supported standards and grants

- OAuth 2.0 Authorization Framework (RFC 6749)
- OAuth 2.0 Bearer Token Usage (RFC 6750)
- OAuth 2.0 PKCE (RFC 7636) for public clients
- OAuth 2.0 Token Exchange (RFC 8693)
- OAuth 2.0 Resource Indicators (RFC 8707)
- JWT Profile for OAuth 2.0 Access Tokens (RFC 9068)

Grants in use:
- `authorization_code` (interactive login)
- `refresh_token` (token rotation flows)
- `client_credentials` (machine-to-machine access)
- `urn:ietf:params:oauth:grant-type:token-exchange` (remote signer session exchange and app token exchange)

## Client registration model

- `npm run oidc:seed` now initializes only signing keys.
- Clients are created and managed through app registration (dashboard/API).
- Each confidential client authenticates at the token endpoint using its own `client_id` + `client_secret`.

## Device authorization (RFC 8628) and third-party initiate login

For clients that use the device code grant, the verification URL includes `client_id` and `iss` (PymtHouse issuer) so the browser can optionally send the user to your app’s registered **`initiate_login_uri`** first (OIDC Core — initiating login from a third party).

- **Opt-in:** In app settings, enable **Redirect device verification to initiate login URI** and set **Initiate login URI** to your HTTPS endpoint that accepts `iss`, `target_link_uri`, and optional `login_hint`.
- **Your endpoint** must validate `iss` against discovery (must equal this deployment’s issuer), validate `target_link_uri` (HTTPS, same origin as your app or an allowlisted return URL), then send the user to the OP authorization endpoint or otherwise complete login and redirect to `target_link_uri` so they land back on `/oidc/device` with the same query parameters.
- **Security:** Treat `initiate_login_uri` as a sensitive redirect; use HTTPS only, avoid open redirects on `target_link_uri`, and use CSRF protection on any form that starts login. The OP sets a short-lived cookie so a failed RP round-trip does not loop redirects indefinitely.

## RP-initiated logout

Discovery advertises `end_session_endpoint` (`{issuer}/session/end`). Use it with registered **`post_logout_redirect_uris`** so users return to your app after signing out of the OP session.

## Interactive login (authorization code)

1. Redirect user agent to `{issuer}/auth` with `response_type=code`, `client_id`, `redirect_uri`, `scope`, `state`.
2. Exchange code on your backend at `{issuer}/token` with `grant_type=authorization_code`, same `redirect_uri`, `client_id`, `client_secret`.
3. Request only allowed scopes for that client.

For public clients, PKCE is required. For confidential clients, token endpoint authentication with client secret is required.

## Machine access (client credentials)

Backend services should call:

```http
POST {issuer}/token
grant_type=client_credentials
client_id=...
client_secret=...
scope=...
```

Requested scope must be a subset of the client's configured scope policy.

## Remote signer session exchange (RFC 8693)

PymtHouse supports exchanging a short-lived access token for a long-lived opaque remote signer session token (`pmth_*`) via:

```http
POST {issuer}/token
grant_type=urn:ietf:params:oauth:grant-type:token-exchange
subject_token_type=urn:ietf:params:oauth:token-type:access_token
subject_token=<access_token>
scope=sign:job
```

Security constraints:
- The authenticated `client_id` must match the `subject_token` audience/client binding (`client_id` or `azp` claim).
- The `subject_token` must already contain `sign:job` scope.

Implementation:
- [`src/lib/oidc/gateway-token-exchange.ts`](../src/lib/oidc/gateway-token-exchange.ts)
- [`src/app/api/v1/oidc/[...oidc]/route.ts`](../src/app/api/v1/oidc/[...oidc]/route.ts)

## Related Builder API

For app-user provisioning and user-scoped token issuance, use the Builder API:
- [`docs/builder-api.md`](builder-api.md)

Builder endpoints use `client_id` as the canonical app identifier in URL paths:
- `/api/v1/apps/{clientId}/users`
- `/api/v1/apps/{clientId}/users/{externalUserId}/token`

## Key design decisions and trade-offs

1. All clients use one registration model to remove special-case trust paths.
2. `client_id` is the canonical external app identifier to eliminate ambiguous `appId` mappings.
3. Remote signer session exchange remains RFC 8693-based to preserve explicit, auditable token transitions.
4. Internal DB keys are still used for relational integrity, but external contracts expose `client_id`.

## Implementation tasks

- Register each integrating app as an OIDC client before requesting tokens.
- Rotate confidential client secrets via credentials endpoints.
- Migrate integrations away from deleted legacy `/api/v1/naap/*` routes to OIDC + Builder APIs.
- Verify your integration uses discovery metadata and does not hard-code endpoint paths.

## NextAuth session decrypt errors

If you see repeated `JWT_SESSION_ERROR` or `JWEDecryptionFailed` in local logs:
- Ensure `NEXTAUTH_SECRET` is stable.
- Ensure `.env.local` is not unintentionally overriding `.env`.
- Clear browser cookies for the app origin and sign in again.
