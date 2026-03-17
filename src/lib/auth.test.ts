import test from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_PATH = `/tmp/pymthouse-auth-test-${Date.now()}.db`;

test("authenticateRequestAsync still accepts pmth bearer tokens", async () => {
  const { createSession, authenticateRequestAsync } = await import("./auth");
  const { token } = createSession({
    scopes: "gateway",
    expiresInDays: 1,
  });

  const request = {
    headers: new Headers({
      authorization: `Bearer ${token}`,
    }),
  } as any;

  const auth = await authenticateRequestAsync(request);
  assert.ok(auth);
  assert.equal(auth.scopes, "gateway");
});
