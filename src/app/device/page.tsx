import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * SDK-compatible device verification route.
 * The Livepeer SDK and similar clients expect /device at the app root.
 * Redirect to our verification UI at /oidc/device, preserving query params.
 */
export default async function DeviceRedirectPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    const v = Array.isArray(value) ? value[0] : value;
    if (v) qs.set(key, v);
  }
  redirect(`/oidc/device${qs.toString() ? `?${qs.toString()}` : ""}`);
}
