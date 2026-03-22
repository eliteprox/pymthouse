import { db } from "@/db/index";
import { developerApps, appAllowedDomains } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { randomBytes, createHash } from "crypto";

export interface CustomDomainConfig {
  appId: string;
  domain: string;
  verified: boolean;
  verificationToken: string | null;
  verifiedAt: string | null;
}

export function generateVerificationToken(): string {
  return `pmth_verify_${randomBytes(16).toString("hex")}`;
}

export function getDnsVerificationRecord(token: string): string {
  return `_pymthouse-verification=${token}`;
}

export function normalizeDomain(domain: string): string {
  return domain.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/^www\./, "");
}

export function getAppByCustomDomain(domain: string): typeof developerApps.$inferSelect | null {
  const normalized = normalizeDomain(domain);
  
  const app = db
    .select()
    .from(developerApps)
    .where(
      and(
        eq(developerApps.customLoginDomain, normalized),
        eq(developerApps.customLoginEnabled, 1)
      )
    )
    .get();

  if (!app || !app.customDomainVerifiedAt) {
    return null;
  }

  return app;
}

export function isVerifiedCustomDomain(domain: string): boolean {
  const app = getAppByCustomDomain(domain);
  return app !== null;
}

export async function verifyDomainOwnership(
  appId: string,
  domain: string
): Promise<{ verified: boolean; error?: string }> {
  const normalized = normalizeDomain(domain);

  const app = db
    .select()
    .from(developerApps)
    .where(eq(developerApps.id, appId))
    .get();

  if (!app) {
    return { verified: false, error: "App not found" };
  }

  if (app.customLoginDomain !== normalized) {
    return { verified: false, error: "Domain does not match configured custom login domain" };
  }

  const verificationToken = app.customDomainVerificationToken;
  if (!verificationToken) {
    return { verified: false, error: "No verification token configured" };
  }

  try {
    const { Resolver } = await import("dns/promises");
    const resolver = new Resolver();
    resolver.setServers(["8.8.8.8", "1.1.1.1"]);

    const expectedRecord = getDnsVerificationRecord(verificationToken);
    const records = await resolver.resolveTxt(`_pymthouse.${normalized}`);
    const flatRecords = records.map(r => r.join(""));

    if (flatRecords.includes(expectedRecord) || flatRecords.includes(verificationToken)) {
      db.update(developerApps)
        .set({
          customDomainVerifiedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(developerApps.id, appId))
        .run();

      return { verified: true };
    }

    return { 
      verified: false, 
      error: `DNS TXT record not found. Add a TXT record for _pymthouse.${normalized} with value: ${verificationToken}` 
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "DNS lookup failed";
    return { verified: false, error: `DNS verification failed: ${message}` };
  }
}

export function setupCustomLoginDomain(
  appId: string,
  domain: string
): { token: string; dnsRecord: string; dnsHost: string } | { error: string } {
  const normalized = normalizeDomain(domain);

  if (!normalized || normalized.includes("/") || !normalized.includes(".")) {
    return { error: "Invalid domain format" };
  }

  const existing = db
    .select()
    .from(developerApps)
    .where(eq(developerApps.customLoginDomain, normalized))
    .get();

  if (existing && existing.id !== appId) {
    return { error: "This domain is already configured for another app" };
  }

  const token = generateVerificationToken();
  const dnsRecord = getDnsVerificationRecord(token);

  db.update(developerApps)
    .set({
      customLoginDomain: normalized,
      customDomainVerificationToken: token,
      customDomainVerifiedAt: null,
      customLoginEnabled: 0,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(developerApps.id, appId))
    .run();

  return {
    token,
    dnsRecord,
    dnsHost: `_pymthouse.${normalized}`,
  };
}

export function enableCustomLoginDomain(appId: string): boolean {
  const app = db
    .select()
    .from(developerApps)
    .where(eq(developerApps.id, appId))
    .get();

  if (!app || !app.customDomainVerifiedAt) {
    return false;
  }

  db.update(developerApps)
    .set({
      customLoginEnabled: 1,
      brandingMode: "whiteLabel",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(developerApps.id, appId))
    .run();

  return true;
}

export function disableCustomLoginDomain(appId: string): void {
  db.update(developerApps)
    .set({
      customLoginEnabled: 0,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(developerApps.id, appId))
    .run();
}

export function removeCustomLoginDomain(appId: string): void {
  db.update(developerApps)
    .set({
      customLoginDomain: null,
      customDomainVerificationToken: null,
      customDomainVerifiedAt: null,
      customLoginEnabled: 0,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(developerApps.id, appId))
    .run();
}

export function getCustomDomainStatus(appId: string): CustomDomainConfig | null {
  const app = db
    .select()
    .from(developerApps)
    .where(eq(developerApps.id, appId))
    .get();

  if (!app || !app.customLoginDomain) {
    return null;
  }

  return {
    appId: app.id,
    domain: app.customLoginDomain,
    verified: !!app.customDomainVerifiedAt,
    verificationToken: app.customDomainVerificationToken,
    verifiedAt: app.customDomainVerifiedAt,
  };
}

export function getTrustedLoginHosts(): string[] {
  const baseHost = process.env.NEXTAUTH_URL 
    ? new URL(process.env.NEXTAUTH_URL).host 
    : "localhost:3001";

  const verifiedDomains = db
    .select({ domain: developerApps.customLoginDomain })
    .from(developerApps)
    .where(
      and(
        eq(developerApps.customLoginEnabled, 1),
      )
    )
    .all()
    .filter(row => row.domain)
    .map(row => row.domain as string);

  return [baseHost, ...verifiedDomains];
}
