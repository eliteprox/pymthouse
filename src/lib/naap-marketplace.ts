/**
 * Marketplace catalog is owned by PymtHouse; NaaP does not ingest provider publish payloads.
 * `NAAP_PUBLISH_URL` is ignored — older env files may still define it without effect.
 */
export function isNaapPublishConfigured() {
  return false;
}

/** No-op: publishing to a NaaP marketplace was removed; listing remains on PymtHouse. */
export async function publishProviderAndPlans(_appId: string) {
  return { published: false, reason: "naap_marketplace_publish_disabled" };
}
