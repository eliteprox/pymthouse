import { redirect } from "next/navigation";

/**
 * Canonical app settings live at `/apps/[id]`. Keep this route for bookmarks
 * and old links.
 */
export default async function AppSettingsRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/apps/${id}`);
}
