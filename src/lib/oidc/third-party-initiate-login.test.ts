import test from "node:test";
import assert from "node:assert/strict";

import {
  issuerMatchesExpected,
  normalizeIssuerUrl,
  validateInitiateLoginUri,
  validateDeviceFlowTargetLinkUri,
  buildInitiateLoginRedirectUrl,
} from "./third-party-initiate-login";
import { getIssuer, getPublicOrigin } from "./tokens";

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

test("validateInitiateLoginUri accepts HTTPS without fragment", () => {
  assert.doesNotThrow(() =>
    validateInitiateLoginUri("https://rp.example/oidc/start"),
  );
});

test("validateInitiateLoginUri rejects fragments", () => {
  assert.throws(() => validateInitiateLoginUri("https://rp.example/start#frag"));
});

test("validateDeviceFlowTargetLinkUri enforces /oidc/device on public origin", () => {
  const origin = getPublicOrigin();
  const ok = `${origin}/oidc/device?user_code=ABCD-EFGH&client_id=app_x&iss=${encodeURIComponent(getIssuer())}`;
  assert.doesNotThrow(() => validateDeviceFlowTargetLinkUri(ok));
  assert.throws(() => validateDeviceFlowTargetLinkUri(`${origin}/login`));
});

test("buildInitiateLoginRedirectUrl validates both URIs", () => {
  const origin = getPublicOrigin();
  const target = `${origin}/oidc/device?foo=1`;
  const dest = buildInitiateLoginRedirectUrl("https://rp.example/start", {
    iss: getIssuer(),
    target_link_uri: target,
  });
  assert.match(dest, /^https:\/\/rp\.example\/start\?/);
  assert.ok(dest.includes("target_link_uri="));
});
