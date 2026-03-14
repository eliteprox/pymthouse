import { seedNaapClient, seedSdkClient } from "../src/lib/oidc/clients";
import { ensureSigningKey } from "../src/lib/oidc/jwks";

async function main() {
  console.log("[oidc:seed] Ensuring OIDC signing key exists...");
  const keyPair = await ensureSigningKey();
  console.log(`[oidc:seed] Active signing key: ${keyPair.kid}`);

  console.log("[oidc:seed] Seeding naap OIDC client...");
  seedNaapClient();

  console.log("[oidc:seed] Seeding livepeer-sdk OIDC client...");
  seedSdkClient();

  console.log("[oidc:seed] OIDC setup complete");
}

main().catch((err) => {
  console.error("[oidc:seed] Error:", err);
  process.exit(1);
});
