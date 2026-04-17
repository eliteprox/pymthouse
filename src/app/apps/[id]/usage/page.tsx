import { redirect } from "next/navigation";

/**
 * Usage analytics live on Billing. Old URL redirects for bookmarks and links.
 */
export default function UsageRedirectPage() {
  redirect("/billing");
}
