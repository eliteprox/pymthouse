import { LoginForm } from "./login-form";

type SearchParams = Record<string, string | string[] | undefined>;

function sanitizeCallbackUrl(value: unknown): string {
  if (typeof value !== "string") {
    return "/dashboard";
  }

  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  // Reject any URL-like scheme fragment (e.g. "http:") in the callback.
  if (/[a-zA-Z][a-zA-Z\d+.-]*:/.test(value)) {
    return "/dashboard";
  }

  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const callbackUrl = sanitizeCallbackUrl(params.callbackUrl);
  const isAdmin = params.admin === "1";

  return (
    <LoginForm callbackUrl={callbackUrl} isAdmin={isAdmin} />
  );
}
