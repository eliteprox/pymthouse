import { LoginForm } from "./login-form";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const callbackUrl =
    typeof params.callbackUrl === "string" ? params.callbackUrl : "/dashboard";
  const isAdmin = params.admin === "1";

  return (
    <LoginForm callbackUrl={callbackUrl} isAdmin={isAdmin} />
  );
}
