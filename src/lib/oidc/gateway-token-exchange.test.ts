import test from "node:test";
import assert from "node:assert/strict";

import {
  handleGatewayTokenExchange,
  isGatewayTokenExchangeRequest,
  SUBJECT_ACCESS_TOKEN_TYPE,
  type GatewayTokenExchangeDeps,
} from "./gateway-token-exchange";
import { TokenExchangeError } from "./token-exchange";
import type { DrizzleDb } from "./client-sibling";

function dbMock(rows: unknown[][]): DrizzleDb {
  let i = 0;
  const next = () => {
    const r = rows[i++];
    if (!r) throw new Error(`db mock exhausted at step ${i}`);
    return Promise.resolve(r);
  };
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => next(),
        }),
      }),
    }),
  } as unknown as DrizzleDb;
}

const dbMockSelectForbidden: DrizzleDb = {
  select: () => {
    throw new Error("unexpected db.select");
  },
} as unknown as DrizzleDb;

const M2M_ID = "m2m_test123";
const PUBLIC_ID = "app_testpublic";

const m2mRowOk = {
  id: "int-m2m",
  clientSecretHash: "hash",
  allowedScopes: "users:token sign:job",
  clientId: M2M_ID,
};

function baseJwtPayload(overrides: Record<string, unknown> = {}) {
  const exp = Math.floor(Date.now() / 1000) + 900;
  return {
    sub: "au-1",
    client_id: PUBLIC_ID,
    exp,
    scope: "sign:job",
    ...overrides,
  };
}

async function rejectsWithCode(
  fn: () => Promise<unknown>,
  code: string,
): Promise<void> {
  await assert.rejects(fn, (err: unknown) => {
    assert.ok(err instanceof TokenExchangeError);
    assert.equal((err as TokenExchangeError).code, code);
    return true;
  });
}

const noopDeps: Partial<GatewayTokenExchangeDeps> = {
  validateClientSecret: async () => true,
  verifyAccessToken: async () => baseJwtPayload(),
  findOrCreateAppEndUser: async () => ({ id: "eu-1", isNew: false }),
  createSession: async () => ({ sessionId: "s1", token: "pmth_testtoken" }),
  writeAuditLog: async () => {},
  createCorrelationId: () => "corr-1",
  resolveDeveloperAppAndPublicClientForOidcRow: async () => ({
    developerAppId: "dev-app-1",
    publicClientId: PUBLIC_ID,
  }),
};

function rowsHappyPathSibling(): unknown[][] {
  return [[m2mRowOk], [{ externalUserId: "ext-1" }]];
}

test("isGatewayTokenExchangeRequest is false for device_code resource", () => {
  assert.equal(
    isGatewayTokenExchangeRequest({
      grantType: "urn:ietf:params:oauth:grant-type:token-exchange",
      clientId: M2M_ID,
      subjectTokenType: SUBJECT_ACCESS_TOKEN_TYPE,
      resource: "urn:pmth:device_code:ABCD-EFGH",
    }),
    false,
  );
});

test("isGatewayTokenExchangeRequest is true without device resource", () => {
  assert.equal(
    isGatewayTokenExchangeRequest({
      grantType: "urn:ietf:params:oauth:grant-type:token-exchange",
      clientId: M2M_ID,
      subjectTokenType: SUBJECT_ACCESS_TOKEN_TYPE,
      resource: "",
    }),
    true,
  );
});

test("handleGatewayTokenExchange success when subject client_id is public sibling", async () => {
  const out = await handleGatewayTokenExchange(
    {
      clientId: M2M_ID,
      clientSecret: "secret",
      subjectToken: "jwt",
      subjectTokenType: SUBJECT_ACCESS_TOKEN_TYPE,
    },
    {
      ...noopDeps,
      db: dbMock(rowsHappyPathSibling()),
      verifyAccessToken: async () => baseJwtPayload(),
      findOrCreateAppEndUser: async () => ({ id: "eu-1", isNew: false }),
    },
  );
  assert.equal(out.access_token, "pmth_testtoken");
  assert.equal(out.scope, "sign:job");
});

test("handleGatewayTokenExchange success legacy subject issued to M2M", async () => {
  const out = await handleGatewayTokenExchange(
    {
      clientId: M2M_ID,
      clientSecret: "secret",
      subjectToken: "jwt",
      subjectTokenType: SUBJECT_ACCESS_TOKEN_TYPE,
    },
    {
      ...noopDeps,
      db: dbMock([[m2mRowOk], [], []]),
      verifyAccessToken: async () =>
        baseJwtPayload({ client_id: M2M_ID, sub: "machine-sub" }),
      findOrCreateAppEndUser: async () => {
        throw new Error("should not resolve app user for machine sub");
      },
    },
  );
  assert.equal(out.access_token, "pmth_testtoken");
});

test("handleGatewayTokenExchange invalid_client when secret invalid", async () => {
  await rejectsWithCode(
    () =>
      handleGatewayTokenExchange(
        {
          clientId: M2M_ID,
          clientSecret: "bad",
          subjectToken: "jwt",
          subjectTokenType: SUBJECT_ACCESS_TOKEN_TYPE,
        },
        {
          ...noopDeps,
          validateClientSecret: async () => false,
          db: dbMockSelectForbidden,
        },
      ),
    "invalid_client",
  );
});

test("handleGatewayTokenExchange invalid_scope without users:token", async () => {
  await rejectsWithCode(
    () =>
      handleGatewayTokenExchange(
        {
          clientId: M2M_ID,
          clientSecret: "secret",
          subjectToken: "jwt",
          subjectTokenType: SUBJECT_ACCESS_TOKEN_TYPE,
        },
        {
          ...noopDeps,
          db: dbMock([
            [
              {
                ...m2mRowOk,
                allowedScopes: "sign:job",
              },
            ],
          ]),
        },
      ),
    "invalid_scope",
  );
});

test("handleGatewayTokenExchange invalid_grant when subject client mismatch", async () => {
  await rejectsWithCode(
    () =>
      handleGatewayTokenExchange(
        {
          clientId: M2M_ID,
          clientSecret: "secret",
          subjectToken: "jwt",
          subjectTokenType: SUBJECT_ACCESS_TOKEN_TYPE,
        },
        {
          ...noopDeps,
          db: dbMock([[m2mRowOk]]),
          verifyAccessToken: async () =>
            baseJwtPayload({ client_id: "app_other_app" }),
        },
      ),
    "invalid_grant",
  );
});

test("handleGatewayTokenExchange invalid_grant without sign:job on subject", async () => {
  await rejectsWithCode(
    () =>
      handleGatewayTokenExchange(
        {
          clientId: M2M_ID,
          clientSecret: "secret",
          subjectToken: "jwt",
          subjectTokenType: SUBJECT_ACCESS_TOKEN_TYPE,
        },
        {
          ...noopDeps,
          db: dbMock([[m2mRowOk]]),
          verifyAccessToken: async () =>
            baseJwtPayload({ scope: "openid" }),
        },
      ),
    "invalid_grant",
  );
});

test("handleGatewayTokenExchange invalid_target when audience wrong", async () => {
  await rejectsWithCode(
    () =>
      handleGatewayTokenExchange(
        {
          clientId: M2M_ID,
          clientSecret: "secret",
          subjectToken: "jwt",
          subjectTokenType: SUBJECT_ACCESS_TOKEN_TYPE,
          audience: ["https://other.example.com"],
        },
        {
          ...noopDeps,
          db: dbMock([[m2mRowOk]]),
        },
      ),
    "invalid_target",
  );
});

test("handleGatewayTokenExchange invalid_target when resource not issuer", async () => {
  await rejectsWithCode(
    () =>
      handleGatewayTokenExchange(
        {
          clientId: M2M_ID,
          clientSecret: "secret",
          subjectToken: "jwt",
          subjectTokenType: SUBJECT_ACCESS_TOKEN_TYPE,
          resource: "https://wrong-resource.example.com",
        },
        {
          ...noopDeps,
          db: dbMock([[m2mRowOk]]),
        },
      ),
    "invalid_target",
  );
});

test("handleGatewayTokenExchange invalid_request when requested_token_type wrong", async () => {
  await rejectsWithCode(
    () =>
      handleGatewayTokenExchange(
        {
          clientId: M2M_ID,
          clientSecret: "secret",
          subjectToken: "jwt",
          subjectTokenType: SUBJECT_ACCESS_TOKEN_TYPE,
          requestedTokenType: "urn:ietf:params:oauth:token-type:refresh_token",
        },
        {
          ...noopDeps,
          db: dbMock([[m2mRowOk]]),
        },
      ),
    "invalid_request",
  );
});

test("handleGatewayTokenExchange accepts resource when equal to issuer", async () => {
  const issuer = (await import("./issuer-urls")).getIssuer();
  const out = await handleGatewayTokenExchange(
    {
      clientId: M2M_ID,
      clientSecret: "secret",
      subjectToken: "jwt",
      subjectTokenType: SUBJECT_ACCESS_TOKEN_TYPE,
      resource: issuer,
    },
    {
      ...noopDeps,
      db: dbMock(rowsHappyPathSibling()),
    },
  );
  assert.equal(out.access_token, "pmth_testtoken");
});
