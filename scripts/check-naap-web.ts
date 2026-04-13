import "./load-env-first";
import { getClient } from "../src/lib/oidc/clients";

async function main() {
  const naapWeb = await getClient("naap-web");
  const naapService = await getClient("naap-service");
  const sdkClient = await getClient("livepeer-sdk");

  console.log("\n=== OIDC Clients Status ===\n");
  
  console.log("✓ naap-web:", naapWeb ? "EXISTS" : "NOT FOUND");
  if (naapWeb) {
    console.log("  - Display Name:", naapWeb.displayName);
    console.log("  - Auth Method:", naapWeb.tokenEndpointAuthMethod);
    console.log("  - Grant Types:", naapWeb.grantTypes);
    console.log("  - Allowed Scopes:", naapWeb.allowedScopes);
    console.log("  - Redirect URIs:", naapWeb.redirectUris?.length || 0, "URIs");
  }

  console.log("\n✓ naap-service:", naapService ? "EXISTS" : "NOT FOUND");
  if (naapService) {
    console.log("  - Display Name:", naapService.displayName);
    console.log("  - Auth Method:", naapService.tokenEndpointAuthMethod);
    console.log("  - Grant Types:", naapService.grantTypes);
  }

  console.log("\n✓ livepeer-sdk:", sdkClient ? "EXISTS" : "NOT FOUND");
  if (sdkClient) {
    console.log("  - Display Name:", sdkClient.displayName);
    console.log("  - Auth Method:", sdkClient.tokenEndpointAuthMethod);
  }

  console.log("\n");
}

main().catch((err) => {
  console.error("Error checking clients:", err);
  process.exit(1);
});
