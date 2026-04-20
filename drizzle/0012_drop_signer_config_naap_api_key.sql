-- Remove deprecated NaaP metrics (NAAP_METRICS_URL / naap API key) integration
ALTER TABLE "signer_config" DROP COLUMN IF EXISTS "naap_api_key";
