import test from "node:test";
import assert from "node:assert/strict";

const run = process.env.DATABASE_URL ? test : test.skip;

run("upsert preserves consumed state for existing rows", async () => {
  const { PostgresOidcAdapter } = await import("./adapter");
  const adapter = new PostgresOidcAdapter("DeviceCode");
  const id = "device-code-consume-test";

  await adapter.upsert(
    id,
    {
      jti: id,
      userCode: "ABCD1234",
      clientId: "test-client",
    },
    600,
  );

  await adapter.consume(id);
  const consumed = await adapter.find(id);
  assert.ok(consumed?.consumed);

  await adapter.upsert(
    id,
    {
      jti: id,
      userCode: "ABCD1234",
      clientId: "test-client",
    },
    600,
  );

  const after = await adapter.find(id);
  assert.ok(after?.consumed, "consumed flag should not be cleared by upsert");
});
