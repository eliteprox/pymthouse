CREATE UNIQUE INDEX IF NOT EXISTS "app_allowed_domains_app_id_domain_unique" ON "app_allowed_domains" ("app_id", "domain");
