# PymtHouse documentation (Mintlify)

Public integrator documentation for PymtHouse. Production URL: **https://docs.pymthouse.com**.

## Prerequisites

- Node.js 18 or newer

## Local preview

From the **repository root**:

```bash
npm run docs:dev
```

Or from this directory:

```bash
npx mintlify@latest dev
```

## Validate before opening a pull request

```bash
npm run docs:validate
```

## Deploy to docs.pymthouse.com

1. Create a Mintlify account and install the [Mintlify GitHub app](https://mintlify.com/docs/settings/github) on the PymtHouse organization or repository.
2. In the [Mintlify dashboard](https://dashboard.mintlify.com), create a deployment that points at this repository and set the **docs root** to the `mint-docs` directory (the folder that contains `docs.json`).
3. Under **Custom domain**, add `docs.pymthouse.com` and complete the DNS steps Mintlify provides (typically a `CNAME` to Mintlify’s target).
4. Push changes to your default branch; Mintlify deploys on merge.

Canonical contract text for code review still lives next to the app in `docs/builder-api.md` and `docs/naap-oidc-integration.md`. When those files change, update the matching pages under `mint-docs/integration/` in the same pull request.
