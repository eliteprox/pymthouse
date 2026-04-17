import { redirect } from "next/navigation";

/**
 * Billing & usage moved to a single sidebar destination.
 * Keep old deep links working.
 */
export default function AppBillingRedirectPage() {
  redirect("/billing");
}
