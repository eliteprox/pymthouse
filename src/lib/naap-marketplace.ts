import { and, eq } from "drizzle-orm";
import { db } from "@/db/index";
import { developerApps, planCapabilityBundles, plans } from "@/db/schema";

const NAAP_PUBLISH_URL = process.env.NAAP_PUBLISH_URL;

export function isNaapPublishConfigured() {
  return !!NAAP_PUBLISH_URL;
}

export async function publishProviderAndPlans(appId: string) {
  if (!NAAP_PUBLISH_URL) {
    return { published: false, reason: "NAAP_PUBLISH_URL not configured" };
  }

  const appRows = await db
    .select()
    .from(developerApps)
    .where(eq(developerApps.id, appId))
    .limit(1);
  const app = appRows[0];
  if (!app) {
    return { published: false, reason: "provider app not found" };
  }

  const providerPlans = await db
    .select()
    .from(plans)
    .where(eq(plans.clientId, appId));
  const capabilities = await db
    .select()
    .from(planCapabilityBundles)
    .where(eq(planCapabilityBundles.clientId, appId));

  const payload = {
    provider: {
      id: app.id,
      name: app.name,
      description: app.description,
      developerName: app.developerName,
      websiteUrl: app.websiteUrl,
      publishedAt: app.publishedAt || new Date().toISOString(),
    },
    plans: providerPlans.map((plan) => ({
      ...plan,
      capabilities: capabilities.filter((capability) => capability.planId === plan.id),
    })),
  };

  const response = await fetch(`${NAAP_PUBLISH_URL}/api/v1/providers/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return {
    published: response.ok,
    status: response.status,
  };
}
