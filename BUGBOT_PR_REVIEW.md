# Bugbot PR Review: Feat/OIDC device auth framework

**PR:** [#10](https://github.com/eliteprox/pymthouse/pull/10)  
**Scope:** OIDC refactor from 7 custom routes to node-oidc-provider

---

## Summary

This PR migrates the OIDC implementation from custom route handlers to `node-oidc-provider`, consolidating auth, token, userinfo, device flow, and related endpoints. The architecture is sound and tests pass. Below are findings from a bug-focused review.

---

## Critical / Security

### 1. Open redirect in `resolveRedirectLocation` (low risk)

**File:** `src/app/api/v1/oidc/[...oidc]/utils.ts`

When `location` is an absolute URL (e.g. `https://evil.com/callback`), the function returns it as-is. The provider should only emit URLs from registered `redirect_uris`, so this is likely safe, but adding an origin check would harden against misconfiguration or future changes:

```typescript
// Consider validating that absolute URLs match our origin or registered client redirect_uris
if (/^https?:\/\//i.test(location)) {
  const locUrl = new URL(location);
  const originUrl = new URL(origin);
  if (locUrl.origin !== originUrl.origin) {
    // Could log or restrict to known client redirect URIs
  }
  return locUrl;
}
```

---

## Potential Bugs

### 2. Unused `InteractionHandler` component

**File:** `src/app/oidc/interaction/interaction-handler.tsx`

`InteractionHandler` is never imported. The interaction page completes login server-side when `prompt.name === "login"`, so this client component appears unused. Either wire it into the flow or remove it to avoid confusion.

### 3. Cookie path vs. interaction URL

**File:** `src/lib/oidc/provider.ts` (lines 336–342)

Cookies use `path: "/"` so they are sent for both `/oidc/interaction` and `/api/v1/oidc/interaction/:uid`. The comment correctly notes this is intentional. No change needed, but worth keeping in mind if paths change.

### 4. `buildNodeRequest` in interaction route omits body for POST

**File:** `src/app/api/v1/oidc/interaction/[uid]/route.ts` (lines 18–38)

`buildNodeRequest` does not push the request body into the stream. The interaction POST handler parses `request.json()` for `action`, but `provider.interactionDetails` and `provider.interactionResult` receive a `req` with no body. The provider may rely on the body for some flows. Verify that node-oidc-provider does not need the POST body for interaction completion; if it does, the body should be forwarded to the mock `IncomingMessage`.

---

## Suggestions

### 5. `loadClients()` runs at provider init only

**File:** `src/lib/oidc/provider.ts`

Clients are loaded once when the provider is created. New or updated OIDC clients require a restart. Consider periodic reloading or a refresh mechanism if clients change at runtime.

### 6. `NEXTAUTH_SECRET` fallback in production

**File:** `src/lib/oidc/provider.ts` (line 335)

```typescript
keys: [process.env.NEXTAUTH_SECRET || "dev-secret-change-me"],
```

The fallback is convenient for local dev but risky if deployed without `NEXTAUTH_SECRET`. Consider failing fast in production when the secret is missing.

### 7. Adapter `consumed_at` handling

**File:** `src/lib/oidc/adapter.ts`

`upsert` does not update `consumed_at`; only `consume()` does. The test confirms that `consumed` is preserved across upserts. This is correct; just noting for future changes.

---

## Positive Notes

- **Hashed client secret comparison** uses `timingSafeEqual` to avoid timing attacks.
- **Adapter cleanup** runs every 10 minutes to prune expired rows.
- **Legacy path aliases** (`/authorize` → `/auth`, etc.) keep compatibility.
- **Plan/entitlements** logic is centralized in `account.ts`, fixing the operator-role bug.
- **Tests** cover `deriveExternalOriginFromHeaders`, `resolveRedirectLocation`, `normalizeUserCode`, adapter behavior, and issuer configuration.

---

## Verdict

**Approve with minor suggestions.** The migration is well-structured and security-sensitive paths (token issuance, client auth, device flow) are handled correctly. The main follow-ups are clarifying the `InteractionHandler` usage and ensuring the interaction POST body is correctly passed to the provider if required.
