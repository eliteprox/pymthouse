import test from "node:test";
import assert from "node:assert/strict";

import {
  issuerMatchesExpected,
  normalizeIssuerUrl,
} from "./third-party-initiate-login";
import { getIssuer } from "./tokens";

test("normalizeIssuerUrl trims trailing slashes", () => {
  assert.equal(
    normalizeIssuerUrl("https://op.example/api/v1/oidc/"),
    "https://op.example/api/v1/oidc",
  );
});

test("issuerMatchesExpected compares normalized issuers", () => {
  const iss = getIssuer();
  assert.equal(issuerMatchesExpected(iss, iss), true);
  assert.equal(issuerMatchesExpected("https://wrong.example", iss), false);
  assert.equal(issuerMatchesExpected(null, iss), false);
});
