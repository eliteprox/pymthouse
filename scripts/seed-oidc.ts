import "./load-env-first";
import { ensureSigningKey } from "../src/lib/oidc/jwks";

async function main() {
  console.log("[oidc:seed] Ensuring OIDC signing key exists...");
  const keyPair = await ensureSigningKey();
  console.log(`[oidc:seed] Active signing key: ${keyPair.kid}`);
  console.log("[oidc:seed] Done. Register clients via the dashboard or API.");
}

main().catch((err) => {
  console.error("[oidc:seed] Error:", err);
  process.exit(1);
});
